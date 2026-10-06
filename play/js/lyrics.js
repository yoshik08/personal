/* lyrics: fetch once per track, sync locally against audio clock.
   word-level: letters fade within real word timing windows.
   line-level: active line highlight only. */
(function () {
"use strict";
const { utils, api } = window.Play;

const lyrics = {
  data: null,      /* {source, wordSync, lines} */
  trackId: null,
  state: "idle",   /* idle | loading | ready | none | error */
  raf: 0,
  container: null,
  compact: false,
  autoScroll: true,

  async load(track, container, compact) {
    this.unload();
    this.container = container;
    this.compact = !!compact;
    this.trackId = track.id;
    this.state = "loading";
    this.render();
    try {
      const d = await api.get(
        `/api/lyrics?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}&duration=${track.duration || 0}`);
      if (this.trackId !== track.id) return; /* stale */
      if (d.lines && d.lines.length) {
        this.data = d;
        this.state = "ready";
        this.buildWordSpans();
      } else if (d.plain) {
        this.data = { ...d, lines: d.plain.split("\n").filter(Boolean).map((text) => ({ time: 0, text, words: null })) };
        this.state = "ready";
      } else {
        this.state = "none";
      }
    } catch (e) {
      if (this.trackId !== track.id) return;
      this.state = "error";
    }
    this.render();
    if (this.state === "ready") this.start();
  },

  unload() {
    cancelAnimationFrame(this.raf);
    this.data = null; this.trackId = null; this.state = "idle";
  },

  buildWordSpans() {
    /* precompute per-line word spans for the word-sync renderer */
    this.data.lines.forEach((ln) => {
      if (!ln.words || !utils.motionOK()) { ln._spans = null; return; }
      const words = ln.text.split(/\s+/);
      ln._spans = words.map((w, i) => ({
        word: w,
        start: ln.words[i] != null ? ln.words[i] : ln.time,
        end: ln.words[i + 1] != null ? ln.words[i + 1] : (ln.time + 4000),
      }));
    });
  },

  render() {
    const c = this.container;
    if (!c) return;
    const { esc } = utils;
    if (this.state === "loading") {
      c.innerHTML = `<div class="lyrics-head"><h3>lyrics</h3></div>` +
        [0, 1, 2, 3].map(() => `<div class="skel" style="height:28px;margin:10px 0"></div>`).join("");
      return;
    }
    if (this.state === "none" || this.state === "error") {
      c.innerHTML = `<div class="lyrics-head"><h3>lyrics</h3></div>
        <div class="empty" style="padding:30px"><div class="big">♪</div>
        <p>${this.state === "error" ? "couldn't load lyrics" : "no lyrics for this track"}</p></div>`;
      return;
    }
    if (this.state !== "ready" || !this.data) return;
    const lines = this.data.lines.map((ln, i) => {
      let inner = esc(ln.text);
      if (ln._spans) {
        inner = ln._spans.map((s) => {
          const chars = esc(s.word).split("").map((ch) => `<span class="ch">${ch}</span>`).join("");
          return `<span class="w" data-s="${s.start}" data-e="${s.end}">${chars}</span> `;
        }).join("");
      }
      return `<div class="ly-line" data-i="${i}" data-t="${ln.time}">${inner}</div>`;
    }).join("");
    c.innerHTML = `<div class="lyrics-head"><h3>lyrics · ${esc(this.data.source)}</h3>
      <button class="txtbtn" id="ly-compact">${this.compact ? "expand" : "compact"}</button></div>
      <div class="lyrics${this.compact ? " ly-compact" : ""}" id="ly-body">${lines}</div>`;
    c.querySelector("#ly-compact").onclick = () => {
      this.compact = !this.compact;
      this.render();
      this.start();
    };
    c.querySelectorAll(".ly-line").forEach((el) => {
      el.onclick = () => {
        const t = parseFloat(el.dataset.t) / 1000;
        const p = window.Play.player;
        if (p.audio.duration) { p.audio.currentTime = t; this.autoScroll = true; }
      };
    });
    /* pause auto-scroll while user scrolls manually */
    const body = c.querySelector("#ly-body");
    let scrollT;
    body.addEventListener("scroll", () => {
      this.autoScroll = false;
      clearTimeout(scrollT);
      scrollT = setTimeout(() => { this.autoScroll = true; }, 4000);
    });
  },

  start() {
    cancelAnimationFrame(this.raf);
    const p = window.Play.player;
    const motionOK = utils.motionOK();
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (!this.data || !this.container) return;
      const nowMs = (p.audio.currentTime || 0) * 1000;
      const lines = this.data.lines;
      let active = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].time <= nowMs) active = i; else break;
      }
      const els = this.container.querySelectorAll(".ly-line");
      els.forEach((el, i) => {
        const isActive = i === active;
        el.classList.toggle("active", isActive);
        el.classList.toggle("past", i < active);
        if (isActive && motionOK) {
          const ln = lines[i];
          if (ln._spans) {
            el.querySelectorAll(".w").forEach((w) => {
              const s = parseFloat(w.dataset.s), e = parseFloat(w.dataset.e);
              const lit = nowMs >= s;
              w.querySelectorAll(".ch").forEach((ch, ci, arr) => {
                /* letters fade progressively through the word window */
                const frac = arr.length <= 1 ? 1 : ci / (arr.length - 1);
                ch.classList.toggle("lit", lit && nowMs >= s + (e - s) * frac * 0.7);
              });
            });
          }
        }
      });
      if (active >= 0 && this.autoScroll) {
        const ael = els[active];
        if (ael) {
          const body = this.container.querySelector("#ly-body");
          // center active line vertically in the pane
          const top = ael.offsetTop - body.clientHeight / 2 + ael.clientHeight / 2;
          body.scrollTo({ top, behavior: motionOK ? "smooth" : "auto" });
        }
      }
    };
    tick();
  },
};

window.Play.lyrics = lyrics;
})();
