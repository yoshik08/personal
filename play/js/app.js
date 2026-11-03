/* app: shell, router, player dock, now playing, drag & drop, keyboard */
import { $, $$, h, esc, bus, api, toast, fmtTime, clamp, A, spring, motionOK, store, closeTopSheet, closeMenu, enter } from "./core.js";
import { icon } from "./icons.js";
import { auth } from "./auth.js";
import { lib } from "./library.js";
import { player } from "./player.js";
import { LyricsView } from "./lyrics.js";
import { artOf, fallbackOf, accentOf } from "./art.js";
import { reviewUploads, chooseFiles } from "./upload.js";
import * as views from "./views.js";

const root = document.documentElement;
const phone = () => matchMedia("(max-width: 900px)").matches;

/* ---------- static shell ---------- */
function shell() {
  const nav = [["library", "#/", "vinyl-record", "Library"], ["playlists", "#/playlists", "playlist", "Playlists"], ["settings", "#/settings", "gear-six", "Settings"]];
  $("#side").innerHTML = `<a class="brand" href="#/" aria-label="play — home"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>play</span></a>
    <nav class="nav">${nav.map(([r, href, ic, label]) => `<a href="${href}" data-route="${r}"><span class="ni">${icon(ic)}${icon(ic, true)}</span>${label}</a>`).join("")}
      <button class="nav-add" data-add>${icon("plus")}Add music</button></nav>
    <div class="side-pls" id="sidepls"></div>
    <div class="side-foot" id="userbox"></div>`;
  $("#tabs").innerHTML = nav.map(([r, href, ic, label]) => `<a href="${href}" data-route="${r}"><span class="ni">${icon(ic)}${icon(ic, true)}</span><span>${label}</span></a>`).join("");
  $("#side [data-add]").onclick = () => auth.user ? chooseFiles() : auth.signIn();

  $("#dock").innerHTML = `
    <div class="dk-line"><i></i></div>
    <button class="dk-art" data-open aria-label="Open now playing"><img alt=""></button>
    <button class="dk-meta" data-open><span class="dk-t"></span><span class="dk-a"></span></button>
    <div class="dk-center">
      <div class="dk-ctrls">
        <button class="iconbtn tog" data-act="shuffle" aria-label="Shuffle">${icon("shuffle")}</button>
        <button class="iconbtn" data-act="prev" aria-label="Previous">${icon("skip-back", true)}</button>
        <button class="pp" data-act="toggle" aria-label="Play">${icon("play", true, "i-play")}${icon("pause", true, "i-pause")}<span class="pp-spin"></span></button>
        <button class="iconbtn" data-act="next" aria-label="Next">${icon("skip-forward", true)}</button>
        <button class="iconbtn tog" data-act="repeat" aria-label="Repeat">${icon("repeat", false, "i-rep")}${icon("repeat-once", false, "i-rep1")}</button>
      </div>
      <div class="dk-seek"><span class="t-cur">0:00</span><div class="scrub" data-scrub="seek"></div><span class="t-dur">0:00</span></div>
    </div>
    <div class="dk-right">
      <button class="iconbtn tog" data-act="lyrics" aria-label="Lyrics">${icon("microphone-stage")}</button>
      <button class="iconbtn tog" data-act="queue" aria-label="Queue">${icon("queue")}</button>
      <div class="vol"><button class="iconbtn" data-act="mute" aria-label="Mute">${icon("speaker-high", false, "i-vol")}${icon("speaker-x", false, "i-mute")}</button><div class="scrub vol-s" data-scrub="vol"></div></div>
    </div>
    <button class="pp mini-pp" data-act="toggle" aria-label="Play">${icon("play", true, "i-play")}${icon("pause", true, "i-pause")}<span class="pp-spin"></span></button>
    <button class="iconbtn mini-next" data-act="next" aria-label="Next">${icon("skip-forward", true)}</button>`;

  $("#np").innerHTML = `
    <div class="np-bg" aria-hidden="true"><img class="b1" alt=""><img class="b2" alt=""><div class="np-veil"></div></div>
    <header class="np-top"><button class="iconbtn lg" data-close-np aria-label="Close">${icon("caret-down")}</button>
      <div class="np-src"><span>Playing from</span><b></b></div>
      <button class="iconbtn lg" data-np-more aria-label="More">${icon("dots-three")}</button></header>
    <div class="np-body">
      <div class="np-left">
        <div class="np-art"><img alt=""></div>
        <div class="np-mini"><img alt=""><div><b class="np-t2"></b><span class="np-a2"></span></div></div>
        <div class="np-info"><h2 class="np-t"></h2><p class="np-a"></p></div>
        <div class="np-seek"><div class="scrub big" data-scrub="seek"></div><div class="np-times"><span class="t-cur">0:00</span><span class="t-left">-0:00</span></div></div>
        <div class="np-ctrls">
          <button class="iconbtn tog" data-act="shuffle" aria-label="Shuffle">${icon("shuffle")}</button>
          <button class="iconbtn xl" data-act="prev" aria-label="Previous">${icon("skip-back", true)}</button>
          <button class="pp xxl" data-act="toggle" aria-label="Play">${icon("play", true, "i-play")}${icon("pause", true, "i-pause")}<span class="pp-spin"></span></button>
          <button class="iconbtn xl" data-act="next" aria-label="Next">${icon("skip-forward", true)}</button>
          <button class="iconbtn tog" data-act="repeat" aria-label="Repeat">${icon("repeat", false, "i-rep")}${icon("repeat-once", false, "i-rep1")}</button>
        </div>
        <div class="np-vol">${icon("speaker-low")}<div class="scrub" data-scrub="vol"></div>${icon("speaker-high")}</div>
        <div class="np-tabs">
          <button class="iconbtn tog" data-tab="lyrics" aria-label="Lyrics">${icon("microphone-stage")}</button>
          <button class="iconbtn tog" data-tab="queue" aria-label="Up next">${icon("queue")}</button>
        </div>
      </div>
      <div class="np-right">
        <div class="seg np-seg"><button data-tab="lyrics">Lyrics</button><button data-tab="queue">Up Next</button></div>
        <div class="np-panel lyrics" id="lyrics"></div>
        <div class="np-panel queue" id="queue" hidden></div>
      </div>
    </div>`;
}

