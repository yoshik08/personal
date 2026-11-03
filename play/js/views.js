/* views: library, playlists, playlist, settings, signed-out landing, drive-code screen */
import { api, bus, esc, h, $, $$, fmtTime, fmtTotal, plural, toast, menu, confirmSheet, formSheet, sheet, enter, A, spring, store, fmtBytes } from "./core.js";
import { icon } from "./icons.js";
import { auth } from "./auth.js";
import { lib } from "./library.js";
import { player } from "./player.js";
import { cache } from "./cache.js";
import { artOf, fallbackOf, genArt } from "./art.js";
import { chooseFiles, pickCover } from "./upload.js";

const img = (song, cls = "") => `<img class="${cls}" src="${esc(artOf(song))}" data-fb="${esc(fallbackOf(song))}" alt="" loading="lazy" decoding="async">`;
const eq = `<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>`;

/* ---------- shared: song rows ---------- */
function songRow(s, i) {
  return `<div class="row" data-id="${s.id}" data-i="${i}" role="button" tabindex="0">
    <div class="row-n"><span class="row-num">${i + 1}</span>${eq}<span class="row-play">${icon("play", true)}</span></div>
    <div class="row-art">${img(s)}</div>
    <div class="row-main"><div class="row-t">${esc(s.name)}</div><div class="row-a">${esc(s.artist || "Unknown artist")}</div></div>
    <div class="row-album">${esc(s.album || "")}</div>
    <div class="row-d">${s.duration ? fmtTime(s.duration) : "—"}</div>
    <button class="iconbtn row-more" data-more aria-label="More for ${esc(s.name)}">${icon("dots-three")}</button>
  </div>`;
}

function markPlaying(root) {
  const cur = player.current;
  $$(".row", root).forEach((r) => {
    const on = !!cur && r.dataset.id === cur.id;
    r.classList.toggle("now", on);
    r.classList.toggle("paused", on && !player.isPlaying);
  });
  $$(".shelf-card", root).forEach((c) => c.classList.toggle("now", !!cur && c.dataset.id === cur.id));
}

/** event delegation for any list of song rows */
function bindRows(list, getSongs, source, opts = {}) {
  const play = (i) => {
    const songs = getSongs();
    const s = songs[i];
    if (player.current && s && player.current.id === s.id) return player.toggle();
    player.playList(songs, i, source);
  };
  list.addEventListener("click", (e) => {
    const row = e.target.closest(".row");
    if (!row) return;
    const s = getSongs()[+row.dataset.i];
    if (e.target.closest("[data-more]")) return songMenu(e.target.closest("[data-more]"), s, opts);
    play(+row.dataset.i);
  });
  list.addEventListener("keydown", (e) => {
    const row = e.target.closest(".row");
    if (!row || e.target !== row) return;
    if (e.key === "Enter") { e.preventDefault(); play(+row.dataset.i); }
    if (e.key === "ArrowDown") { e.preventDefault(); row.nextElementSibling?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); row.previousElementSibling?.focus(); }
  });
  list.addEventListener("contextmenu", (e) => {
    const row = e.target.closest(".row");
    if (!row) return;
    e.preventDefault();
    songMenu({ x: e.clientX, y: e.clientY }, getSongs()[+row.dataset.i], opts);
  });
}

