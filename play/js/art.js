/* artwork: generative covers for songs without art, and accent colour
   extraction from real covers (drives the now-playing light + accents). */

export function hash(s) {
  let x = 2166136261;
  s = String(s || "");
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
const hueOf = (seed) => hash(seed) % 360;

const genCache = new Map();
/** deterministic cover: two soft light sources + vinyl grooves, as an svg data url */
export function genArt(seed) {
  seed = String(seed || "play");
  if (genCache.has(seed)) return genCache.get(seed);
  const n = hash(seed);
  const h1 = n % 360, h2 = (h1 + 35 + (n >> 9) % 90) % 360;
  const x1 = 18 + (n >> 3) % 40, y1 = 14 + (n >> 7) % 36;
  const x2 = 55 + (n >> 11) % 35, y2 = 52 + (n >> 13) % 38;
  const cx = 30 + (n >> 5) % 40, cy = 30 + (n >> 15) % 40;
  let rings = "";
  for (let r = 6; r < 120; r += 5.5) rings += `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
<defs>
<radialGradient id="a" cx="${x1}%" cy="${y1}%" r="75%"><stop offset="0" stop-color="hsl(${h1} 85% 62%)"/><stop offset="1" stop-color="hsl(${h1} 85% 62%)" stop-opacity="0"/></radialGradient>
<radialGradient id="b" cx="${x2}%" cy="${y2}%" r="70%"><stop offset="0" stop-color="hsl(${h2} 80% 55%)"/><stop offset="1" stop-color="hsl(${h2} 80% 55%)" stop-opacity="0"/></radialGradient>
</defs>
<rect width="100" height="100" fill="hsl(${h1} 30% 7%)"/>
<rect width="100" height="100" fill="url(#a)" opacity=".9"/>
<rect width="100" height="100" fill="url(#b)" opacity=".75"/>
<g fill="none" stroke="#fff" stroke-opacity=".07" stroke-width=".35">${rings}</g>
<circle cx="${cx}" cy="${cy}" r="2.2" fill="#000" fill-opacity=".35"/>
</svg>`;
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/\n/g, ""));
  genCache.set(seed, url);
  return url;
}

export const artOf = (song) => (song && song.artworkUrl) || genArt(song ? song.id || song.name : "");
export const fallbackOf = (song) => genArt(song ? song.id || song.name : "");

/* broken cover urls fall back to the generative cover (images carry data-fb) */
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img && img.tagName === "IMG" && img.dataset.fb && img.src !== img.dataset.fb) img.src = img.dataset.fb;
}, true);

/* ---------- accent colour ---------- */
const accentCache = new Map();
function hsl(hh, s, l) { return `hsl(${Math.round(hh)} ${Math.round(s)}% ${Math.round(l)}%)`; }
function seedAccent(seed) { return hsl(hueOf(seed), 80, 68); }

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let hh = 0, s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh *= 60;
  }
  return [hh, s * 100, l * 100];
}

/** vivid, readable-on-black accent for a song. resolves fast, never throws. */
export function accentOf(song) {
  const seed = song ? song.id || song.name : "";
  const url = song && song.artworkUrl;
  if (!url) return Promise.resolve(seedAccent(seed));
  if (accentCache.has(url)) return Promise.resolve(accentCache.get(url));
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const done = (c) => { accentCache.set(url, c); resolve(c); };
    const t = setTimeout(() => done(seedAccent(seed)), 2500);
    img.onload = () => {
      clearTimeout(t);
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 28;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, 28, 28);
        const d = ctx.getImageData(0, 0, 28, 28).data;
        // hue histogram weighted by saturation × mid-lightness: picks the colour you notice
        const bins = new Array(36).fill(0), sat = new Array(36).fill(0);
        let total = 0;
        for (let i = 0; i < d.length; i += 4) {
          const [hh, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
          const w = (s / 100) * (1 - Math.abs(l - 50) / 50);
          const b = Math.floor(hh / 10) % 36;
          bins[b] += w; sat[b] += s * w; total += w;
        }
        let best = 0;
        for (let i = 1; i < 36; i++) if (bins[i] > bins[best]) best = i;
        if (total < 4 || bins[best] < 1) return done(hsl(0, 0, 86)); // greyscale cover → soft white
        const s = Math.min(92, Math.max(55, sat[best] / bins[best] + 10));
        done(hsl(best * 10 + 5, s, 68));
      } catch (e) { done(seedAccent(seed)); } // tainted canvas (no cors) → seeded colour
    };
    img.onerror = () => { clearTimeout(t); done(seedAccent(seed)); };
    img.src = url;
  });
}
