/* views: all routes. every async op has loading/empty/error states. */
(function () {
"use strict";
const { utils, api, toast, modal, closeModal, confirmModal, analytics } = window.Play;
const { esc, fmtTime, el, debounce } = utils;
const auth = () => window.Play.auth;
const player = () => window.Play.player;
const cache = () => window.Play.cache;
const lyrics = () => window.Play.lyrics;

/* ---------- shared ---------- */
function trackMenu(track) {
  const m = el('<div class="menu" role="menu"></div>');
  const items = [
    ["play next", () => player().playNext(track)],
    ["add to queue", () => player().addToQueue(track)],
  ];
  if (auth().user) {
    items.push(["add to playlist…", () => playlistPicker(track)]);
    items.push([isLiked(track.id) ? "unlike" : "like", () => toggleLike(track)]);
  }
  items.forEach(([label, fn]) => {
    const b = el(`<button role="menuitem">${esc(label)}</button>`);
    b.onclick = (e) => { e.stopPropagation(); m.remove(); fn(); };
    m.appendChild(b);
  });
  setTimeout(() => document.addEventListener("click", function h() {
    m.remove(); document.removeEventListener("click", h);
  }), 0);
  return m;
}

const likedIds = new Set();
async function refreshLikes() {
  likedIds.clear();
  if (!auth().user) return;
  try {
    const d = await api.get("/api/liked");
    d.tracks.forEach((t) => likedIds.add(t.id));
  } catch (e) {}
}
const isLiked = (id) => likedIds.has(id);

async function toggleLike(track) {
  if (!auth().require()) return;
  const liked = isLiked(track.id);
  /* optimistic */
  liked ? likedIds.delete(track.id) : likedIds.add(track.id);
  document.dispatchEvent(new CustomEvent("likes"));
  try {
    if (liked) await api.del("/api/liked/" + encodeURIComponent(track.id));
    else await api.post("/api/liked", { track });
    analytics.track(liked ? "unlike" : "like", { id: track.id });
  } catch (e) {
    liked ? likedIds.add(track.id) : likedIds.delete(track.id);
    document.dispatchEvent(new CustomEvent("likes"));
    toast("failed: " + e.message);
  }
}

function trackRow(track, i, opts = {}) {
  const row = el(`<div class="trow" role="button" tabindex="0" aria-label="play ${esc(track.title)}">
    <span class="t-num">${i + 1}</span>
    <img loading="lazy" src="${esc(track.albumArt || "")}" alt="" onerror="this.style.visibility='hidden'">
    <div><div class="t-title">${esc(track.title)}</div><div class="t-artist">${esc(track.artists || track.artist)}</div></div>
    <div class="t-artist t-album">${esc(track.album || "")}</div>
    <span class="t-dur">${fmtTime(track.duration)}</span>
    <div class="t-act"><button class="iconbtn" aria-label="more options">···</button></div>
  </div>`);
  const play = () => {
    if (opts.queue) player().playQueue(opts.queue, i);
    else { player().setQueue([track], 0); player().playAt(0); }
  };
  row.addEventListener("click", (e) => { if (!e.target.closest(".t-act")) play(); });
  row.addEventListener("keydown", (e) => { if (e.key === "Enter") play(); });
  row.querySelector(".t-act button").addEventListener("click", (e) => {
    e.stopPropagation();
    const act = row.querySelector(".t-act");
    act.querySelector(".menu")?.remove();
    act.appendChild(trackMenu(track));
  });
  if (player().currentTrack && player().currentTrack.id === track.id) row.classList.add("playing");
  return row;
}

function trackList(tracks) {
  const div = el("<div></div>");
  tracks.forEach((t, i) => div.appendChild(trackRow(t, i, { queue: tracks })));
  return div;
}

function stateBox(kind, msg, retry) {
  if (kind === "loading") {
    return `<div>${[0, 1, 2, 3, 4].map(() =>
      `<div class="skel" style="height:60px;margin:8px 0"></div>`).join("")}</div>`;
  }
  if (kind === "empty") {
    return `<div class="empty"><div class="big">∅</div><p>${esc(msg)}</p></div>`;
  }
  return `<div class="errbox"><p>${esc(msg)}</p>${retry ? `<button class="btn ghost" id="retry">retry</button>` : ""}</div>`;
}

function playlistPicker(track) {
  api.get("/api/playlists").then((d) => {
    const pls = d.playlists || [];
    const bg = modal(`<h3>add to playlist</h3>
      <div style="max-height:260px;overflow-y:auto;margin-bottom:12px">
      ${pls.length ? pls.map((p) => `<button class="txtbtn" style="display:block;width:100%;margin-bottom:8px" data-id="${p._id}">${esc(p.name)}</button>`).join("")
        : '<p class="dim" style="font-size:14px;margin-bottom:12px">no playlists yet.</p>'}
      </div>
      <div class="row"><button class="btn ghost" data-x>cancel</button><button class="btn" data-new>+ new</button></div>`);
    bg.querySelector("[data-x]").onclick = closeModal;
    bg.querySelector("[data-new]").onclick = () => {
      closeModal();
      newPlaylistModal((id) => addToPlaylist(id, track));
    };
    bg.querySelectorAll("[data-id]").forEach((b) => {
      b.onclick = () => { closeModal(); addToPlaylist(b.dataset.id, track); };
    });
  }).catch((e) => toast("failed: " + e.message));
}
async function addToPlaylist(pid, track) {
  try {
    await api.post(`/api/playlists/${pid}/tracks`, { track });
    analytics.track("playlist_add", { pid });
    toast("added to playlist");
  } catch (e) { toast("failed: " + e.message); }
}
function newPlaylistModal(onCreate) {
  const bg = modal(`<h3>new playlist</h3><input id="plname" placeholder="playlist name" maxlength="80">
    <div class="row"><button class="btn ghost" data-x>cancel</button><button class="btn" data-ok>create</button></div>`);
  const input = bg.querySelector("#plname");
  bg.querySelector("[data-x]").onclick = closeModal;
  const go = async () => {
    try {
      const d = await api.post("/api/playlists", { name: input.value });
      analytics.track("playlist_create", {});
      closeModal();
      toast("playlist created");
      if (onCreate) onCreate(d.id);
      else location.hash = "#/playlist/" + d.id;
      document.dispatchEvent(new CustomEvent("playlists"));
    } catch (e) { toast("failed: " + e.message); }
  };
  bg.querySelector("[data-ok]").onclick = go;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

/* ---------- home ---------- */
async function home(v) {
  v.innerHTML = `<div class="pagehead"><div class="greet">${utils.greet()}</div></div><div id="hbody">${stateBox("loading")}</div>`;
  const body = v.querySelector("#hbody");
  try {
    const [hist, pls] = await Promise.all([
      auth().user ? api.get("/api/history?limit=10").catch(() => ({ tracks: [] })) : { tracks: [] },
      auth().user ? api.get("/api/playlists").catch(() => ({ playlists: [] })) : { playlists: [] },
    ]);
    let h = "";
    if (hist.tracks.length) {
      h += `<div class="sec"><h2>recently played</h2><div class="cardgrid">` +
        hist.tracks.slice(0, 5).map((t) => card(t)).join("") + `</div></div>`;
    }
    if (pls.playlists && pls.playlists.length) {
      h += `<div class="sec"><h2>your playlists</h2><div class="cardgrid">` +
        pls.playlists.slice(0, 6).map((p) =>
          `<div class="card" data-pl="${p._id}" tabindex="0" role="button" aria-label="${esc(p.name)}">
            <img loading="lazy" src="${esc((p.tracks[0] || {}).albumArt || "")}" alt="" onerror="this.style.visibility='hidden'">
            <div class="ct">${esc(p.name)}</div><div class="cs">${(p.tracks || []).length} tracks</div></div>`).join("") +
        `</div></div>`;
    }
    let picks = [];
    if (likedIds.size) {
      const d = await api.get("/api/liked").catch(() => ({ tracks: [] }));
      picks = d.tracks.slice(0, 8);
      if (picks.length) {
        h += `<div class="sec"><h2>quick picks</h2><div id="qpicks"></div></div>`;
      }
    }
    if (!h) {
      h = `<div class="empty"><div class="big">♪</div>
        <p>search for music to get started.</p>
        <p style="margin-top:12px"><a class="btn" href="#/search">search</a></p></div>`;
    }
    body.innerHTML = h;
    const qp = body.querySelector("#qpicks");
    if (qp && picks && picks.length) qp.appendChild(trackList(picks));
    body.querySelectorAll("[data-pl]").forEach((c) => {
      const go = () => location.hash = "#/playlist/" + c.dataset.pl;
      c.addEventListener("click", go);
      c.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
    bindCards(body);
  } catch (e) {
    body.innerHTML = stateBox("error", "couldn't load home: " + e.message, true);
    body.querySelector("#retry")?.addEventListener("click", () => home(v));
  }
}
function card(t) {
  return `<div class="card" data-track='${esc(JSON.stringify(t))}' tabindex="0" role="button" aria-label="play ${esc(t.title)}">
    <img loading="lazy" src="${esc(t.albumArt || "")}" alt="" onerror="this.style.visibility='hidden'">
    <div class="ct">${esc(t.title)}</div><div class="cs">${esc(t.artists || t.artist)}</div></div>`;
}
function bindCards(root) {
  root.querySelectorAll("[data-track]").forEach((c) => {
    const t = JSON.parse(c.dataset.track);
    const go = () => { player().setQueue([t], 0); player().playAt(0); };
    c.addEventListener("click", go);
    c.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  });
}

/* ---------- search ---------- */
function search(v) {
  v.innerHTML = `<div class="pagehead"><h1>search</h1></div>
    <div class="searchbox"><input id="q" placeholder="songs, artists, albums…" aria-label="search" autocomplete="off"></div>
    <div id="res"></div>`;
  const input = v.querySelector("#q"), res = v.querySelector("#res");
  const doSearch = debounce(async () => {
    const q = input.value.trim();
    if (!q) { res.innerHTML = ""; return; }
    res.innerHTML = stateBox("loading");
    analytics.track("search", { q: q.slice(0, 40) });
    try {
      const d = await api.get("/api/search?q=" + encodeURIComponent(q));
      const tracks = d.tracks || [];
      if (!tracks.length) { res.innerHTML = stateBox("empty", `no results for “${q}”`); return; }
      /* categorize: tracks + derived artists/albums */
      const artists = [], albums = [], seenA = new Set(), seenAl = new Set();
      tracks.forEach((t) => {
        if (t.artistId && !seenA.has(t.artistId)) { seenA.add(t.artistId); artists.push(t); }
        if (t.collectionId && !seenAl.has(t.collectionId)) { seenAl.add(t.collectionId); albums.push(t); }
      });
      let h = `<div class="sec"><h2>tracks</h2><div id="s-tracks"></div></div>`;
      if (artists.length) {
        h += `<div class="sec"><h2>artists</h2><div class="cardgrid">` +
          artists.slice(0, 6).map((t) =>
            `<div class="card" data-go="#/artist/${esc(t.artistId)}" tabindex="0" role="link">
              <img loading="lazy" src="${esc(t.albumArt)}" alt="" onerror="this.style.visibility='hidden'">
              <div class="ct">${esc(t.artist)}</div><div class="cs">artist</div></div>`).join("") + `</div></div>`;
      }
      if (albums.length) {
        h += `<div class="sec"><h2>albums</h2><div class="cardgrid">` +
          albums.slice(0, 6).map((t) =>
            `<div class="card" data-go="#/album/${esc(t.collectionId)}" tabindex="0" role="link">
              <img loading="lazy" src="${esc(t.albumArt)}" alt="" onerror="this.style.visibility='hidden'">
              <div class="ct">${esc(t.album)}</div><div class="cs">${esc(t.artist)}</div></div>`).join("") + `</div></div>`;
      }
      res.innerHTML = h;
      res.querySelector("#s-tracks").appendChild(trackList(tracks.slice(0, 10)));
      res.querySelectorAll("[data-go]").forEach((c) => {
        const go = () => location.hash = c.dataset.go;
        c.addEventListener("click", go);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
      });
    } catch (e) {
      res.innerHTML = stateBox("error", "search failed: " + e.message, true);
      res.querySelector("#retry")?.addEventListener("click", doSearch);
    }
  }, 400);
  input.addEventListener("input", doSearch);
  setTimeout(() => input.focus(), 50);
}

/* ---------- library ---------- */
async function library(v) {
  if (!auth().require()) return;
  v.innerHTML = `<div class="pagehead"><h1>library</h1></div><div id="lbody">${stateBox("loading")}</div>`;
  const body = v.querySelector("#lbody");
  try {
    const d = await api.get("/api/playlists");
    const pls = d.playlists || [];
    body.innerHTML =
      `<div class="sec"><div class="cardgrid">
        <div class="card" data-go="#/liked" tabindex="0" role="link">
          <div style="font-size:44px;margin:18px 0">♥</div>
          <div class="ct">liked songs</div><div class="cs">${likedIds.size} tracks</div></div>
        ${pls.map((p) => `<div class="card" data-go="#/playlist/${p._id}" tabindex="0" role="link">
          <img loading="lazy" src="${esc((p.tracks[0] || {}).albumArt || "")}" alt="" onerror="this.style.visibility='hidden'">
          <div class="ct">${esc(p.name)}</div><div class="cs">${(p.tracks || []).length} tracks</div></div>`).join("")}
      </div></div>
      <button class="btn ghost" id="newpl2">+ new playlist</button>`;
    body.querySelector("#newpl2").onclick = () => newPlaylistModal();
    body.querySelectorAll("[data-go]").forEach((c) => {
      const go = () => location.hash = c.dataset.go;
      c.addEventListener("click", go);
      c.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  } catch (e) {
    body.innerHTML = stateBox("error", "couldn't load library: " + e.message, true);
    body.querySelector("#retry")?.addEventListener("click", () => library(v));
  }
}

/* ---------- liked ---------- */
async function liked(v) {
  if (!auth().require()) return;
  v.innerHTML = `<div class="pagehead"><h1>liked songs</h1><div class="sub" id="lsub"></div></div><div id="lbody">${stateBox("loading")}</div>`;
  const body = v.querySelector("#lbody");
  const load = async () => {
    try {
      const d = await api.get("/api/liked");
      const tracks = d.tracks || [];
      likedIds.clear(); tracks.forEach((t) => likedIds.add(t.id));
      v.querySelector("#lsub").textContent = tracks.length + " tracks";
      if (!tracks.length) {
        body.innerHTML = stateBox("empty", "nothing liked yet — tap ♡ on any track.");
        return;
      }
      body.innerHTML = `<div style="margin-bottom:12px;display:flex;gap:8px">
          <button class="btn" id="playall">play</button>
          <button class="btn ghost" id="shuffleall">shuffle</button></div>
        <div id="liked-tracks"></div>`;
      body.querySelector("#liked-tracks").appendChild(trackList(tracks));
      body.querySelector("#playall").onclick = () => player().playQueue(tracks, 0);
      body.querySelector("#shuffleall").onclick = () => {
        const was = player().shuffle; player().shuffle = true;
        player().playQueue(tracks, 0); player().shuffle = was;
      };
    } catch (e) {
      body.innerHTML = stateBox("error", "couldn't load liked songs: " + e.message, true);
      body.querySelector("#retry")?.addEventListener("click", load);
    }
  };
  document.addEventListener("likes", load, { once: true });
  await load();
}

/* ---------- playlist detail ---------- */
async function playlistDetail(v, id) {
  if (!auth().require()) return;
  v.innerHTML = `<div id="pbody">${stateBox("loading")}</div>`;
  const body = v.querySelector("#pbody");
  const load = async () => {
    try {
      const { playlist: p } = await api.get("/api/playlists/" + encodeURIComponent(id));
      const tracks = p.tracks || [];
      body.innerHTML = `
        <div class="pagehead"><h1>${esc(p.name)}</h1><div class="sub">${tracks.length} tracks</div></div>
        <div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="pp">play</button>
          <button class="btn ghost" id="ps">shuffle</button>
          <button class="txtbtn" id="pr">rename</button>
          <button class="txtbtn" id="pdel" style="color:var(--danger)">delete</button>
        </div>
        <div id="plist">${tracks.length ? tracks.map((t, i) =>
          `<div class="trow" data-i="${i}" tabindex="0">
            <span class="t-num">${i + 1}</span>
            <img loading="lazy" src="${esc(t.albumArt || "")}" alt="" onerror="this.style.visibility='hidden'">
            <div><div class="t-title">${esc(t.title)}</div><div class="t-artist">${esc(t.artists || t.artist)}</div></div>
            <div class="t-artist t-album">${esc(t.album || "")}</div>
            <span class="t-dur">${fmtTime(t.duration)}</span>
            <div class="t-act" style="display:flex;gap:2px">
              <button class="iconbtn" data-up aria-label="move up">↑</button>
              <button class="iconbtn" data-dn aria-label="move down">↓</button>
              <button class="iconbtn" data-rm aria-label="remove">✕</button>
            </div></div>`).join("")
          : stateBox("empty", "this playlist is empty — search for songs and add them here.")}</div>`;
      body.querySelector("#pp").onclick = () => tracks.length && player().playQueue(tracks, 0);
      body.querySelector("#ps").onclick = () => {
        if (!tracks.length) return;
        const was = player().shuffle; player().shuffle = true;
        player().playQueue(tracks, 0); player().shuffle = was;
      };
      body.querySelector("#pr").onclick = () => {
        const bg = modal(`<h3>rename playlist</h3><input id="rname" value="${esc(p.name)}" maxlength="80">
          <div class="row"><button class="btn ghost" data-x>cancel</button><button class="btn" data-ok>save</button></div>`);
        bg.querySelector("[data-x]").onclick = closeModal;
        bg.querySelector("[data-ok]").onclick = async () => {
          try { await api.put("/api/playlists/" + id, { name: bg.querySelector("#rname").value }); closeModal(); load(); }
          catch (e) { toast("failed: " + e.message); }
        };
      };
      body.querySelector("#pdel").onclick = () =>
        confirmModal("delete playlist", `delete “${p.name}”? this can't be undone.`, "delete", async () => {
          await api.del("/api/playlists/" + id);
          document.dispatchEvent(new CustomEvent("playlists"));
          location.hash = "#/library";
        });
      body.querySelectorAll("#plist .trow").forEach((row) => {
        const i = +row.dataset.i;
        row.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          player().playQueue(tracks, i);
        });
        row.querySelector("[data-up]").onclick = async (e) => {
          e.stopPropagation();
          if (i === 0) return;
          await api.put(`/api/playlists/${id}/tracks/reorder`, { trackId: tracks[i].id, toIndex: i - 1 });
          load();
        };
        row.querySelector("[data-dn]").onclick = async (e) => {
          e.stopPropagation();
          await api.put(`/api/playlists/${id}/tracks/reorder`, { trackId: tracks[i].id, toIndex: i + 1 });
          load();
        };
        row.querySelector("[data-rm]").onclick = async (e) => {
          e.stopPropagation();
          await api.del(`/api/playlists/${id}/tracks/` + encodeURIComponent(tracks[i].id));
          load();
        };
      });
    } catch (e) {
      body.innerHTML = stateBox("error", "couldn't load playlist: " + e.message, true);
      body.querySelector("#retry")?.addEventListener("click", load);
    }
  };
  await load();
}

/* ---------- album / artist ---------- */
async function albumView(v, id) {
  v.innerHTML = `<div id="abody">${stateBox("loading")}</div>`;
  const body = v.querySelector("#abody");
  try {
    const { album: a } = await api.get("/api/album/" + encodeURIComponent(id));
    const tracks = a.tracks || [];
    body.innerHTML = `<div class="pagehead" style="display:flex;gap:20px;align-items:center">
        <img src="${esc(a.albumArt)}" alt="" style="width:160px;height:160px;border-radius:8px;object-fit:cover" onerror="this.style.visibility='hidden'">
        <div><h1>${esc(a.title)}</h1><div class="sub">${esc(a.artist)} · ${tracks.length} tracks</div>
        <div style="margin-top:12px"><button class="btn" id="ap">play</button></div></div></div>
      <div id="album-tracks"></div>`;
    body.querySelector("#album-tracks").appendChild(trackList(tracks));
    body.querySelector("#ap").onclick = () => tracks.length && player().playQueue(tracks, 0);
  } catch (e) {
    body.innerHTML = stateBox("error", "couldn't load album: " + e.message, true);
  }
}
async function artistView(v, id) {
  v.innerHTML = `<div id="arbody">${stateBox("loading")}</div>`;
  const body = v.querySelector("#arbody");
  try {
    const { artist: a } = await api.get("/api/artist/" + encodeURIComponent(id));
    body.innerHTML = `<div class="pagehead"><h1>${esc(a.name)}</h1><div class="sub">artist</div></div>
      <div class="sec"><h2>albums</h2><div class="cardgrid">
      ${(a.albums || []).map((al) => `<div class="card" data-go="#/album/${esc(al.id)}" tabindex="0" role="link">
        <img loading="lazy" src="${esc(al.albumArt)}" alt="" onerror="this.style.visibility='hidden'">
        <div class="ct">${esc(al.title)}</div></div>`).join("") || stateBox("empty", "no albums found.")}
      </div></div>`;
    body.querySelectorAll("[data-go]").forEach((c) => {
      const go = () => location.hash = c.dataset.go;
      c.addEventListener("click", go);
      c.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    });
  } catch (e) {
    body.innerHTML = stateBox("error", "couldn't load artist: " + e.message, true);
  }
}

/* ---------- settings ---------- */
async function settings(v) {
  const u = auth().user;
  v.innerHTML = `<div class="pagehead"><h1>settings</h1></div>
    <div class="sec"><h2>account</h2>
      ${u ? `<div class="setrow"><div><div class="lab">${esc(u.name)}</div><div class="desc">${esc(u.email)}</div></div>
        <button class="btn ghost" id="logout">sign out</button></div>`
      : `<div class="setrow"><div><div class="lab">not signed in</div>
        <div class="desc">sign in to sync liked songs and playlists.</div></div></div>
        <div id="gsi" style="margin-top:12px"></div>`}
    </div>
    <div class="sec"><h2>playback</h2>
      <div class="setrow"><div><div class="lab">motion</div><div class="desc">animations and lyric transitions</div></div>
        <div class="seg" id="segs-motion"><button data-v="auto">auto</button><button data-v="on">on</button><button data-v="off">off</button></div></div>
    </div>
    <div class="sec"><h2>offline cache</h2>
      <div class="setrow"><div><div class="lab">downloaded tracks</div><div class="desc" id="cachestat">…</div></div>
        <button class="btn ghost" id="clearcache">clear</button></div>
    </div>
    <div class="sec"><h2>privacy</h2>
      <div class="setrow"><div><div class="lab">analytics</div><div class="desc">local-only event log, never leaves your device</div></div>
        <button class="txtbtn" id="viewan">view</button></div>
    </div>`;
  if (!u) auth().renderButton(v.querySelector("#gsi"));
  else v.querySelector("#logout").onclick = () => auth().logout();

  /* motion seg */
  const mv = document.documentElement.dataset.motion || "auto";
  const seg = v.querySelector("#segs-motion");
  seg.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("on", b.dataset.v === mv);
    b.onclick = () => {
      document.documentElement.dataset.motion = b.dataset.v;
      try { localStorage.setItem("play_motion", b.dataset.v); } catch (e) {}
      seg.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      if (u) api.put("/api/preferences", { preferences: { motion: b.dataset.v } }).catch(() => {});
    };
  });
  try {
    const s = await cache().stats();
    v.querySelector("#cachestat").textContent =
      `${s.tracks} tracks · ${(s.bytes / 1048576).toFixed(1)}mb of ${(s.maxBytes / 1048576).toFixed(0)}mb`;
  } catch (e) { v.querySelector("#cachestat").textContent = "unavailable"; }
  v.querySelector("#clearcache").onclick = () =>
    confirmModal("clear cache", "delete all downloaded tracks? they'll re-download on next play.", "clear", async () => {
      await cache().clear();
      toast("cache cleared");
      settings(v);
    });
  v.querySelector("#viewan").onclick = () => {
    const log = window.Play.analytics.get();
    modal(`<h3>analytics (local)</h3><div style="max-height:300px;overflow-y:auto;font-size:12px" class="mono dim">
      ${log.length ? log.slice(-50).reverse().map((e) => `<div>${esc(e.at)} — ${esc(e.event)}</div>`).join("") : "no events yet."}
      </div><div class="row" style="margin-top:12px"><button class="btn ghost" data-x>close</button></div>`)
      .querySelector("[data-x]").onclick = closeModal;
  };
}

window.Play.views = { home, search, library, liked, playlistDetail, albumView, artistView, settings, refreshLikes, isLiked, toggleLike, trackRow, newPlaylistModal };
})();