/* ---------- song actions ---------- */
export function songMenu(anchor, s, { playlistId } = {}) {
  if (!s) return;
  const items = [
    { label: "Play next", icon: "list-plus", fn: () => player.playNext(s) },
    { label: "Add to queue", icon: "queue", fn: () => player.addToQueue(s) },
    { label: "Add to playlist…", icon: "playlist", fn: () => addToPlaylistSheet(s) },
    "-",
    { label: "Edit info", icon: "pencil-simple", fn: () => editSong(s) },
    { label: "Change artwork", icon: "image", fn: async () => {
      const c = await pickCover(s.name, s.artist, s.artworkUrl);
      if (!c) return;
      const f = { artworkUrl: c.artworkUrl };
      if (c.album && !s.album) f.album = c.album;
      try { await lib.update(s.id, f); toast("Artwork updated", { kind: "ok" }); } catch (e) { toast(e.message, { kind: "error" }); }
    } },
    "-",
  ];
  if (playlistId) items.push({ label: "Remove from playlist", icon: "x", fn: () => bus.emit("playlist:remove", { playlistId, songId: s.id }) });
  items.push({ label: "Delete from library", icon: "trash", danger: true, fn: async () => {
    if (!(await confirmSheet("Delete “" + s.name + "”?", "It's removed from your library, your playlists and storage. This can't be undone.", "Delete", true))) return;
    try { await lib.remove(s.id); cache.remove(s.id); toast("Deleted"); } catch (e) { toast("Couldn't delete: " + e.message, { kind: "error" }); }
  } });
  menu(anchor, items, `<div class="mh">${img(s)}<div><b>${esc(s.name)}</b><span>${esc(s.artist || "Unknown artist")}</span></div></div>`);
}

async function editSong(s) {
  const v = await formSheet("Edit info", [
    { name: "name", label: "Title", value: s.name },
    { name: "artist", label: "Artist", value: s.artist, placeholder: "Who's it by?" },
    { name: "album", label: "Album", value: s.album, placeholder: "Optional" },
  ]);
  if (!v) return;
  const f = {};
  if (v.name && v.name !== s.name) f.name = v.name;
  if (v.artist !== (s.artist || "")) f.artist = v.artist;
  if (v.album !== (s.album || "")) f.album = v.album;
  if (!Object.keys(f).length) return;
  try {
    await lib.update(s.id, f);
    toast("Saved", { kind: "ok" });
    if (f.name || f.artist) api.post(`/api/songs/${s.id}/lyrics/refresh`).catch(() => {});
  } catch (e) { toast("Couldn't save: " + e.message, { kind: "error" }); }
}

async function addToPlaylistSheet(s) {
  if (lib.plStatus !== "ready") await lib.loadPlaylists();
  const pls = lib.playlists;
  const sh = sheet(`<h3 class="sheet-title">Add to playlist</h3>
    <div class="pick-list">
      <button class="pick new" data-new><span class="pick-art">${icon("plus")}</span><span>New playlist…</span></button>
      ${pls.map((p) => `<button class="pick" data-p="${p.id}"><span class="pick-art">${collage(p, true)}</span>
        <span>${esc(p.name)}<small>${plural(p.songCount, "song")}</small></span></button>`).join("")}
    </div><div class="sheet-actions"><button class="btn ghost" data-close>Done</button></div>`, { cls: "narrow" });
  sh.el.querySelector("[data-new]").onclick = async () => {
    sh.close();
    const v = await formSheet("New playlist", [{ name: "name", label: "Name", placeholder: "Late night" }], "Create");
    if (!v) return;
    try {
      const p = await lib.createPlaylist(v.name || "New playlist");
      await lib.addToPlaylist(p.id, s.id);
      toast("Added to " + p.name, { kind: "ok" });
    } catch (e) { toast(e.message, { kind: "error" }); }
  };
  sh.el.querySelectorAll("[data-p]").forEach((b) => b.onclick = async () => {
    sh.close();
    const p = pls.find((x) => x.id === b.dataset.p);
    try { await lib.addToPlaylist(p.id, s.id); toast("Added to " + p.name, { kind: "ok" }); }
    catch (e) { toast(e.message, { kind: "error" }); }
  });
}

function collage(p, small = false) {
  const covers = (p.covers || []).map((c) => c.art || genArt(c.id || c.name));
  if (covers.length >= 4) return `<span class="collage">${covers.slice(0, 4).map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join("")}</span>`;
  if (covers.length) return `<img src="${esc(covers[0])}" alt="" loading="lazy">`;
  return `<span class="pl-blank" style="background-image:url('${genArt("pl" + p.id)}')">${small ? "" : icon("playlist")}</span>`;
}

