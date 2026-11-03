/* lyrics: fetched once per song, synced to the audio clock on rAF.
   word timings (lrcmux) fill each word as it's sung; line timings (lrclib)
   light the line. auto-scroll pauses while you scroll by hand. */
import { api, esc, motionOK } from "./core.js";
import { player } from "./player.js";

const memo = new Map(); // song id → promise of {source, lines|plain}

function fetchLyrics(song) {
  const key = song.id + "|" + song.name + "|" + (song.artist || "");
  if (!memo.has(key)) {
    const q = `?artist=${encodeURIComponent(song.artist || "")}&title=${encodeURIComponent(song.name)}&duration=${Math.round(song.duration || 0)}`;
    const p = api.get("/api/lyrics" + q, { timeout: 30000 });
    p.catch(() => memo.delete(key));
    memo.set(key, p);
  }
  return memo.get(key);
}

/** with gaps of silence marked by a breathing "•••" line, like Apple Music */
function withInterludes(lines) {
  const out = [];
  if (lines.length && lines[0].time > 5000) out.push({ time: 400, end: lines[0].time - 300, dots: true });
  lines.forEach((ln, i) => {
    out.push(ln);
    const next = lines[i + 1];
    if (!next) return;
    const lineEnd = ln.words && ln.words.length ? ln.words[ln.words.length - 1] + 1200 : ln.time + 4500;
    if (next.time - lineEnd > 7000) out.push({ time: lineEnd, end: next.time - 300, dots: true });
  });
  return out;
}

export class LyricsView {
  constructor(host) {
    this.host = host;
    this.song = null;
    this.lines = [];
    this.active = -2;
    this.raf = 0;
    this.userScrollUntil = 0;
    this.visible = false;
    host.addEventListener("wheel", () => this.userScrolled(), { passive: true });
    host.addEventListener("touchmove", () => this.userScrolled(), { passive: true });
    host.addEventListener("click", (e) => {
      const el = e.target.closest(".ly-line[data-t]");
      if (!el) return;
      player.seekTo(parseFloat(el.dataset.t) / 1000);
      if (!player.isPlaying) player.play();
      this.userScrollUntil = 0;
      this.active = -2;
    });
  }

  userScrolled() {
    this.userScrollUntil = performance.now() + 3500;
    this.host.classList.add("free");
  }

  async show(song) {
    if (!song) { this.host.innerHTML = ""; this.song = null; return; }
    if (this.song && this.song.id === song.id && this.song.name === song.name && this.song.artist === song.artist) return;
    this.song = song;
    this.lines = [];
    this.active = -2;
    this.host.classList.remove("free");
    this.host.innerHTML = `<div class="ly-state"><div class="ly-skel"><i></i><i></i><i></i><i></i></div></div>`;
    let d;
    try { d = await fetchLyrics(song); }
    catch (e) {
      if (this.song !== song) return;
      this.host.innerHTML = `<div class="ly-state"><p>Couldn't load lyrics</p><button class="btn ghost sm" data-retry>Try again</button></div>`;
      this.host.querySelector("[data-retry]").onclick = () => { this.song = null; this.show(song); };
      return;
    }
    if (this.song !== song) return;
    if (d.lines && d.lines.length) {
      this.lines = withInterludes(d.lines);
      this.render(d.source, true);
    } else if (d.plain) {
      this.lines = d.plain.split("\n").map((text) => ({ text: text.trim() })).filter((l) => l.text);
      this.render(d.source, false);
    } else {
      this.host.innerHTML = `<div class="ly-state"><p class="ly-none">No lyrics found for this song</p>
        <p class="ly-hint">${song.artist ? "" : "Adding the artist name (Edit info) helps find them."}</p></div>`;
    }
    this.start();
  }

  render(source, synced) {
    const motion = motionOK();
    const html = this.lines.map((ln, i) => {
      if (ln.dots) return `<div class="ly-line ly-dots" data-i="${i}" data-t="${ln.time}"><span></span><span></span><span></span></div>`;
      let inner;
      if (synced && ln.words && motion) {
        const ws = ln.text.split(/\s+/);
        inner = ws.map((w, j) => `<span class="w" data-j="${j}">${esc(w)}</span>`).join(" ");
      } else inner = esc(ln.text);
      return `<div class="ly-line${synced ? "" : " plain"}" data-i="${i}"${synced ? ` data-t="${ln.time}"` : ""}>${inner}</div>`;
    }).join("");
    this.host.innerHTML = `<div class="ly-pad"></div>${html}<div class="ly-pad"></div>
      <div class="ly-credit">${synced ? "" : "Not time-synced · "}lyrics from ${esc(source)}</div>`;
    this.synced = synced;
    this.els = [...this.host.querySelectorAll(".ly-line")];
  }

  setVisible(v) { this.visible = v; if (v) { this.active = -2; this.start(); } }

  start() {
    cancelAnimationFrame(this.raf);
    if (!this.synced || !this.lines.length) return;
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (!this.visible || document.hidden) return;
      this.frame(player.time * 1000);
    };
    tick();
  }
  stop() { cancelAnimationFrame(this.raf); }

  frame(now) {
    const lines = this.lines;
    let a = -1;
    for (let i = 0; i < lines.length; i++) { if (lines[i].time <= now) a = i; else break; }
    if (a !== this.active) {
      const prev = this.active;
      this.active = a;
      this.els.forEach((el, i) => {
        el.classList.toggle("on", i === a);
        el.classList.toggle("past", i < a);
        const d = Math.abs(i - a);
        el.style.setProperty("--d", Math.min(d, 6));
      });
      if (prev >= 0 && this.els[prev]) this.els[prev].querySelectorAll(".w").forEach((w) => w.style.removeProperty("--p"));
      if (performance.now() > this.userScrollUntil) {
        this.host.classList.remove("free");
        const el = this.els[Math.max(0, a)];
        if (el) {
          const top = el.offsetTop - this.host.clientHeight * 0.36;
          this.host.scrollTo({ top, behavior: motionOK() && prev !== -2 ? "smooth" : "auto" });
        }
      }
    }
    // word fill inside the active line
    const ln = lines[a];
    if (ln && ln.words) {
      const el = this.els[a];
      const next = lines[a + 1];
      const ws = el.querySelectorAll(".w");
      for (let j = 0; j < ws.length; j++) {
        const s = ln.words[j];
        const e = ln.words[j + 1] != null ? ln.words[j + 1] : Math.min(next ? next.time : s + 800, s + 1200);
        const p = now <= s ? 0 : now >= e ? 1 : (now - s) / (e - s);
        const v = p.toFixed(3);
        if (ws[j]._p !== v) { ws[j]._p = v; ws[j].style.setProperty("--p", v); }
      }
    }
    if (ln && ln.dots) {
      const p = Math.min(1, Math.max(0, (now - ln.time) / Math.max(1, ln.end - ln.time)));
      this.els[a].style.setProperty("--p", p.toFixed(3));
    }
  }
}