/* ---------- scrubbers (seek + volume), pointer + keyboard ---------- */
const scrubs = [];
function makeScrub(el, { get, set, step, label, preview }) {
  el.innerHTML = `<div class="s-track"><i class="s-buf"></i><i class="s-fill"></i><i class="s-knob"></i></div>${preview ? `<span class="s-tip"></span>` : ""}`;
  el.tabIndex = 0;
  el.setAttribute("role", "slider");
  el.setAttribute("aria-label", label);
  const fill = el.querySelector(".s-fill"), knob = el.querySelector(".s-knob"), tip = el.querySelector(".s-tip");
  let drag = null;
  const frac = (e) => { const r = el.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
  const paint = (f) => { fill.style.transform = `scaleX(${f})`; knob.style.left = f * 100 + "%"; };
  el.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    drag = frac(e);
    el.setPointerCapture(e.pointerId);
    el.classList.add("drag");
    paint(drag);
    if (!preview) set(drag);
    e.preventDefault();
  });
  el.addEventListener("pointermove", (e) => {
    const f = frac(e);
    if (tip) { tip.textContent = preview(f); tip.style.left = f * 100 + "%"; }
    if (drag === null) return;
    drag = f;
    paint(f);
    if (!preview) set(f);
  });
  const end = () => {
    if (drag === null) return;
    if (preview) set(drag);
    drag = null;
    el.classList.remove("drag");
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("keydown", (e) => {
    const d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[e.key];
    if (d == null) return;
    e.preventDefault(); e.stopPropagation();
    set(clamp(get() + d, 0, 1));
  });
  const s = {
    el,
    update(buf) {
      if (drag !== null) return;
      const f = get();
      paint(f);
      el.setAttribute("aria-valuenow", Math.round(f * 100));
      if (buf != null) el.querySelector(".s-buf").style.transform = `scaleX(${buf})`;
    },
  };
  scrubs.push(s);
  return s;
}