/* ---------- signed out ---------- */
function landing(v) {
  v.innerHTML = `<section class="hero">
    <div class="hero-art" aria-hidden="true">
      <div class="disc"><div class="disc-grooves"></div><div class="disc-sheen"></div><div class="disc-label"></div></div>
      <div class="hero-bars">${Array.from({ length: 28 }, (_, i) => `<i style="--i:${i}"></i>`).join("")}</div>
    </div>
    <div class="hero-copy">
      <h1 class="display">Your music.<br>Nowhere else.</h1>
      <p class="lede">A private library for the songs you own. Upload once, play anywhere, follow the lyrics word by word.</p>
      <button class="btn primary lg" data-signin><svg class="g" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>Continue with Google</button>
      <p class="fine">Private to you. No streaming catalogue, no ads, no tracking.</p>
    </div></section>`;
  v.querySelector("[data-signin]").onclick = () => auth.signIn();
  enter(v.querySelectorAll(".hero-copy > *"), { y: 18, step: 70, delay: 80 });
  const a = A();
  if (a) a.animate(v.querySelector(".hero-art"), { opacity: [0, 1], scale: [0.9, 1], rotate: [-8, 0], duration: 1400, ease: spring(0.15, 1400) });
}

/* ---------- library ---------- */
const SORTS = {
  recent: { label: "Recently added", fn: (a, b) => new Date(b.createdAt) - new Date(a.createdAt) },
  title: { label: "Title", fn: (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) },
  artist: { label: "Artist", fn: (a, b) => (a.artist || "~").localeCompare(b.artist || "~", undefined, { sensitivity: "base" }) || a.name.localeCompare(b.name) },
  plays: { label: "Most played", fn: (a, b) => (b.plays || 0) - (a.plays || 0) || new Date(b.lastPlayedAt || 0) - new Date(a.lastPlayedAt || 0) },
};

