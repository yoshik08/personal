/* views: home (personal library) + settings. uploads-only. */
(function () {
"use strict";
const { utils, api, toast, modal, closeModal, confirmModal, analytics } = window.Play;
const { esc, fmtTime, el, debounce } = utils;
const auth = () => window.Play.auth;
const player = () => window.Play.player;
const cache = () => window.Play.cache;
const lyrics = () => window.Play.lyrics;

// last-good songs in memory: remount doesn't wipe the library after upload
let lastGoodSongs = null;

function stateBox(kind, msg, retry) {
  if (kind === "loading") {
    return `<div class="loading"><div class="spinner"></div><p>loading…</p></div>`;
  }
  if (kind === "empty") {
    return `<div class="empty"><div class="big">∅</div><p>${esc(msg)}</p></div>`;
  }
  return `<div class="errbox"><p>${esc(msg)}</p>${retry ? `<button class="btn ghost" id="retry">retry</button>` : ""}</div>`;
}

function fmtDur(secs) {
  if (!secs) return "--:--";
  const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
  return m + ":" + String(s).padStart(2, "0");
}

/* normalize a library song to the player track shape */
function toTrack(song) {
  const artist = (song.spotifyMatch && song.spotifyMatch.artist) || "";
  return {
    id: song.id,
    title: song.name,
    artist: artist,
    artists: artist,
    album: (song.spotifyMatch && song.spotifyMatch.album) || "",
    albumArt: (song.spotifyMatch && song.spotifyMatch.artworkUrl) || "",
    duration: Math.round(song.duration || 0),
    audioUrl: "/api/songs/" + song.id + "/audio",
    _song: song,
  };
}

/* ---------- home: personal library ---------- */
async function home(v, optimisticSongs) {
  const { api, upload, toast } = window.Play;
  v.innerHTML = `<div class="pagehead"><div class="greet">your library</div></div>
    <div id="uploaddz" class="uploaddz" title="upload audio">
      <div class="dz-icon">+</div>
      <div class="dz-text">drop audio here<br><span class="dim">or tap to choose</span></div>
      <input type="file" id="dzFile" accept="audio/*" style="display:none">
    </div>
    <div id="hbody">${optimisticSongs ? "" : stateBox("loading")}</div>`;
  const body = v.querySelector("#hbody");

  // UI-level guarantee: never show loading spinner for more than 5s
  // (independent of API AbortController — force-clears even if fetch hangs)
  let loadingCleared = false;
  const forceClearLoading = setTimeout(() => {
    if (loadingCleared) return;
    loadingCleared = true;
    const lb = v.querySelector("#hbody");
    if (lb && lb.innerHTML.includes("loading")) {
      if (lastGoodSongs && lastGoodSongs.length) {
        // re-render with cached songs (avoid infinite recursion)
        home(v, lastGoodSongs);
      } else {
        lb.innerHTML = `<div class="empty"><div class="big">♪</div><p>nothing here yet</p></div>`;
      }
    }
  }, 5000);

  // wire the persistent dropzone (works even if library fails to load)
  const dz = v.querySelector("#uploaddz");
  const dzFile = v.querySelector("#dzFile");
  if (dz && dzFile) {
    dz.onclick = () => dzFile.click();
    dzFile.onchange = (e) => {
      if (e.target.files[0]) showNameDialog(e.target.files[0], [], v, body);
    };
    ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault(); dz.classList.add("dragover");
    }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => {
      e.preventDefault(); dz.classList.remove("dragover");
    }));
    dz.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files[0];
      if (f) showNameDialog(f, [], v, body);
    });
  }

  if (!auth().user) {
    body.innerHTML = `<div class="empty"><div class="big">♪</div>
      <p>sign in to access your personal library.</p>
      <p style="margin-top:12px"><a class="btn" href="#/settings">sign in</a></p></div>`;
    return;
  }

  try {
    // if we just uploaded, show the song immediately without waiting for API
    let songs;
    if (optimisticSongs && optimisticSongs.length) {
      songs = optimisticSongs;
      lastGoodSongs = songs;
      loadingCleared = true;
      clearTimeout(forceClearLoading);
    } else {
      // 5s timeout with AbortController; on failure keep last-good songs if we have them
      try {
        const d = await api.get("/api/songs", 5000);
        songs = d.songs || [];
        lastGoodSongs = songs;
        loadingCleared = true;
        clearTimeout(forceClearLoading);
      } catch (e) {
        loadingCleared = true;
        clearTimeout(forceClearLoading);
        if (lastGoodSongs && lastGoodSongs.length) {
          songs = lastGoodSongs; // show cached library, don't wipe after upload
        } else {
          // no cached songs: show error with retry, not fake empty
          body.innerHTML = stateBox("error", "couldn't load library: " + e.message + " — your uploads are safe", true);
          body.querySelector("#retry").onclick = () => home(v);
          return;
        }
      }
    }

    if (!songs.length) {
      body.innerHTML = `<div class="empty" id="dropzone">
        <div class="big">♪</div>
        <p>nothing here yet</p>
        <p class="dim" style="margin-top:8px">enter your audio file</p>
        <p style="margin-top:16px">
          <button class="btn" id="pickFile">choose file</button>
        </p>
        <p class="dim" style="margin-top:8px;font-size:12px">or drag & drop mp3 here</p>
        <input type="file" id="fileInput" accept="audio/*" style="display:none">
      </div>`;
      setupUpload(body, v);
      return;
    }

    // library with search + upload button
    // de-emphasize the giant dropzone now that songs exist
    const dzTop = v.querySelector("#uploaddz");
    if (dzTop) dzTop.classList.add("compact");
    body.innerHTML = `<div class="searchbox"><input id="libq" placeholder="search your library…" aria-label="search library"></div>
      <div style="margin:12px 0"><button class="btn" id="uploadBtn">+ add music</button>
      <input type="file" id="fileInput" accept="audio/*" style="display:none"></div>
      <div id="songlist"></div>`;

    const renderSongs = (filter) => {
      const list = body.querySelector("#songlist");
      const filtered = filter
        ? songs.filter((s) => (s.name + " " + ((s.spotifyMatch && s.spotifyMatch.artist) || "")).toLowerCase().includes(filter.toLowerCase()))
        : songs;
      if (!filtered.length) {
        list.innerHTML = `<p class="dim">no matches</p>`;
        return;
      }
      list.innerHTML = filtered.map((s) => `
        <div class="trackrow" data-song='${esc(JSON.stringify(s))}'>
          <img src="${esc((s.spotifyMatch && s.spotifyMatch.artworkUrl) || "")}" alt="" onerror="this.style.visibility='hidden'">
          <div class="tinfo"><div class="tt">${esc(s.name)}</div>
          <div class="ta">${esc((s.spotifyMatch && s.spotifyMatch.artist) || "unknown artist")} · ${fmtDur(s.duration)}</div></div>
          <button class="iconbtn" data-act="menu" aria-label="options">⋯</button>
        </div>`).join("");
      bindSongRows(list, songs, v);
    };

    renderSongs("");
    body.querySelector("#libq").addEventListener("input", (e) => renderSongs(e.target.value));
    body.querySelector("#uploadBtn").onclick = () => body.querySelector("#fileInput").click();
    body.querySelector("#fileInput").addEventListener("change", (e) => {
      if (e.target.files[0]) showNameDialog(e.target.files[0], songs, v, body);
    });
  } catch (e) {
    body.innerHTML = stateBox("error", "couldn't load library: " + e.message, true);
  }
}

