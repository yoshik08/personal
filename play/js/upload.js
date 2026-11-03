/* upload: read tags → match cover art → review sheet → sequential uploads with a progress tray */
import { api, bus, esc, h, toast, sheet, A, spring, plural, $, fmtBytes } from "./core.js";
import { icon } from "./icons.js";
import { lib } from "./library.js";
import { genArt } from "./art.js";

const AUDIO_EXT = /\.(mp3|m4a|aac|mp4|ogg|oga|opus|wav|flac|webm|weba|aif|aiff)$/i;
export const isAudioFile = (f) => (f.type || "").startsWith("audio/") || AUDIO_EXT.test(f.name || "");

/* ---------- id3v2 (mp3) tag reader: title / artist / album ---------- */
function decodeText(bytes, enc) {
  try {
    if (enc === 0) return new TextDecoder("latin1").decode(bytes);
    if (enc === 1) return new TextDecoder("utf-16").decode(bytes);
    if (enc === 2) return new TextDecoder("utf-16be").decode(bytes);
    return new TextDecoder("utf-8").decode(bytes);
  } catch (e) { return ""; }
}
const clean = (s) => String(s || "").replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();

async function readId3(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 10).arrayBuffer());
    if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {};
    const ver = head[3];
    const size = (head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9];
    const buf = new Uint8Array(await file.slice(10, 10 + Math.min(size, 512 * 1024)).arrayBuffer());
    const out = {};
    const want = ver === 2 ? { TT2: "title", TP1: "artist", TAL: "album" } : { TIT2: "title", TPE1: "artist", TALB: "album" };
    let i = 0;
    if (ver > 2 && head[5] & 0x40) { // extended header
      const ex = ver === 4 ? (buf[0] << 21) | (buf[1] << 14) | (buf[2] << 7) | buf[3] : ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) + 4;
      i = ex;
    }
    while (i < buf.length - 10) {
      let id, fsize, hdr;
      if (ver === 2) {
        id = String.fromCharCode(buf[i], buf[i + 1], buf[i + 2]);
        fsize = (buf[i + 3] << 16) | (buf[i + 4] << 8) | buf[i + 5];
        hdr = 6;
      } else {
        id = String.fromCharCode(buf[i], buf[i + 1], buf[i + 2], buf[i + 3]);
        fsize = ver === 4
          ? (buf[i + 4] << 21) | (buf[i + 5] << 14) | (buf[i + 6] << 7) | buf[i + 7]
          : ((buf[i + 4] << 24) | (buf[i + 5] << 16) | (buf[i + 6] << 8) | buf[i + 7]) >>> 0;
        hdr = 10;
      }
      if (!/^[A-Z0-9]{3,4}$/.test(id) || fsize <= 0) break;
      if (want[id]) {
        const body = buf.subarray(i + hdr, i + hdr + fsize);
        out[want[id]] = clean(decodeText(body.subarray(1), body[0]));
      }
      i += hdr + fsize;
    }
    return out;
  } catch (e) { return {}; }
}

/** "03 - Artist - Title (Official Video).mp3" → {artist, title} */
export function parseFilename(name) {
  let base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
  base = base.replace(/[([](official|lyrics?|audio|video|hq|hd|visualizer|music video)[^)\]]*[)\]]/gi, "");
  base = base.replace(/^\s*\d{1,3}\s*[-.)]\s*/, "").replace(/\s+/g, " ").trim();
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  return { artist: "", title: base };
}

function durationOf(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    let done = false;
    const fin = (d) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(isFinite(d) ? d : 0); };
    a.preload = "metadata";
    a.onloadedmetadata = () => fin(a.duration);
    a.onerror = () => fin(0);
    setTimeout(() => fin(0), 8000);
    a.src = url;
  });
}