export function library(v) {
  if (!auth.user) return landing(v);
  let sort = store.get("play_sort", "recent");
  if (!SORTS[sort]) sort = "recent";
  let q = "";
  let shown = [];

  v.innerHTML = `<header class="phead">
      <div class="phead-text"><h1 class="display">Library</h1><p class="sub" id="libsub"></p></div>
      <div class="phead-actions">
        <button class="btn primary" data-playall>${icon("play", true)}<span>Play</span></button>
        <button class="btn soft" data-shuffle>${icon("shuffle")}<span>Shuffle</span></button>
        <button class="btn soft icon-only-sm" data-add title="Add music">${icon("plus")}<span>Add music</span></button>
      </div></header>
    <section class="shelf-wrap" id="shelf" hidden><h2 class="h2">Recently played</h2><div class="shelf" id="shelfrow"></div></section>
    <div class="toolbar" id="toolbar">
      <label class="search">${icon("magnifying-glass")}<input id="libq" placeholder="Search your library" autocomplete="off" spellcheck="false"><kbd>/</kbd></label>
      <button class="btn soft sm" id="sortbtn" aria-label="Sort">${icon("sort-ascending")}<span>${SORTS[sort].label}</span></button>
    </div>
    <div class="list" id="songs"></div>`;

  const list = $("#songs", v), sub = $("#libsub", v), shelf = $("#shelf", v), shelfRow = $("#shelfrow", v);
  bindRows(list, () => shown, "Library");

  function draw(animate) {
    const all = lib.songs;
    const total = all.reduce((a, s) => a + (s.duration || 0), 0);
    sub.textContent = all.length ? `${plural(all.length, "song")} · ${fmtTotal(total)}` : "";
    $$(".phead-actions [data-playall], .phead-actions [data-shuffle]", v).forEach((b) => { b.disabled = !all.length; });
    $("#toolbar", v).hidden = !all.length;

    if (lib.status === "loading" && !all.length) {
      list.innerHTML = Array.from({ length: 7 }, () => `<div class="row skel"><div class="row-n"></div><div class="row-art"><i></i></div><div class="row-main"><i></i><i></i></div></div>`).join("");
      shelf.hidden = true;
      return;
    }
    if (lib.status === "error" && !all.length) {
      list.innerHTML = `<div class="state"><div class="state-ic">${icon("warning-circle")}</div>
        <h3>Couldn't load your library</h3><p>${esc(lib.error || "")}</p><button class="btn soft" data-retry>Try again</button></div>`;
      list.querySelector("[data-retry]").onclick = () => lib.load();
      shelf.hidden = true;
      return;
    }
    if (!all.length) {
      list.innerHTML = `<div class="empty-drop" data-add>
        <div class="ed-art" aria-hidden="true"><span></span><span></span><span></span>${icon("music-notes-plus")}</div>
        <h3>Drop your music here</h3>
        <p>MP3, M4A, FLAC, WAV — drag files anywhere on this page, or</p>
        <button class="btn primary">${icon("upload-simple")}<span>Choose files</span></button></div>`;
      shelf.hidden = true;
      return;
    }

    // recently played shelf
    const recent = all.filter((s) => s.lastPlayedAt).sort((a, b) => new Date(b.lastPlayedAt) - new Date(a.lastPlayedAt)).slice(0, 12);
    shelf.hidden = recent.length < 3 || !!q;
    if (!shelf.hidden) {
      shelfRow.innerHTML = recent.map((s) => `<button class="shelf-card" data-id="${s.id}">
        <span class="sc-art">${img(s)}<span class="sc-play">${icon("play", true)}</span></span>
        <span class="sc-t">${esc(s.name)}</span><span class="sc-a">${esc(s.artist || "Unknown artist")}</span></button>`).join("");
      shelfRow.onclick = (e) => {
        const c = e.target.closest(".shelf-card");
        if (c) player.playList(recent, recent.findIndex((s) => s.id === c.dataset.id), "Recently played");
      };
    }

    const needle = q.toLowerCase();
    shown = all.filter((s) => !needle || (s.name + " " + (s.artist || "") + " " + (s.album || "")).toLowerCase().includes(needle))
      .sort(SORTS[sort].fn);
    list.innerHTML = shown.length ? shown.map((s, i) => songRow(s, i)).join("")
      : `<div class="state small"><p>Nothing matches “${esc(q)}”</p></div>`;
    markPlaying(v);
    if (animate) { enter(list.children, { y: 8, step: 16, max: 16 }); enter(shelfRow.children, { y: 12, step: 30, max: 8 }); }
  }

  v.querySelector("[data-add]").onclick = chooseFiles;
  list.addEventListener("click", (e) => { if (e.target.closest(".empty-drop")) chooseFiles(); });
  v.querySelector("[data-playall]").onclick = () => { player.shuffle && player.toggleShuffle(); player.playList(shown.length ? shown : lib.songs, 0, "Library"); };
  v.querySelector("[data-shuffle]").onclick = () => player.playList(shown.length ? shown : lib.songs, 0, "Library", { shuffleAll: true });
  const qi = $("#libq", v);
  qi.addEventListener("input", () => { q = qi.value.trim(); draw(false); });
  qi.addEventListener("keydown", (e) => { if (e.key === "Escape") { qi.value = ""; q = ""; draw(false); qi.blur(); } });
  $("#sortbtn", v).onclick = (e) => menu(e.currentTarget, Object.entries(SORTS).map(([k, s]) => ({
    label: s.label, icon: k === sort ? "check" : "", fn: () => {
      sort = k; store.set("play_sort", k);
      $("#sortbtn span", v).textContent = s.label;
      draw(true);
    },
  })));

  draw(true);
  enter(v.querySelectorAll(".phead > *"), { y: 14, step: 60 });
  const offs = [bus.on("lib", () => draw(false)), bus.on("player:track", () => markPlaying(v)), bus.on("player:state", () => markPlaying(v))];
  return () => offs.forEach((f) => f());
}