/* ---------- player ui ---------- */
let lyricsView;
let accent = "";
function syncTrack() {
  const s = player.current;
  root.classList.toggle("has-track", !!s);
  $("#dock").hidden = !s;
  if (!s) { closeNP(); return; }
  const art = artOf(s), fb = fallbackOf(s);
  $$("#dock .dk-art img, #np .np-art img, #np .np-mini img").forEach((im) => { if (im.src !== art) { im.dataset.fb = fb; im.src = art; } });
  $$("#np .np-bg img").forEach((im) => { im.dataset.fb = fb; im.src = art; });
  $("#dock .dk-t").textContent = s.name;
  $("#dock .dk-a").textContent = s.artist || "Unknown artist";
  $("#np .np-t").textContent = s.name;
  $("#np .np-a").textContent = s.artist || "Unknown artist";
  $("#np .np-t2").textContent = s.name;
  $("#np .np-a2").textContent = s.artist || "Unknown artist";
  $("#np .np-src b").textContent = player.source;
  document.title = `${s.name}${s.artist ? " · " + s.artist : ""} — play`;
  accentOf(s).then((c) => {
    if (player.current !== s || c === accent) return;
    accent = c;
    root.style.setProperty("--accent", c);
  });
  if (!$("#np").hidden && npTab === "lyrics") lyricsView.show(s);
  if (!$("#np").hidden && npTab === "queue") renderQueue();
}
function syncState() {
  const st = player.state;
  root.classList.toggle("playing", st === "playing");
  $$("[data-act=toggle]").forEach((b) => {
    b.classList.toggle("is-playing", st === "playing" || st === "loading");
    b.classList.toggle("busy", st === "loading" || (player.buffering && st === "playing"));
    b.setAttribute("aria-label", st === "playing" ? "Pause" : "Play");
  });
  $$("[data-act=shuffle]").forEach((b) => b.classList.toggle("on", player.shuffle));
  $$("[data-act=repeat]").forEach((b) => { b.classList.toggle("on", player.repeat !== "off"); b.classList.toggle("one", player.repeat === "one"); });
  $("#dock").classList.toggle("err", st === "error");
  $("#np").classList.toggle("paused", st !== "playing" && st !== "loading");
}
function syncTime() {
  const d = player.duration, t = player.time;
  $$(".t-cur").forEach((e) => { e.textContent = fmtTime(t); });
  $$(".t-dur").forEach((e) => { e.textContent = fmtTime(d); });
  $$(".t-left").forEach((e) => { e.textContent = "-" + fmtTime(Math.max(0, d - t)); });
  const a = player.audio;
  let buf = 0;
  try { if (a.buffered.length && d) buf = a.buffered.end(a.buffered.length - 1) / d; } catch (e) {}
  scrubs.forEach((s) => s.update(s.el.dataset.scrub === "seek" ? clamp(buf, 0, 1) : null));
  $("#dock .dk-line i").style.transform = `scaleX(${d ? t / d : 0})`;
}
function syncVolume() {
  root.classList.toggle("muted", player.muted || player.volume === 0);
  scrubs.forEach((s) => s.update());
}

/* ---------- now playing ---------- */
let npTab = store.get("play_nptab", "lyrics");
function openNP(tab) {
  if (!player.current) return;
  const np = $("#np");
  if (tab) npTab = tab;
  if (np.hidden) {
    np.hidden = false;
    root.classList.add("np-open");
    const a = A();
    if (a) {
      if (phone()) a.animate(np, { translateY: ["100%", "0%"], duration: 620, ease: spring(0.1, 620) });
      else {
        a.animate(np, { opacity: [0, 1], duration: 320, ease: "outQuad" });
        a.animate(np.querySelector(".np-body"), { scale: [0.96, 1], translateY: [18, 0], duration: 700, ease: spring(0.16, 700) });
      }
      enter(np.querySelectorAll(".np-info, .np-seek, .np-ctrls, .np-vol"), { y: 12, step: 45, delay: 120 });
    }
  }
  setTab(npTab);
  syncTrack(); syncState(); syncTime();
}
function closeNP() {
  const np = $("#np");
  if (np.hidden) return;
  lyricsView && lyricsView.setVisible(false);
  root.classList.remove("np-open");
  const a = A();
  const done = () => { np.hidden = true; np.style.transform = ""; np.style.opacity = ""; };
  if (!a) return done();
  if (phone()) a.animate(np, { translateY: "100%", duration: 320, ease: "inQuad", onComplete: done });
  else a.animate(np, { opacity: 0, duration: 200, ease: "inQuad", onComplete: done });
}
function setTab(tab) {
  npTab = tab;
  store.set("play_nptab", tab);
  const np = $("#np");
  np.dataset.tab = tab;
  $$("[data-tab]", np).forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  $("#lyrics").hidden = tab !== "lyrics";
  $("#queue").hidden = tab !== "queue";
  $$("#dock [data-act=lyrics]").forEach((b) => b.classList.toggle("on", !np.hidden && tab === "lyrics"));
  $$("#dock [data-act=queue]").forEach((b) => b.classList.toggle("on", !np.hidden && tab === "queue"));
  if (tab === "lyrics") { lyricsView.show(player.current); lyricsView.setVisible(true); }
  else { lyricsView.setVisible(false); renderQueue(); }
}
function toggleTabFromDock(tab) {
  const np = $("#np");
  if (!np.hidden && npTab === tab) return closeNP();
  if (np.hidden) openNP(tab); else setTab(tab);
}

