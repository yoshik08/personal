/* app: hash router, shell wiring, player bar, now-playing overlay */
(function () {
"use strict";
const { utils, api, toast } = window.Play;
const { esc, fmtTime } = utils;
const auth = () => window.Play.auth;
const player = () => window.Play.player;
const views = () => window.Play.views;
const lyrics = () => window.Play.lyrics;

/* ---------- router ---------- */
const routes = [
  [/^#\/?$/, (v) => views().home(v)],
  [/^#\/settings$/, (v) => views().settings(v)],
];
function route() {
  const h = location.hash || "#/";
  const v = document.getElementById("view");
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      window.Play.analytics.track("page_view", { route: h.split("?")[0].slice(0, 40) });
      fn(v, m);
      document.querySelectorAll("[data-route]").forEach((a) => {
        const r = a.dataset.route;
        const active = (r === "home" && /^#\/?$/.test(h)) || h.startsWith("#/" + r);
        a.classList.toggle("active", !!active);
      });
      document.getElementById("main").scrollTop = 0;
      return;
    }
  }
  v.innerHTML = `<div class="empty"><div class="big">?</div><p>not found.</p></div>`;
}

/* ---------- userbox ---------- */
function renderUserbox() {
  const u = auth().user;
  document.getElementById("userbox").innerHTML = u
    ? `<div style="display:flex;align-items:center;gap:10px">
        <span style="font-weight:600">${esc(u.name)}</span></div>`
    : `<a href="#/settings" class="txtbtn">sign in</a>`;
}

/* ---------- player bar / mini player / now playing ---------- */
function syncPlayerUI() {
  const p = player();
  const t = p.currentTrack;
  const show = !!t;
  document.getElementById("playerbar").hidden = !show;
  const mp = document.getElementById("miniplayer");
  mp.hidden = !show;

  ["pb", "mp", "np"].forEach((pfx) => {
    const art = document.getElementById(pfx + "-art");
    if (art && t) { art.src = t.albumArt || ""; art.alt = t.title || ""; }
    const ti = document.getElementById(pfx + "-title");
    if (ti) ti.textContent = t ? t.title : "";
    const ar = document.getElementById(pfx + "-artist");
    if (ar) ar.textContent = t ? (t.artists || t.artist || "unknown artist") : "";
  });

  const icon = p.isPlaying ? "⏸" : "▶";
  ["pb-toggle", "mp-toggle", "np-toggle"].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.textContent = icon;
  });

  const mpStatus = document.getElementById("mp-status");
  if (mpStatus) mpStatus.textContent = p.loading ? "loading…" : "";

  /* shuffle / repeat */
  [["pb-shuffle", "np-shuffle"], ["pb-repeat", "np-repeat"]].forEach(([a, b]) => {
    [a, b].forEach((id) => {
      const x = document.getElementById(id);
      if (!x) return;
      if (id.includes("shuffle")) x.classList.toggle("on", p.shuffle);
      else { x.classList.toggle("on", p.repeat !== "off"); x.textContent = p.repeat === "one" ? "↻¹" : "↻"; }
    });
  });
}
function syncTime() {
  const p = player();
  const a = p.audio;
  const cur = a.currentTime || 0, dur = a.duration || p.currentTrack?.duration || 0;
  [["pb-cur", "pb-dur", "pb-range"], ["np-cur", "np-dur", "np-range"]].forEach(([c, d, r]) => {
    const ce = document.getElementById(c), de = document.getElementById(d), re = document.getElementById(r);
    if (ce) ce.textContent = fmtTime(cur);
    if (de) de.textContent = fmtTime(dur);
    if (re && dur) re.value = Math.round((cur / dur) * 1000);
  });
}

function openNowPlaying() {
  if (!player().currentTrack) return;
  document.getElementById("nowplaying").hidden = false;
  document.getElementById("lyricspanel").hidden = false;
  document.getElementById("queuepanel").hidden = true;
  lyrics().load(player().currentTrack, document.getElementById("lyricspanel"), false);
  renderQueue();
  syncPlayerUI();
}
function closeNowPlaying() {
  document.getElementById("nowplaying").hidden = true;
  lyrics().unload();
}
function renderQueue() {
  const p = player();
  const qp = document.getElementById("queuepanel");
  qp.innerHTML = `<div class="lyrics-head"><h3>queue · ${p.queue.length}</h3>
    <button class="txtbtn" id="qclear">clear</button></div>` +
    (p.queue.length ? p.queue.map((t, i) =>
      `<div class="q-item${i === p.queueIndex ? " current" : ""}" data-i="${i}" tabindex="0" role="button">
        <img loading="lazy" src="${esc(t.albumArt || "")}" alt="" onerror="this.style.visibility='hidden'">
        <div style="flex:1;min-width:0"><div style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t.title)}</div>
        <div class="dim" style="font-size:12px">${esc(t.artists || t.artist || "unknown artist")}</div></div>
        ${i !== p.queueIndex ? `<button class="iconbtn" data-rm aria-label="remove">✕</button>` : `<span class="dim mono" style="font-size:11px">playing</span>`}
      </div>`).join("")
      : `<div class="empty"><p>queue is empty.</p></div>`);
  qp.querySelector("#qclear").onclick = () => { p.clearQueue(); renderQueue(); };
  qp.querySelectorAll(".q-item").forEach((row) => {
    const i = +row.dataset.i;
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-rm]")) return;
      p.playAt(i); renderQueue();
    });
    row.querySelector("[data-rm]")?.addEventListener("click", (e) => {
      e.stopPropagation(); p.removeFromQueue(i); renderQueue();
    });
  });
}