function bindSongRows(list, songs, v) {
  list.querySelectorAll(".trackrow").forEach((row) => {
    const s = JSON.parse(row.dataset.song);
    row.addEventListener("click", (e) => {
      if (e.target.dataset.act === "menu") {
        showSongMenu(s, v);
        return;
      }
      // play immediately on click
      const { player } = window.Play;
      const tracks = songs.map(toTrack);
      const idx = songs.findIndex((x) => x.id === s.id);
      player().playQueue(tracks, idx);
    });
  });
}

function showSongMenu(song, v) {
  const { api, toast, modal, closeModal, confirmModal } = window.Play;
  const p = window.Play.player;
  const bg = modal(`<h3>${esc(song.name)}</h3>
    <div style="display:flex;flex-direction:column">
      <button class="txtbtn" data-a="next" style="text-align:left;padding:12px 4px">play next</button>
      <button class="txtbtn" data-a="queue" style="text-align:left;padding:12px 4px">add to queue</button>
      <button class="txtbtn" data-a="rename" style="text-align:left;padding:12px 4px">rename</button>
      <button class="txtbtn" data-a="artwork" style="text-align:left;padding:12px 4px">refresh cover art</button>
      <button class="txtbtn" data-a="lyrics" style="text-align:left;padding:12px 4px">refresh lyrics</button>
      <button class="txtbtn" data-a="delete" style="text-align:left;padding:12px 4px;color:var(--danger)">delete</button>
    </div>
    <div class="row" style="margin-top:12px"><button class="btn ghost" data-x>close</button></div>`);
  bg.querySelector("[data-x]").onclick = closeModal;
  bg.querySelectorAll("[data-a]").forEach((b) => {
    b.onclick = async () => {
      const a = b.dataset.a;
      if (a === "next") { closeModal(); p.playNext(toTrack(song)); }
      else if (a === "queue") { closeModal(); p.addToQueue(toTrack(song)); }
      else if (a === "rename") {
        closeModal();
        const curArtist = (song.spotifyMatch && song.spotifyMatch.artist) || "";
        const bg2 = modal(`<h3>rename</h3>
          <label style="display:block;margin:8px 0 4px;font-size:12px;color:var(--muted)">title</label>
          <input id="rname" value="${esc(song.name)}" maxlength="200">
          <label style="display:block;margin:8px 0 4px;font-size:12px;color:var(--muted)">artist</label>
          <input id="rartist" value="${esc(curArtist)}" maxlength="200" placeholder="artist name">
          <div class="row"><button class="btn ghost" data-x>cancel</button><button class="btn" data-ok>save</button></div>`);
        bg2.querySelector("[data-x]").onclick = closeModal;
        bg2.querySelector("[data-ok]").onclick = async () => {
          const name = bg2.querySelector("#rname").value.trim();
          const artist = bg2.querySelector("#rartist").value.trim();
          const patch = {};
          if (name && name !== song.name) patch.name = name;
          if (artist !== curArtist) {
            patch.spotifyMatch = { ...(song.spotifyMatch || {}), artist };
          }
          if (Object.keys(patch).length) {
            try {
              await api.patch("/api/songs/" + song.id, patch);
              toast("renamed");
            } catch (e) { toast("rename failed: " + e.message); }
          }
          closeModal();
          home(v);
        };
      }
      else if (a === "artwork") {
        closeModal();
        toast("refreshing cover art…");
        try {
          const { upload } = window.Play;
          const artist = (song.spotifyMatch && song.spotifyMatch.artist) || "";
          const match = await upload.findSpotifyMatch(song.name, song.duration || 0, artist || null);
          if (match) {
            await api.patch("/api/songs/" + song.id, { spotifyMatch: match });
            toast("cover art updated");
          } else {
            toast("no cover art found");
          }
        } catch (e) { toast("refresh failed: " + e.message); }
        home(v);
      }
      else if (a === "lyrics") {
        closeModal();
        toast("refreshing lyrics…");
        try {
          await api.post(`/api/songs/${song.id}/lyrics/refresh`, {});
          toast("lyrics refreshed");
        } catch (e) { toast("lyrics refresh failed: " + e.message); }
      }
      else if (a === "delete") {
        closeModal();
        confirmModal("delete song", `delete "${song.name}"? this removes it from drive too.`, "delete", async () => {
          try {
            await api.del("/api/songs/" + song.id);
            toast("deleted");
          } catch (e) { toast("delete failed: " + e.message); }
          home(v);
        });
      }
    };
  });
}