function renderQueue() {
  const q = $("#queue");
  const cur = player.current;
  const next = player.queue.slice(player.index + 1);
  const qrow = (s, i, isCur) => `<div class="qrow${isCur ? " cur" : ""}" data-qi="${i}">
      <img src="${esc(artOf(s))}" data-fb="${esc(fallbackOf(s))}" alt="" loading="lazy">
      <div class="q-main"><b>${esc(s.name)}</b><span>${esc(s.artist || "Unknown artist")}</span></div>
      ${isCur ? `<span class="eq"><i></i><i></i><i></i></span>` : `<button class="iconbtn sm" data-qrm aria-label="Remove">${icon("x")}</button>`}</div>`;
  q.innerHTML = `${cur ? `<h3 class="q-h">Now playing</h3>${qrow(cur, player.index, true)}` : ""}
    <div class="q-h-row"><h3 class="q-h">Up next${player.shuffle ? " · shuffled" : ""}</h3>${next.length ? `<button class="txtbtn" data-qclear>Clear</button>` : ""}</div>
    ${next.length ? next.map((s, j) => qrow(s, player.index + 1 + j, false)).join("") : `<p class="q-empty">Nothing queued. ${player.repeat === "all" ? "Repeat is on, so the list starts over." : ""}</p>`}`;
}

/* swipe down to close on phones */
function swipeToClose(np) {
  let y0 = null, dy = 0, t0 = 0;
  np.addEventListener("pointerdown", (e) => {
    if (!phone() || e.target.closest(".scrub, .np-panel, button, input")) return;
    y0 = e.clientY; dy = 0; t0 = performance.now();
  });
  np.addEventListener("pointermove", (e) => {
    if (y0 === null) return;
    dy = Math.max(0, e.clientY - y0);
    if (dy > 4) np.style.transform = `translateY(${dy}px)`;
  });
  const end = () => {
    if (y0 === null) return;
    const v = dy / Math.max(1, performance.now() - t0);
    y0 = null;
    if (dy > 140 || v > 0.6) closeNP();
    else if (dy) {
      const a = A();
      if (a) a.animate(np, { translateY: 0, duration: 420, ease: spring(0.2, 420) });
      else np.style.transform = "";
    }
  };
  np.addEventListener("pointerup", end);
  np.addEventListener("pointercancel", end);
}

/* ---------- sidebar ---------- */
function renderUser() {
  const u = auth.user;
  $("#userbox").innerHTML = u
    ? `<a class="me" href="#/settings"><span class="avatar sm">${u.pic ? `<img src="${esc(u.pic)}" alt="" referrerpolicy="no-referrer">` : esc((u.name || "?")[0])}</span><span>${esc(u.name || u.email)}</span></a>`
    : `<button class="btn primary sm block" data-signin>Sign in</button>`;
  const b = $("#userbox [data-signin]");
  if (b) b.onclick = () => auth.signIn();
}
function renderSidePlaylists() {
  const el = $("#sidepls");
  if (!auth.user || !lib.playlists.length) { el.innerHTML = ""; return; }
  const cur = location.hash;
  el.innerHTML = `<div class="side-h">Playlists</div>` + lib.playlists.slice(0, 30).map((p) =>
    `<a href="#/playlist/${p.id}" class="${cur === "#/playlist/" + p.id ? "active" : ""}">${esc(p.name)}</a>`).join("");
}