/* ---------- wire up ---------- */
function init() {
  const p = player();
  p.init();
  auth().init();

  /* motion pref */
  try {
    const m = localStorage.getItem("play_motion");
    if (m) document.documentElement.dataset.motion = m;
  } catch (e) {}

  window.addEventListener("hashchange", route);
  document.addEventListener("auth", () => {
    renderUserbox();
    if (/^#\/settings/.test(location.hash)) route();
  });

  p.on("track", () => {
    syncPlayerUI();
    if (!document.getElementById("nowplaying").hidden && p.currentTrack) {
      lyrics().load(p.currentTrack, document.getElementById("lyricspanel"), lyrics().compact);
    }
  });
  p.on("state", syncPlayerUI);
  p.on("time", syncTime);
  p.on("download", syncPlayerUI);
  p.on("queue", () => { if (!document.getElementById("queuepanel").hidden) renderQueue(); });

  /* transport buttons */
  const wire = (id, fn) => document.getElementById(id)?.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
  wire("pb-toggle", () => p.toggle()); wire("mp-toggle", () => p.toggle()); wire("np-toggle", () => p.toggle());
  wire("pb-prev", () => p.prev()); wire("np-prev", () => p.prev());
  wire("pb-next", () => p.next()); wire("np-next", () => p.next());
  wire("pb-shuffle", () => p.toggleShuffle()); wire("np-shuffle", () => p.toggleShuffle());
  wire("pb-repeat", () => p.cycleRepeat()); wire("np-repeat", () => p.cycleRepeat());
  wire("pb-expand", openNowPlaying);
  wire("np-close", closeNowPlaying);
  document.getElementById("miniplayer").addEventListener("click", (e) => {
    if (e.target.closest("#mp-toggle")) return;
    openNowPlaying();
  });
  wire("pb-lyrics", () => { openNowPlaying(); showLyricsTab(); });
  wire("pb-queue", () => { openNowPlaying(); showQueueTab(); });
  wire("np-lyricsbtn", showLyricsTab);
  wire("np-queuebtn", showQueueTab);

  const seek = (frac) => p.seek(frac);
  document.getElementById("pb-range").addEventListener("input", (e) => seek(e.target.value / 1000));
  document.getElementById("np-range").addEventListener("input", (e) => seek(e.target.value / 1000));
  document.getElementById("pb-vol").addEventListener("input", (e) => p.setVolume(e.target.value / 100));
  document.getElementById("pb-vol").value = Math.round(p.volume * 100);

  renderUserbox();
  route();
  syncPlayerUI();
}
function showLyricsTab() {
  document.getElementById("lyricspanel").hidden = false;
  document.getElementById("queuepanel").hidden = true;
  document.getElementById("np-lyricsbtn").classList.add("on");
  document.getElementById("np-queuebtn").classList.remove("on");
}
function showQueueTab() {
  document.getElementById("lyricspanel").hidden = true;
  document.getElementById("queuepanel").hidden = false;
  document.getElementById("np-queuebtn").classList.add("on");
  document.getElementById("np-lyricsbtn").classList.remove("on");
  renderQueue();
}

document.addEventListener("DOMContentLoaded", init);
})();