/* ---------- cover-art matching (itunes/spotify metadata only) ---------- */
const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/\(.*?\)|\[.*?\]/g, " ").replace(/feat\.?.*$/, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function sim(a, b) {
  const A_ = new Set(norm(a).split(" ").filter(Boolean)), B = new Set(norm(b).split(" ").filter(Boolean));
  if (!A_.size || !B.size) return 0;
  let n = 0;
  A_.forEach((w) => { if (B.has(w)) n++; });
  return n / Math.max(A_.size, B.size);
}
export async function searchCovers(title, artist) {
  const q = [title, artist].filter(Boolean).join(" ");
  if (!q.trim()) return [];
  try {
    const d = await api.get("/api/search?q=" + encodeURIComponent(q), { timeout: 20000 });
    return (d.tracks || []).filter((t) => t.albumArt);
  } catch (e) { return []; }
}
export function bestMatch(tracks, title, artist, duration) {
  let best = null, score = 0;
  for (const t of tracks) {
    const ts = sim(title, t.title);
    if (ts < 0.5) continue;
    // no artist to check against: only trust an exact title with a matching length
    if (!artist && (norm(title) !== norm(t.title) || !duration || !t.duration || Math.abs(t.duration - duration) > 4)) continue;
    const as = artist ? (norm(t.artist).includes(norm(artist)) || norm(artist).includes(norm(t.artist)) ? 1 : sim(artist, t.artist)) : 0.5;
    if (artist && as < 0.34) continue; // never put the wrong artist's art on a song
    const dd = duration && t.duration ? Math.abs(t.duration - duration) : 30;
    const ds = dd < 4 ? 1 : dd < 12 ? 0.7 : dd < 30 ? 0.4 : 0.1;
    const s = ts * 0.5 + as * 0.3 + ds * 0.2;
    if (s > score) { score = s; best = t; }
  }
  return score >= 0.6 ? best : null;
}

/** popover grid of cover candidates; resolves {artworkUrl, album, artist?} or undefined */
export function pickCover(title, artist, current) {
  return new Promise(async (resolve) => {
    let chosen;
    const s = sheet(`<h3 class="sheet-title">Choose artwork</h3>
      <form class="cover-search"><input name="q" value="${esc([title, artist].filter(Boolean).join(" "))}" placeholder="Search songs or albums" spellcheck="false">
      <button class="btn ghost sm">${icon("magnifying-glass")}</button></form>
      <div class="cover-grid"><div class="cover-empty">Searching…</div></div>
      <div class="sheet-actions"><button class="btn ghost" data-none>No artwork</button><button class="btn ghost" data-close>Cancel</button></div>`,
      { cls: "wide", onClose: () => resolve(chosen) });
    const grid = s.el.querySelector(".cover-grid");
    async function run(q) {
      grid.innerHTML = `<div class="cover-empty">Searching…</div>`;
      const d = await api.get("/api/search?q=" + encodeURIComponent(q), { timeout: 20000 }).catch(() => ({ tracks: [] }));
      const seen = new Set();
      const ts = (d.tracks || []).filter((t) => t.albumArt && !seen.has(t.albumArt) && seen.add(t.albumArt)).slice(0, 12);
      if (!ts.length) { grid.innerHTML = `<div class="cover-empty">No artwork found — try different words</div>`; return; }
      grid.innerHTML = ts.map((t, i) => `<button class="cover-opt${t.albumArt === current ? " sel" : ""}" data-i="${i}">
        <img src="${esc(t.albumArt)}" alt="" loading="lazy"><span>${esc(t.album || t.title)}</span><small>${esc(t.artist)}</small></button>`).join("");
      grid.querySelectorAll("[data-i]").forEach((b) => b.onclick = () => {
        const t = ts[+b.dataset.i];
        chosen = { artworkUrl: t.albumArt, album: t.album, artist: t.artist };
        s.close(true);
      });
    }
    s.el.querySelector("form").onsubmit = (e) => { e.preventDefault(); run(e.target.q.value.trim()); };
    s.el.querySelector("[data-none]").onclick = () => { chosen = { artworkUrl: "" }; s.close(true); };
    run([title, artist].filter(Boolean).join(" "));
  });
}

/* ---------- review sheet ---------- */
export async function reviewUploads(fileList) {
  const files = [...fileList].filter(isAudioFile);
  const skipped = fileList.length - files.length;
  if (skipped) toast(plural(skipped, "file") + " skipped — not audio", { kind: "error" });
  if (!files.length) return;
  if (!api.token) return toast("Sign in to add music", { kind: "error" });

  const items = files.slice(0, 50).map((f, i) => ({ key: i, file: f, title: "", artist: "", album: "", artworkUrl: "", duration: 0, ready: false }));
  const s = sheet(`<h3 class="sheet-title">Add ${plural(items.length, "song")}</h3>
    <p class="sheet-text">Check the names — they're used to find artwork and lyrics.</p>
    <div class="rv-list">${items.map((it) => `<div class="rv" data-k="${it.key}">
      <button class="rv-art" title="Change artwork"><img alt="" src="${genArt(it.file.name)}"><span class="rv-spin"></span></button>
      <div class="rv-fields">
        <input class="rv-title" placeholder="Title" maxlength="200" spellcheck="false">
        <input class="rv-artist" placeholder="Artist" maxlength="200" spellcheck="false">
      </div>
      <div class="rv-size">${fmtBytes(it.file.size)}</div>
      <button class="iconbtn rv-x" title="Remove">${icon("x")}</button></div>`).join("")}</div>
    <div class="sheet-actions"><button class="btn ghost" data-close>Cancel</button>
      <button class="btn primary" data-go>${icon("upload-simple")}<span>Add ${plural(items.length, "song")}</span></button></div>`,
    { cls: "wide" });

  const rowOf = (it) => s.el.querySelector(`.rv[data-k="${it.key}"]`);
  const setArt = (it) => {
    const r = rowOf(it); if (!r) return;
    const img = r.querySelector("img");
    img.src = it.artworkUrl || genArt(it.title || it.file.name);
    const a = A(); if (a && it.artworkUrl) a.animate(img, { opacity: [0, 1], scale: [1.08, 1], duration: 500, ease: "outExpo" });
  };
  const goBtn = s.el.querySelector("[data-go]");
  const refreshCount = () => {
    const n = items.filter((i) => !i.removed).length;
    goBtn.querySelector("span").textContent = "Add " + plural(n, "song");
    goBtn.disabled = !n;
  };

  // tags + duration first (fast, local), then artwork lookups 3 at a time
  await Promise.all(items.map(async (it) => {
    const [tags, dur] = await Promise.all([readId3(it.file), durationOf(it.file)]);
    const fromName = parseFilename(it.file.name);
    it.title = tags.title || fromName.title;
    it.artist = tags.artist || fromName.artist;
    it.album = tags.album || "";
    it.duration = dur;
    const r = rowOf(it);
    if (r) {
      r.querySelector(".rv-title").value = it.title;
      r.querySelector(".rv-artist").value = it.artist;
    }
  }));
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const it = items[cursor++];
      const r = rowOf(it);
      r && r.classList.add("busy");
      const m = bestMatch(await searchCovers(it.title, it.artist), it.title, it.artist, it.duration);
      if (m && !it.userArt) { it.artworkUrl = m.albumArt; if (!it.album) it.album = m.album; setArt(it); }
      r && r.classList.remove("busy");
    }
  };
  worker(); worker(); worker();

  s.el.querySelectorAll(".rv").forEach((r) => {
    const it = items[+r.dataset.k];
    r.querySelector(".rv-title").oninput = (e) => { it.title = e.target.value; };
    r.querySelector(".rv-artist").oninput = (e) => { it.artist = e.target.value; };
    r.querySelector(".rv-x").onclick = () => { it.removed = true; r.remove(); refreshCount(); };
    r.querySelector(".rv-art").onclick = async () => {
      const c = await pickCover(it.title, it.artist, it.artworkUrl);
      if (c) { it.userArt = true; it.artworkUrl = c.artworkUrl; if (c.album) it.album = c.album; setArt(it); }
    };
  });
  goBtn.onclick = () => {
    const chosen = items.filter((i) => !i.removed);
    s.close(true);
    chosen.forEach((it) => { it.title = it.title.trim() || parseFilename(it.file.name).title; it.artist = it.artist.trim(); });
    queueUploads(chosen);
  };
}