/* ---------- router ---------- */
let teardown = null;
function route() {
  const hsh = location.hash || "#/";
  const v = $("#view");
  if (typeof teardown === "function") teardown();
  teardown = null;
  closeMenu();
  let r = "library", m;
  // the code screen survives re-renders (e.g. the background session check);
  // it only goes away when the person navigates somewhere
  if (auth.mintCode) { r = "mint"; teardown = views.mintCode(v, auth.mintCode); }
  else if (/^#\/playlists\/?$/.test(hsh)) { r = "playlists"; teardown = views.playlists(v); }
  else if ((m = hsh.match(/^#\/playlist\/([a-f0-9]{24})$/i))) { r = "playlists"; teardown = views.playlist(v, m[1]); }
  else if (/^#\/settings\/?$/.test(hsh)) { r = "settings"; teardown = views.settings(v); }
  else teardown = views.library(v);
  $$("[data-route]").forEach((a) => a.classList.toggle("active", a.dataset.route === r));
  renderSidePlaylists();
  $("#main").scrollTop = 0;
  window.scrollTo(0, 0);
  if (!$("#np").hidden && phone()) closeNP();
}

/* ---------- drag & drop anywhere ---------- */
function dropzone() {
  const ov = $("#drop");
  let depth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (depth++ === 0) {
      ov.hidden = false;
      const a = A();
      if (a) { a.animate(ov, { opacity: [0, 1], duration: 200, ease: "outQuad" }); a.animate(ov.querySelector(".drop-card"), { scale: [0.92, 1], duration: 520, ease: spring(0.3, 520) }); }
    }
  });
  addEventListener("dragover", (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  const hide = () => { depth = 0; ov.hidden = true; };
  addEventListener("dragleave", (e) => { if (hasFiles(e) && --depth <= 0) hide(); });
  addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    hide();
    if (!auth.user) return toast("Sign in to add music", { kind: "error" });
    reviewUploads(e.dataTransfer.files);
  });
}

/* ---------- keyboard ---------- */
function keys() {
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (closeMenu() || closeTopSheet()) return;
      if (!$("#np").hidden) return closeNP();
      return;
    }
    const t = e.target;
    if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if ($("#layer").children.length) return;
    const k = e.key;
    if (k === " " && !(t.tagName === "BUTTON" || t.getAttribute("role") === "button" || t.getAttribute("role") === "slider")) {
      e.preventDefault(); player.toggle();
    } else if (k === "ArrowRight" && e.shiftKey) player.next();
    else if (k === "ArrowLeft" && e.shiftKey) player.prev();
    else if (k === "ArrowRight" && t.getAttribute("role") !== "slider") player.seekBy(5);
    else if (k === "ArrowLeft" && t.getAttribute("role") !== "slider") player.seekBy(-5);
    else if (k === "ArrowUp" && !t.closest(".row") && t.getAttribute("role") !== "slider") { e.preventDefault(); player.setVolume(player.volume + 0.05); }
    else if (k === "ArrowDown" && !t.closest(".row") && t.getAttribute("role") !== "slider") { e.preventDefault(); player.setVolume(player.volume - 0.05); }
    else if (k === "m" || k === "M") player.toggleMute();
    else if (k === "l" || k === "L") toggleTabFromDock("lyrics");
    else if (k === "/") { const q = $("#libq"); if (q) { e.preventDefault(); q.focus(); } }
  });
}