function setupUpload(body, v) {
  const dz = body.querySelector("#dropzone");
  const input = body.querySelector("#fileInput");
  body.querySelector("#pickFile").onclick = () => input.click();
  input.addEventListener("change", (e) => {
    if (e.target.files[0]) showNameDialog(e.target.files[0], [], v, body);
  });
  ["dragover", "dragenter"].forEach((ev) => dz.addEventListener(ev, (e) => {
    e.preventDefault(); dz.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => {
    e.preventDefault(); dz.classList.remove("dragover");
  }));
  dz.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) showNameDialog(f, [], v, body);
  });
}

async function showNameDialog(file, songs, v, body) {
  const { upload, toast, modal, closeModal } = window.Play;
  // get duration first
  toast("analyzing audio…");
  let duration = 0;
  try {
    const meta = await upload.getMetadata(file);
    duration = meta.duration;
  } catch (e) {}

  const bg = modal(`<h3>name this track</h3>
    <input id="sname" value="${esc(file.name.replace(/\.[^.]+$/, ""))}" maxlength="200">
    <div class="row"><button class="btn ghost" data-x>cancel</button><button class="btn" data-ok>upload</button></div>`);
  bg.querySelector("[data-x]").onclick = closeModal;
  bg.querySelector("[data-ok]").onclick = async () => {
    const name = bg.querySelector("#sname").value.trim() || file.name.replace(/\.[^.]+$/, "");
    closeModal();

    // upload with progress
    body.innerHTML = `<div class="empty"><div class="big">↑</div>
      <p id="upstage">uploading to drive…</p>
      <div style="width:200px;height:4px;background:#333;border-radius:2px;margin:12px auto">
        <div id="upbar" style="height:100%;width:0%;background:#fff;border-radius:2px;transition:width .2s"></div>
      </div></div>`;

    try {
      const song = await upload.fullUploadFlow(
        file, name,
        (p) => { const b = body.querySelector("#upbar"); if (b) b.style.width = (p * 100) + "%"; },
        (stage) => { const s = body.querySelector("#upstage"); if (s) s.textContent = stage; }
      );
      toast("added to library");
      home(v, [song]); // refresh, show uploaded song immediately
    } catch (e) {
      toast("upload failed: " + e.message);
      home(v); // refresh (show empty/error state)
    }
  };
}

/* ---------- settings ---------- */
async function settings(v) {
  const u = auth().user;
  v.innerHTML = `<div class="pagehead"><h1>settings</h1></div>
    <div class="sec"><h2>account</h2>
      ${u ? `<div class="setrow"><div><div class="lab">${esc(u.name)}</div><div class="desc">${esc(u.email)}</div></div>
        <button class="btn ghost" id="logout">sign out</button></div>`
      : `<div class="setrow"><div><div class="lab">not signed in</div>
        <div class="desc">sign in to use your personal library.</div></div></div>
        <div id="gsi" style="margin-top:12px"></div>`}
    </div>
    <div class="sec"><h2>playback</h2>
      <div class="setrow"><div><div class="lab">motion</div><div class="desc">animations and lyric transitions</div></div>
        <div class="seg" id="segs-motion"><button data-v="auto">auto</button><button data-v="on">on</button><button data-v="off">off</button></div></div>
    </div>
    <div class="sec"><h2>offline cache</h2>
      <div class="setrow"><div><div class="lab">downloaded tracks</div><div class="desc" id="cachestat">…</div></div>
        <button class="btn ghost" id="clearcache">clear</button></div>
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
}

window.Play.views = { home, settings };
})();