/* ---------- upload queue + tray ---------- */
const jobs = [];
let running = false;

function queueUploads(items) {
  items.forEach((it) => jobs.push({ ...it, status: "queued", progress: 0 }));
  renderTray(true);
  if (!running) runQueue();
}

async function runQueue() {
  running = true;
  let job;
  while ((job = jobs.find((j) => j.status === "queued"))) {
    job.status = "uploading";
    renderTray();
    const form = new FormData();
    form.append("name", job.title);
    if (job.artist) form.append("artist", job.artist);
    if (job.album) form.append("album", job.album);
    if (job.artworkUrl) form.append("artworkUrl", job.artworkUrl);
    form.append("duration", String(job.duration || 0));
    form.append("audio", job.file, job.file.name);
    try {
      const song = await api.upload("/api/songs", form, (p) => { job.progress = p; updateJob(job); });
      job.status = "done";
      job.progress = 1;
      job.fallback = !!song.storedFallback;
      lib.upsert(song);
      api.post(`/api/songs/${song.id}/lyrics/refresh`).catch(() => {});
    } catch (e) {
      job.status = "error";
      job.error = e.message;
    }
    renderTray();
  }
  running = false;
  const done = jobs.filter((j) => j.status === "done");
  const failed = jobs.filter((j) => j.status === "error");
  if (done.length) toast(plural(done.length, "song") + " added" + (failed.length ? ` · ${failed.length} failed` : ""), { kind: failed.length ? "error" : "ok" });
  if (done.some((j) => j.fallback)) bus.emit("storage:fallback");
  if (!failed.length) setTimeout(() => { if (!running) { jobs.length = 0; renderTray(); } }, 3500);
}