/* ---------- wiring ---------- */
function wire() {
  // every transport button, wherever it is
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b) {
      const act = b.dataset.act;
      if (act === "toggle") { player.toggle(); pulse(b); }
      else if (act === "next") player.next();
      else if (act === "prev") player.prev();
      else if (act === "shuffle") { player.toggleShuffle(); toast("Shuffle " + (player.shuffle ? "on" : "off")); }
      else if (act === "repeat") { player.cycleRepeat(); toast({ off: "Repeat off", all: "Repeat all", one: "Repeat this song" }[player.repeat]); }
      else if (act === "mute") player.toggleMute();
      else if (act === "lyrics") toggleTabFromDock("lyrics");
      else if (act === "queue") toggleTabFromDock("queue");
      return;
    }
    if (e.target.closest("[data-open]")) return openNP();
    if (e.target.closest("[data-close-np]")) return closeNP();
    const tab = e.target.closest("#np [data-tab]");
    if (tab) {
      const np = $("#np");
      // on phones the tab buttons toggle between artwork and the panel
      if (phone() && np.classList.contains("panel-open") && npTab === tab.dataset.tab) { np.classList.remove("panel-open"); lyricsView.setVisible(false); $$("[data-tab]", np).forEach((x) => x.classList.remove("on")); return; }
      np.classList.add("panel-open");
      return setTab(tab.dataset.tab);
    }
    if (e.target.closest("[data-np-more]")) {
      const s = player.current;
      if (s) views.songMenu(e.target.closest("[data-np-more]"), s);
      return;
    }
    const qr = e.target.closest(".qrow");
    if (qr) {
      const i = +qr.dataset.qi;
      if (e.target.closest("[data-qrm]")) { player.removeAt(i); return; }
      if (i !== player.index) player.playAt(i);
    }
    if (e.target.closest("[data-qclear]")) player.clearUpNext();
  });
  // mini-player on phones: the whole bar opens now playing
  $("#dock").addEventListener("click", (e) => {
    if (phone() && !e.target.closest("[data-act]")) openNP();
  });

  $$("[data-scrub=seek]").forEach((el) => makeScrub(el, {
    label: "Seek", step: 0.02,
    get: () => (player.duration ? player.time / player.duration : 0),
    set: (f) => player.seekTo(f * player.duration),
    preview: (f) => fmtTime(f * player.duration),
  }));
  $$("[data-scrub=vol]").forEach((el) => makeScrub(el, {
    label: "Volume", step: 0.05,
    get: () => (player.muted ? 0 : player.volume),
    set: (f) => player.setVolume(f),
  }));

  bus.on("player:track", syncTrack);
  bus.on("player:state", syncState);
  bus.on("player:time", syncTime);
  bus.on("player:volume", syncVolume);
  bus.on("player:queue", () => { if (!$("#np").hidden && npTab === "queue") renderQueue(); });
  bus.on("playlists", renderSidePlaylists);
  bus.on("auth", (u) => {
    renderUser();
    if (u) { lib.load(); lib.loadPlaylists(); }
    else { player.reset(); lib.reset(); }
    route();
  });
  bus.on("lib", () => { if (lib.status === "ready" && !player.current) player.restore(); });
  bus.on("storage:fallback", () => toast("Google Drive is offline, so these went to backup storage. They play normally.", { ms: 6000 }));

  // waking the free-tier server can take ~30s: say so instead of looking broken
  const wake = $("#wake");
  bus.on("net:slow", (on) => {
    wake.hidden = !on;
    if (on) { const a = A(); if (a) a.animate(wake, { opacity: [0, 1], translateY: [-10, 0], duration: 400, ease: spring(0.3, 400) }); }
  });
  addEventListener("offline", () => toast("You're offline — songs you've played before still work", { ms: 5000 }));

  swipeToClose($("#np"));
  window.addEventListener("hashchange", () => {
    if (auth.mintCode) { auth.mintCode = null; history.replaceState(null, "", location.pathname + location.hash); }
    route();
  });
  matchMedia("(max-width: 900px)").addEventListener("change", () => { if (!$("#np").hidden) setTab(npTab); });
}

function pulse(el) {
  const a = A();
  if (a) a.animate(el, { scale: [0.86, 1], duration: 480, ease: spring(0.4, 480) });
}

/* ---------- boot ---------- */
async function boot() {
  const m = store.get("play_motion");
  if (m) root.dataset.motion = m;
  shell();
  lyricsView = new LyricsView($("#lyrics"));
  player.init();
  wire();
  dropzone();
  keys();
  syncVolume();
  syncState();
  $("#dock").hidden = true;
  await auth.init();
  renderUser();
  route();
  if (auth.user) { lib.load(); lib.loadPlaylists(); }
  root.classList.add("ready");
}
boot();
