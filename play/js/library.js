/* library store: songs + playlists, one source of truth for every view */
import { api, bus, toast } from "./core.js";

export const lib = {
  songs: [],
  status: "idle", // idle | loading | ready | error
  error: null,
  playlists: [],
  plStatus: "idle",

  byId(id) { return this.songs.find((s) => s.id === id) || null; },
  changed() { bus.emit("lib", this); },

  async load() {
    if (this.status === "loading") return;
    this.status = "loading";
    this.error = null;
    this.changed();
    try {
      const d = await api.get("/api/songs");
      this.songs = d.songs || [];
      this.status = "ready";
    } catch (e) {
      this.status = this.songs.length ? "ready" : "error";
      this.error = e.message;
      if (this.songs.length) toast("Couldn't refresh your library: " + e.message, { kind: "error" });
    }
    this.changed();
  },

  reset() {
    this.songs = []; this.playlists = [];
    this.status = "idle"; this.plStatus = "idle"; this.error = null;
    this.changed();
  },

  upsert(song) {
    const i = this.songs.findIndex((s) => s.id === song.id);
    if (i >= 0) this.songs[i] = { ...this.songs[i], ...song };
    else this.songs.unshift(song);
    bus.emit("song", this.byId(song.id));
    this.changed();
  },

  async update(id, fields) {
    const before = this.byId(id);
    if (before) this.upsert({ ...before, ...fields }); // optimistic
    try {
      const s = await api.patch("/api/songs/" + id, fields);
      this.upsert(s);
      return s;
    } catch (e) {
      if (before) this.upsert(before);
      throw e;
    }
  },

  async remove(id) {
    await api.del("/api/songs/" + id);
    this.songs = this.songs.filter((s) => s.id !== id);
    this.playlists.forEach((p) => { p.covers = (p.covers || []).filter((c) => c.id !== id); });
    bus.emit("song:removed", id);
    this.changed();
    this.loadPlaylists();
  },

  markPlayed(id) {
    const s = this.byId(id);
    if (!s) return;
    s.plays = (s.plays || 0) + 1;
    s.lastPlayedAt = new Date().toISOString();
    api.post(`/api/songs/${id}/play`).catch(() => {});
    this.changed();
  },

  /* ---------- playlists ---------- */
  async loadPlaylists() {
    this.plStatus = "loading";
    try {
      const d = await api.get("/api/playlists");
      this.playlists = d.playlists || [];
      this.plStatus = "ready";
    } catch (e) { this.plStatus = "error"; }
    bus.emit("playlists", this.playlists);
  },
  async createPlaylist(name) {
    const p = await api.post("/api/playlists", { name });
    this.playlists.unshift({ ...p, covers: [], songCount: 0 });
    bus.emit("playlists", this.playlists);
    return p;
  },
  async renamePlaylist(id, name) {
    await api.patch("/api/playlists/" + id, { name });
    const p = this.playlists.find((x) => x.id === id);
    if (p) p.name = name;
    bus.emit("playlists", this.playlists);
  },
  async deletePlaylist(id) {
    await api.del("/api/playlists/" + id);
    this.playlists = this.playlists.filter((x) => x.id !== id);
    bus.emit("playlists", this.playlists);
  },
  async addToPlaylist(pid, songId) {
    await api.post(`/api/playlists/${pid}/songs`, { songId });
    this.loadPlaylists();
  },
  async removeFromPlaylist(pid, songId) {
    await api.del(`/api/playlists/${pid}/songs/${songId}`);
    this.loadPlaylists();
  },
};