function ring(p) {
  const c = 2 * Math.PI * 9;
  return `<svg class="ring" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9"/><circle class="rp" cx="11" cy="11" r="9"
    stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}"/></svg>`;
}
function jobRow(j) {
  const st = j.status === "done" ? `<span class="tj-ok">${icon("check")}</span>`
    : j.status === "error" ? `<button class="tj-retry" title="${esc(j.error || "")}">${icon("arrow-clockwise")}</button>`
    : j.status === "queued" ? `<span class="tj-wait">${icon("clock")}</span>` : ring(j.progress);
  return `<div class="tj ${j.status}" data-k="${jobs.indexOf(j)}">
    <img src="${esc(j.artworkUrl || genArt(j.title))}" alt="">
    <div class="tj-meta"><div class="tj-t">${esc(j.title)}</div>
    <div class="tj-s">${j.status === "error" ? esc(j.error || "failed") : j.status === "uploading" ? Math.round(j.progress * 100) + "%" : j.status === "done" ? "Added" : "Waiting"}</div></div>${st}</div>`;
}
function updateJob(j) {
  const el = document.querySelector(`#tray .tj[data-k="${jobs.indexOf(j)}"]`);
  if (!el) return renderTray();
  const c = 2 * Math.PI * 9;
  const rp = el.querySelector(".rp");
  if (rp) rp.setAttribute("stroke-dashoffset", c * (1 - j.progress));
  el.querySelector(".tj-s").textContent = Math.round(j.progress * 100) + "%";
  const bar = document.querySelector("#tray .tray-bar i");
  if (bar) bar.style.transform = `scaleX(${overall()})`;
}
const overall = () => jobs.length ? jobs.reduce((a, j) => a + (j.status === "done" || j.status === "error" ? 1 : j.progress), 0) / jobs.length : 0;

function renderTray(appear) {
  const tray = $("#tray");
  if (!jobs.length) {
    if (!tray.hidden) {
      const a = A();
      if (a) a.animate(tray, { opacity: 0, translateY: 16, duration: 260, ease: "inQuad", onComplete: () => { tray.hidden = true; tray.style.opacity = ""; tray.style.transform = ""; } });
      else tray.hidden = true;
    }
    return;
  }
  const done = jobs.filter((j) => j.status === "done").length;
  const active = jobs.some((j) => j.status === "uploading" || j.status === "queued");
  tray.innerHTML = `<div class="tray-head">
      <div><b>${active ? `Uploading ${Math.min(done + 1, jobs.length)} of ${jobs.length}` : `${done} of ${jobs.length} added`}</b></div>
      <button class="iconbtn sm" data-min title="Hide">${icon("caret-down")}</button></div>
    <div class="tray-bar"><i style="transform:scaleX(${overall()})"></i></div>
    <div class="tray-list">${jobs.map(jobRow).join("")}</div>`;
  tray.querySelector("[data-min]").onclick = () => tray.classList.toggle("min");
  tray.querySelectorAll(".tj-retry").forEach((b) => b.onclick = () => {
    const j = jobs[+b.closest(".tj").dataset.k];
    j.status = "queued"; j.progress = 0; j.error = null;
    renderTray();
    if (!running) runQueue();
  });
  if (tray.hidden) {
    tray.hidden = false;
    const a = A();
    if (a && appear) a.animate(tray, { opacity: [0, 1], translateY: [24, 0], scale: [0.96, 1], duration: 560, ease: spring(0.2, 560) });
  }
}

/** pick files via the system dialog */
export function chooseFiles() {
  const inp = h(`<input type="file" accept="audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus,.aac" multiple hidden>`);
  document.body.appendChild(inp);
  inp.onchange = () => { if (inp.files.length) reviewUploads(inp.files); inp.remove(); };
  inp.click();
}
