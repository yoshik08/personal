/* upload: drag/drop audio files -> drive -> library */
(function () {
"use strict";
const { api, toast, esc } = window.Play;

const upload = {
  async getDuration(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(a.duration || 0);
      };
      a.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      a.src = url;
      setTimeout(() => { URL.revokeObjectURL(url); resolve(0); }, 10000);
    });
  },

  async getMetadata(file) {
    // basic: duration, name, type, size
    // ID3 parsing would need a library; using filename for now
    const duration = await this.getDuration(file);
    return {
      duration,
      filename: file.name,
      mimeType: file.type || "audio/mpeg",
      size: file.size,
    };
  },

  normalize(s) {
    return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  },

  similarity(a, b) {
    // simple jaccard on words
    const wa = new Set(this.normalize(a).split(" "));
    const wb = new Set(this.normalize(b).split(" "));
    if (!wa.size || !wb.size) return 0;
    const inter = [...wa].filter((w) => wb.has(w)).length;
    return inter / Math.max(wa.size, wb.size);
  },

  async findSpotifyMatch(name, durationSecs, artistHint) {
    try {
      const q = artistHint ? `${name} ${artistHint}` : name;
      const d = await api.get("/api/search?q=" + encodeURIComponent(q));
      const tracks = d.tracks || [];
      if (!tracks.length) return null;

      // If user set an artist, REQUIRE a case-insensitive artist match.
      // Never return art from a different artist (e.g. Summer Walker for cupcakke).
      const hint = (artistHint || "").toLowerCase().trim();
      let candidates = tracks.slice(0, 10);
      if (hint) {
        candidates = candidates.filter((t) => (t.artist || "").toLowerCase().includes(hint));
        if (!candidates.length) return null; // no artist match — don't swap to wrong art
      }

      // score by title similarity + duration proximity (among artist-matched candidates)
      let best = null, bestScore = -1;
      for (const t of candidates) {
        const titleSim = this.similarity(name, t.title);
        if (titleSim < 0.5) continue; // reject bad title matches

        const durDiff = Math.abs((t.duration || 0) - durationSecs);
        const durScore = durDiff < 5 ? 1 : durDiff < 15 ? 0.7 : durDiff < 30 ? 0.4 : 0;

        const score = titleSim * 0.7 + durScore * 0.3;
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }

      // require minimum confidence
      if (!best || bestScore < 0.6) return null;

      return {
        trackId: best.id,
        title: best.title,
        artist: best.artist,
        album: best.album,
        artworkUrl: best.albumArt,
        matchedDuration: best.duration,
      };
    } catch (e) {
      console.log("spotify match failed:", e.message);
      return null;
    }
  },

  async uploadFile(file, onProgress) {
    const meta = await this.getMetadata(file);
    if (!meta.duration) {
      throw new Error("could not read audio duration");
    }

    const fd = new FormData();
    fd.append("audio", file);
    fd.append("duration", String(meta.duration));

    // upload with progress
    const xhr = new XMLHttpRequest();
    const promise = new Promise((resolve, reject) => {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error("upload failed: " + xhr.status));
        }
      };
      xhr.onerror = () => reject(new Error("upload failed"));
    });

    xhr.open("POST", (window.PLAY_API || "") + "/api/songs");
    const token = localStorage.getItem("play_token");
    if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
    xhr.send(fd);

    return promise;
  },

  async fullUploadFlow(file, songName, onProgress, onStage) {
    // stage 1: upload
    if (onStage) onStage("uploading to drive…");
    const song = await this.uploadFile(file, onProgress);

    // stage 2: spotify match
    if (onStage) onStage("finding cover art…");
    const match = await this.findSpotifyMatch(songName, song.duration, null);
    if (match) {
      await api.patch("/api/songs/" + song.id, { name: songName, spotifyMatch: match });
      song.spotifyMatch = match;
      song.name = songName;
    } else {
      await api.patch("/api/songs/" + song.id, { name: songName });
      song.name = songName;
    }

    // stage 3: lyrics (non-blocking, don't fail upload)
    if (onStage) onStage("finding lyrics…");
    try {
      await api.post(`/api/songs/${song.id}/lyrics/refresh`, {});
    } catch (e) {
      console.log("lyrics refresh failed (non-fatal):", e.message);
    }

    return song;
  },
};

window.Play.upload = upload;
})();