/* ---------- playlists ---------- */
export function playlists(v) {
  if (!auth.user) return landing(v);
  v.innerHTML = `<header class="phead"><div class="phead-text"><h1 class="display">Playlists</h1><p class="sub" id="plsub"></p></div>
    <div class="phead-actions"><button class="btn primary" data-new>${icon("plus")}<span>New playlist</span></button></div></header>
    <div class="grid" id="plgrid"></div>`;
  const grid = $("#plgrid", v);
  const draw = (animate) => {
    const pls = lib.playlists;
    $("#plsub", v).textContent = pls.length ? plural(pls.length, "playlist") : "";
    if (lib.plStatus === "loading" && !pls.length) {
      grid.innerHTML = Array.from({ length: 4 }, () => `<div class="card skel"><div class="card-art"></div><i></i><i></i></div>`).join("");
      return;
    }
    if (!pls.length) {
      grid.innerHTML = `<div class="state wide"><div class="state-ic">${icon("playlist")}</div><h3>No playlists yet</h3>
        <p>Group songs for a mood, a drive, a night in.</p></div>`;
      return;
    }
    grid.innerHTML = pls.map((p) => `<a class="card" href="#/playlist/${p.id}">
      <span class="card-art">${collage(p)}<span class="card-play" data-play="${p.id}" role="button" aria-label="Play ${esc(p.name)}">${icon("play", true)}</span></span>
      <span class="card-t">${esc(p.name)}</span><span class="card-s">${plural(p.songCount, "song")}</span></a>`).join("");
    if (animate) enter(grid.children, { y: 14, step: 35, max: 12 });
  };
  grid.addEventListener("click", async (e) => {
    const pb = e.target.closest("[data-play]");
    if (!pb) return;
    e.preventDefault();
    const pl = lib.playlists.find((x) => x.id === pb.dataset.play);
    try {
      const d = await api.get("/api/playlists/" + pb.dataset.play);
      if (d.songs.length) player.playList(d.songs, 0, pl ? pl.name : "Playlist");
      else toast("This playlist is empty");
    } catch (err) { toast(err.message, { kind: "error" }); }
  });
  v.querySelector("[data-new]").onclick = async () => {
    const r = await formSheet("New playlist", [{ name: "name", label: "Name", placeholder: "Late night" }], "Create");
    if (!r) return;
    try { const p = await lib.createPlaylist(r.name || "New playlist"); location.hash = "#/playlist/" + p.id; }
    catch (e) { toast(e.message, { kind: "error" }); }
  };
  draw(true);
  enter(v.querySelectorAll(".phead > *"), { y: 14, step: 60 });
  if (lib.plStatus !== "ready") lib.loadPlaylists();
  const off = bus.on("playlists", () => draw(false));
  return off;
}

