// vercel serverless: GET /api/lyrics?artist=&title=&duration=
// word-level synced lyrics when available, line-level fallback.
// 1. lrcmux (real word timestamps, no key) — used only when it has word-level.
// 2. lrclib search (line-level LRC) — fuzzy match, best duration fit.
// responses are edge-cached for a day per query.
export default async function handler(req, res) {
  const artist = String(req.query.artist || "").slice(0, 200);
  const title = String(req.query.title || "").slice(0, 200);
  const duration = parseFloat(req.query.duration) || 0; // seconds
  if (!artist || !title)
    return res.status(400).json({ error: "artist and title required" });

  const cache = () =>
    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate=604800"
    );

  // 1. lrcmux — real word-level timestamps
  try {
    const r = await fetch(
      "https://api.lrcmux.dev/get?artist=" +
        encodeURIComponent(artist) +
        "&title=" +
        encodeURIComponent(title) +
        "&duration=" +
        Math.round(duration),
      { headers: { "User-Agent": "yoshik.xyz/lyrics" } }
    );
    if (r.ok) {
      const d = await r.json();
      if (
        d &&
        d.meta &&
        d.meta.level === "word" &&
        Array.isArray(d.lines) &&
        d.lines.length
      ) {
        const lines = [];
        d.lines.forEach((ln) => {
          const text = (ln.text || "").trim();
          if (!text) return;
          const textWords = text.split(/\s+/);
          const wordStarts = (ln.words || [])
            .filter((w) => w.text && w.text.trim())
            .map((w) => w.start);
          lines.push({
            time: ln.start,
            text,
            words:
              wordStarts.length === textWords.length ? wordStarts : null,
          });
        });
        if (lines.length) {
          cache();
          return res.json({ source: "lrcmux", wordSync: true, lines });
        }
      }
    }
  } catch (e) {}

  // 2. lrclib fallback — line-level
  try {
    const q = encodeURIComponent(title + " " + artist.split(",")[0]);
    const r = await fetch("https://lrclib.net/api/search?q=" + q, {
      headers: { "User-Agent": "yoshik.xyz/lyrics" },
    });
    if (r.status === 429) return res.status(429).json({ error: "rate-limited" });
    const arr = r.ok ? await r.json() : [];
    let best = null,
      bestScore = Infinity;
    (arr || []).forEach((x) => {
      const score =
        Math.abs((x.duration || 0) - duration) + (x.syncedLyrics ? 0 : 1e9);
      if (score < bestScore) {
        bestScore = score;
        best = x;
      }
    });
    if (best && best.syncedLyrics) {
      const lines = parseLRC(best.syncedLyrics).map((l) => ({
        time: l.time,
        text: l.text,
        words: null, // frontend interpolates
      }));
      if (lines.length) {
        cache();
        return res.json({ source: "lrclib", wordSync: false, lines });
      }
    }
    if (best && best.plainLyrics) {
      cache();
      return res.json({ source: "lrclib", wordSync: false, plain: best.plainLyrics });
    }
    return res.json({ source: "none", lines: [] });
  } catch (e) {
    return res.status(502).json({ error: "lyrics upstream failed" });
  }
}

function parseLRC(lrc) {
  const lines = [];
  lrc.split("\n").forEach((raw) => {
    const times = [];
    const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    let m;
    while ((m = re.exec(raw))) {
      const frac = m[3] || "0";
      const mult = frac.length === 3 ? 1 : frac.length === 2 ? 10 : 100;
      times.push(+m[1] * 60000 + +m[2] * 1000 + +frac * mult);
    }
    const text = raw
      .replace(/\[.*?\]/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (!text || !times.length) return;
    times.forEach((t) => lines.push({ time: t, text }));
  });
  lines.sort((a, b) => a.time - b.time);
  return lines.filter((l, i) => i === 0 || l.time !== lines[i - 1].time);
}