export function playlist(v, id) {
  if (!auth.user) return landing(v);
  let data = null;
  v.innerHTML = `<div class="state"><div class="spinner"></div></div>`;
  const load = async (animate) => {
    try { data = await api.get("/api/playlists/" + id); }
    catch (e) {
      v.innerHTML = `<div class="state"><div class="state-ic">${icon("warning-circle")}</div><h3>${e.status === 404 ? "Playlist not found" : "Couldn't open this playlist"}</h3>
        <p>${esc(e.message)}</p><a class="btn soft" href="#/playlists">Back to playlists</a></div>`;
      return;
    }
    const songs = data.songs;
    const total = songs.reduce((a, s) => a + (s.duration || 0), 0);
    const covers = { covers: songs.slice(0, 4).map((s) => ({ id: s.id, name: s.name, art: s.artworkUrl })), id };
    v.innerHTML = `<a class="back" href="#/playlists">${icon("arrow-left")}<span>Playlists</span></a>
      <header class="pl-head">
        <div class="pl-art">${collage(covers)}</div>
        <div class="pl-info"><h1 class="display">${esc(data.name)}</h1>
          <p class="sub">${plural(songs.length, "song")}${songs.length ? " · " + fmtTotal(total) : ""}</p>
          <div class="phead-actions">
            <button class="btn primary" data-playall ${songs.length ? "" : "disabled"}>${icon("play", true)}<span>Play</span></button>
            <button class="btn soft" data-shuffle ${songs.length ? "" : "disabled"}>${icon("shuffle")}<span>Shuffle</span></button>
            <button class="btn soft" data-addsongs>${icon("plus")}<span>Add songs</span></button>
            <button class="iconbtn lg" data-plmore aria-label="Playlist options">${icon("dots-three")}</button>
          </div></div></header>
      <div class="list" id="plsongs">${songs.length ? songs.map((s, i) => songRow(s, i)).join("")
        : `<div class="state small"><p>No songs yet. Add some from your library.</p></div>`}</div>`;
    bindRows($("#plsongs", v), () => data.songs, data.name, { playlistId: id });
    markPlaying(v);
    v.querySelector("[data-playall]").onclick = () => { player.shuffle && player.toggleShuffle(); player.playList(data.songs, 0, data.name); };
    v.querySelector("[data-shuffle]").onclick = () => player.playList(data.songs, 0, data.name, { shuffleAll: true });
    v.querySelector("[data-addsongs]").onclick = () => addSongsSheet(id, data, () => load(false));
    v.querySelector("[data-plmore]").onclick = (e) => menu(e.currentTarget, [
      { label: "Rename", icon: "pencil-simple", fn: async () => {
        const r = await formSheet("Rename playlist", [{ name: "name", label: "Name", value: data.name }]);
        if (r && r.name) { try { await lib.renamePlaylist(id, r.name); load(false); } catch (err) { toast(err.message, { kind: "error" }); } }
      } },
      { label: "Delete playlist", icon: "trash", danger: true, fn: async () => {
        if (!(await confirmSheet("Delete “" + data.name + "”?", "The songs stay in your library.", "Delete", true))) return;
        try { await lib.deletePlaylist(id); location.hash = "#/playlists"; toast("Playlist deleted"); } catch (err) { toast(err.message, { kind: "error" }); }
      } },
    ]);
    if (animate) {
      enter(v.querySelectorAll(".pl-info > *"), { y: 14, step: 60, delay: 60 });
      enter($("#plsongs", v).children, { y: 8, step: 16, delay: 120 });
      const a = A();
      if (a) a.animate(v.querySelector(".pl-art"), { opacity: [0, 1], scale: [0.9, 1], duration: 700, ease: spring(0.2, 700) });
    }
  };
  load(true);
  const offs = [
    bus.on("player:track", () => markPlaying(v)), bus.on("player:state", () => markPlaying(v)),
    bus.on("playlist:remove", async ({ playlistId, songId }) => {
      if (playlistId !== id) return;
      try { await lib.removeFromPlaylist(id, songId); load(false); toast("Removed from playlist"); } catch (e) { toast(e.message, { kind: "error" }); }
    }),
    bus.on("song", () => { if (data) load(false); }),
  ];
  return () => offs.forEach((f) => f());
}

function addSongsSheet(pid, data, after) {
  const inPl = new Set(data.songs.map((s) => s.id));
  const sh = sheet(`<h3 class="sheet-title">Add to “${esc(data.name)}”</h3>
    <label class="search">${icon("magnifying-glass")}<input id="addq" placeholder="Search your library" autocomplete="off"></label>
    <div class="pick-list tall" id="addlist"></div>
    <div class="sheet-actions"><button class="btn primary" data-close>Done</button></div>`, { cls: "wide", onClose: after });
  const listEl = sh.el.querySelector("#addlist");
  const draw = (q = "") => {
    const n = q.toLowerCase();
    const songs = lib.songs.filter((s) => !n || (s.name + " " + s.artist).toLowerCase().includes(n));
    listEl.innerHTML = songs.length ? songs.map((s) => `<button class="pick${inPl.has(s.id) ? " added" : ""}" data-s="${s.id}">
      <span class="pick-art">${img(s)}</span><span>${esc(s.name)}<small>${esc(s.artist || "Unknown artist")}</small></span>
      <span class="pick-tick">${icon(inPl.has(s.id) ? "check" : "plus")}</span></button>`).join("")
      : `<div class="state small"><p>${lib.songs.length ? "No matches" : "Your library is empty"}</p></div>`;
  };
  listEl.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-s]");
    if (!b || inPl.has(b.dataset.s)) return;
    inPl.add(b.dataset.s);
    b.classList.add("added");
    b.querySelector(".pick-tick").innerHTML = icon("check");
    try { await lib.addToPlaylist(pid, b.dataset.s); }
    catch (err) { inPl.delete(b.dataset.s); draw(sh.el.querySelector("#addq").value); toast(err.message, { kind: "error" }); }
  });
  sh.el.querySelector("#addq").addEventListener("input", (e) => draw(e.target.value.trim()));
  draw();
}

/* ---------- settings ---------- */
export function settings(v) {
  const u = auth.user;
  const motion = document.documentElement.dataset.motion || "auto";
  v.innerHTML = `<header class="phead"><div class="phead-text"><h1 class="display">Settings</h1></div></header>
    <section class="group"><h2 class="h2">Account</h2><div class="card-list">
      ${u ? `<div class="set"><span class="avatar">${u.pic ? `<img src="${esc(u.pic)}" alt="" referrerpolicy="no-referrer">` : esc((u.name || u.email || "?")[0])}</span>
        <div class="set-main"><b>${esc(u.name || "")}</b><span>${esc(u.email || "")}</span></div>
        <button class="btn soft sm" data-logout>${icon("sign-out")}<span>Sign out</span></button></div>`
      : `<div class="set"><div class="set-main"><b>Not signed in</b><span>Sign in to reach your library.</span></div>
        <button class="btn primary sm" data-signin>Sign in</button></div>`}
    </div></section>
    ${u ? `<section class="group"><h2 class="h2">Storage</h2><div class="card-list" id="storage">
      <div class="set"><span class="dot wait"></span><div class="set-main"><b>Checking…</b><span>&nbsp;</span></div></div></div></section>` : ""}
    <section class="group"><h2 class="h2">Playback</h2><div class="card-list">
      <div class="set"><div class="set-main"><b>Motion</b><span>Animations, lyric movement and the moving artwork light</span></div>
        <div class="seg" id="motionseg">${["auto", "on", "off"].map((m) => `<button data-m="${m}" class="${m === motion ? "on" : ""}">${m[0].toUpperCase() + m.slice(1)}</button>`).join("")}</div></div>
      <div class="set"><div class="set-main"><b>Offline copies</b><span id="cachestat">…</span></div>
        <button class="btn soft sm" data-clear>Clear</button></div>
    </div></section>
    <section class="group"><h2 class="h2">Keyboard</h2><div class="card-list keys">
      ${[["Space", "Play / pause"], ["← →", "Seek 5 seconds"], ["Shift ← →", "Previous / next"], ["↑ ↓", "Volume"], ["M", "Mute"], ["L", "Lyrics"], ["/", "Search library"], ["Esc", "Close"]]
        .map(([k, d]) => `<div class="key"><kbd>${k}</kbd><span>${d}</span></div>`).join("")}
    </div></section>`;
  enter(v.querySelectorAll(".phead, .group"), { y: 14, step: 50 });
  if (u) v.querySelector("[data-logout]").onclick = () => auth.logout();
  else v.querySelector("[data-signin]").onclick = () => auth.signIn();

  $$("#motionseg button", v).forEach((b) => b.onclick = () => {
    const m = b.dataset.m;
    document.documentElement.dataset.motion = m;
    store.set("play_motion", m);
    $$("#motionseg button", v).forEach((x) => x.classList.toggle("on", x === b));
    if (api.token) api.put("/api/preferences", { preferences: { motion: m } }).catch(() => {});
    bus.emit("motion", m);
  });
  const stat = async () => {
    const s = await cache.stats();
    const el = $("#cachestat", v);
    if (el) el.textContent = s.tracks ? `${plural(s.tracks, "song")} · ${fmtBytes(s.bytes)} of ${fmtBytes(s.maxBytes)} — songs you've played start instantly` : "Songs you play are kept here so they start instantly";
  };
  stat();
  v.querySelector("[data-clear]").onclick = async () => {
    if (!(await confirmSheet("Clear offline copies?", "Songs will stream again next time you play them.", "Clear"))) return;
    await cache.clear();
    lib.songs.forEach((s) => { s._cached = false; });
    stat();
    toast("Offline copies cleared");
  };

  if (u) api.get("/api/storage/status").then((st) => {
    const box = $("#storage", v);
    if (!box) return;
    const rows = [];
    const driveOff = /^disabled/.test(st.drive.reason || "");
    rows.push(st.drive.ok
      ? `<div class="set"><span class="dot ok"></span><div class="set-main"><b>Google Drive</b><span>Connected · new uploads go to the “yoshik-play” folder</span></div></div>`
      : driveOff
        ? `<div class="set"><span class="dot idle"></span><div class="set-main"><b>Google Drive</b><span>Turned off on the server (${esc(st.drive.reason)})</span></div></div>`
        : `<div class="set"><span class="dot bad"></span><div class="set-main"><b>Google Drive is offline</b><span>${esc(st.drive.reason || "")}${/invalid_grant/.test(st.drive.reason || "") ? " — songs stored in Drive won't play until it's reconnected." : ""}</span></div></div>`);
    if (st.gridfs && st.gridfs.ok) {
      const pct = Math.min(100, (st.gridfs.usedMB / st.gridfs.capMB) * 100);
      rows.push(`<div class="set"><span class="dot ${st.uploadsTo === "gridfs" ? "ok" : "idle"}"></span><div class="set-main"><b>Backup storage</b>
        <span>${st.uploadsTo === "gridfs" ? "Active — uploads are kept in the database until Drive is back. " : "Standby — used automatically if Drive goes down. "}${st.gridfs.usedMB} MB of ${st.gridfs.capMB} MB used</span>
        <span class="meter"><i style="width:${pct}%"></i></span></div></div>`);
    }
    if (st.uploadsTo === "none") rows.push(`<div class="set warn"><div class="set-main"><b>Uploads are paused</b><span>No storage is reachable right now.</span></div></div>`);
    box.innerHTML = rows.join("");
    enter(box.children, { y: 6, step: 40 });
  }).catch((e) => {
    const box = $("#storage", v);
    if (box) box.innerHTML = `<div class="set"><span class="dot bad"></span><div class="set-main"><b>Couldn't check storage</b><span>${esc(e.message)}</span></div></div>`;
  });
}

/* ---------- drive mint code (scripts/mint-drive-token.js lands here) ---------- */
export function mintCode(v, code) {
  v.innerHTML = `<section class="mint">
    <div class="state-ic big">${icon("hard-drives")}</div>
    <h1 class="display sm">Drive authorization code</h1>
    <p class="sub">Give this to <code>node scripts/mint-drive-token.js "&lt;code&gt;"</code>. It works once, for a few minutes.</p>
    <div class="codebox"><code id="mintcode">${esc(code)}</code><button class="btn primary sm" data-copy>${icon("check")}<span>Copy</span></button></div>
    <button class="btn ghost" data-leave>Back to library</button></section>`;
  v.querySelector("[data-leave]").onclick = () => location.replace(location.pathname + "#/");
  const btn = v.querySelector("[data-copy]");
  btn.querySelector("svg").style.display = "none";
  btn.onclick = async () => {
    try { await navigator.clipboard.writeText(code); btn.querySelector("span").textContent = "Copied"; btn.querySelector("svg").style.display = ""; }
    catch (e) { getSelection().selectAllChildren($("#mintcode", v)); toast("Press Ctrl+C to copy"); }
  };
  enter(v.querySelectorAll(".mint > *"), { y: 14, step: 60 });
}
