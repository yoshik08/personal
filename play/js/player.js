/* player: one <audio>, a queue, shuffle/repeat, media session, resume-where-you-left-off */
import { api, bus, toast, store, clamp } from "./core.js";
import { cache } from "./cache.js";
import { lib } from "./library.js";
import { artOf } from "./art.js";

const audio = new Audio();
audio.preload = "metadata";

const shuffled = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

export const player = {
  audio,
  queue: [],          // songs, in play order
  original: null,     // un-shuffled order while shuffle is on
  index: -1,
  source: "Library",  // "Library" | playlist name — shown in now playing
  shuffle: false,
  repeat: "off",      // off | all | one
  volume: 0.8,
  muted: false,
  state: "idle",      // idle | loading | playing | paused | error
  error: null,
  buffering: false,

  _loadToken: 0,
  _pendingSeek: 0,
  _listened: 0,       // seconds actually heard this load (for play counts + caching)
  _counted: false,
  _lastT: 0,
  _objUrl: null,

  get current() { return this.queue[this.index] || null; },
  get isPlaying() { return this.state === "playing"; },

  init() {
    const prefs = store.get("play_prefs", {});
    if (typeof prefs.volume === "number") this.volume = clamp(prefs.volume, 0, 1);
    if (typeof prefs.shuffle === "boolean") this.shuffle = prefs.shuffle;
    if (["off", "all", "one"].includes(prefs.repeat)) this.repeat = prefs.repeat;
    audio.volume = this.volume;

    audio.addEventListener("playing", () => { this.buffering = false; this.set("playing"); });
    audio.addEventListener("pause", () => { if (this.state !== "error" && this.state !== "loading") this.set("paused"); this.saveSession(); });
    audio.addEventListener("waiting", () => { this.buffering = true; bus.emit("player:state", this); });
    audio.addEventListener("canplay", () => { this.buffering = false; bus.emit("player:state", this); });
    audio.addEventListener("ended", () => this.onEnded());
    audio.addEventListener("error", () => this.onError());
    audio.addEventListener("loadedmetadata", () => {
      if (this._pendingSeek) { audio.currentTime = Math.min(this._pendingSeek, (audio.duration || 1) - 1); this._pendingSeek = 0; }
      bus.emit("player:time", this);
    });
    audio.addEventListener("durationchange", () => bus.emit("player:time", this));
    audio.addEventListener("progress", () => bus.emit("player:time", this));
    audio.addEventListener("timeupdate", () => this.onTime());

    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession;
      const on = (a, fn) => { try { ms.setActionHandler(a, fn); } catch (e) {} };
      on("play", () => this.play());
      on("pause", () => this.pause());
      on("previoustrack", () => this.prev());
      on("nexttrack", () => this.next());
      on("seekto", (d) => this.seekTo(d.seekTime));
      on("seekbackward", (d) => this.seekBy(-(d.seekOffset || 10)));
      on("seekforward", (d) => this.seekBy(d.seekOffset || 10));
    }
    addEventListener("pagehide", () => this.saveSession());
    bus.on("song", (s) => { // metadata edits reach the queue too
      this.queue.forEach((q, i) => { if (q.id === s.id) this.queue[i] = s; });
      if (this.current && this.current.id === s.id) { bus.emit("player:track", this); this.mediaMeta(); }
    });
    bus.on("song:removed", (id) => {
      const wasCurrent = this.current && this.current.id === id;
      if (wasCurrent) this.stop();
      const cur = this.current;
      this.queue = this.queue.filter((s) => s.id !== id);
      if (this.original) this.original = this.original.filter((s) => s.id !== id);
      this.index = cur ? this.queue.indexOf(cur) : -1;
      bus.emit("player:queue", this);
    });
  },

  set(state) {
    this.state = state;
    bus.emit("player:state", this);
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = state === "playing" ? "playing" : state === "paused" ? "paused" : "none";
  },

  /* ---------- queue ---------- */
  playList(songs, startIndex = 0, source = "Library", { shuffleAll = false } = {}) {
    if (!songs.length) return;
    if (shuffleAll) this.shuffle = true;
    const start = songs[clamp(startIndex, 0, songs.length - 1)];
    this.source = source;
    if (this.shuffle) {
      this.original = songs.slice();
      const rest = songs.filter((s) => s !== start);
      this.queue = shuffleAll ? shuffled(songs) : [start, ...shuffled(rest)];
      this.index = 0;
    } else {
      this.original = null;
      this.queue = songs.slice();
      this.index = songs.indexOf(start);
    }
    this.savePrefs();
    bus.emit("player:queue", this);
    this.load(true);
  },
  playAt(i) {
    if (i < 0 || i >= this.queue.length) return;
    this.index = i;
    bus.emit("player:queue", this);
    this.load(true);
  },
  playNext(song) {
    if (!this.current) return this.playList([song], 0);
    this.queue.splice(this.index + 1, 0, song);
    if (this.original) this.original.push(song);
    bus.emit("player:queue", this);
    toast("Playing next: " + song.name);
  },
  addToQueue(song) {
    if (!this.current) return this.playList([song], 0);
    this.queue.push(song);
    if (this.original) this.original.push(song);
    bus.emit("player:queue", this);
    toast("Added to queue");
  },
  removeAt(i) {
    if (i === this.index) return;
    const [s] = this.queue.splice(i, 1);
    if (this.original && s) { const j = this.original.indexOf(s); if (j >= 0) this.original.splice(j, 1); }
    if (i < this.index) this.index--;
    bus.emit("player:queue", this);
    this.saveSession();
  },
  move(from, to) {
    if (from === to) return;
    const cur = this.current;
    const [s] = this.queue.splice(from, 1);
    this.queue.splice(to, 0, s);
    this.index = this.queue.indexOf(cur);
    bus.emit("player:queue", this);
  },
  clearUpNext() {
    this.queue = this.queue.slice(0, this.index + 1);
    if (this.original) this.original = this.queue.slice();
    bus.emit("player:queue", this);
  },

  /* ---------- loading ---------- */
  async load(autoplay, seek = 0) {
    const song = this.current;
    if (!song) return;
    const token = ++this._loadToken;
    this.error = null;
    this._listened = 0; this._counted = false; this._lastT = 0;
    this._pendingSeek = seek;
    this.set("loading");
    bus.emit("player:track", this);
    this.mediaMeta();
    try { audio.pause(); } catch (e) {}

    const blob = await cache.get(song.id);
    if (token !== this._loadToken) return; // user skipped while we looked
    if (this._objUrl) { URL.revokeObjectURL(this._objUrl); this._objUrl = null; }
    if (blob) {
      this._objUrl = URL.createObjectURL(blob);
      audio.src = this._objUrl;
      song._cached = true;
    } else {
      // stream straight away; the browser does range requests so seeking works instantly
      audio.src = api.url(`/api/songs/${encodeURIComponent(song.id)}/audio?token=${encodeURIComponent(api.token || "")}`);
    }
    if (!autoplay) { this.set("paused"); return; }
    try { await audio.play(); }
    catch (e) {
      if (token !== this._loadToken) return;
      if (e.name === "NotAllowedError") this.set("paused"); // autoplay policy: wait for a tap
      else if (e.name !== "AbortError") this.onError();
    }
  },

  async onError() {
    const song = this.current;
    if (!song || !audio.src) return;
    const token = this._loadToken;
    if (audio.src.startsWith("blob:")) { // a bad cached copy: drop it and stream instead
      await cache.remove(song.id);
      song._cached = false;
      return this.load(true, audio.currentTime || 0);
    }
    // ask the server why (the media element only says "error")
    let msg = "This song couldn't be played";
    try {
      const r = await fetch(audio.src, { headers: { Range: "bytes=0-1" } });
      if (!r.ok) { const d = await r.json().catch(() => null); if (d && d.error) msg = d.error; }
      else msg = "Your browser can't play this file format";
    } catch (e) { msg = navigator.onLine ? "Can't reach the server" : "You're offline"; }
    if (token !== this._loadToken) return;
    this.error = msg.charAt(0).toUpperCase() + msg.slice(1);
    this.set("error");
    toast(this.error, { kind: "error", action: { label: "Retry", fn: () => this.load(true) } });
  },

  /* ---------- transport ---------- */
  play() {
    if (!this.current) { if (lib.songs.length) this.playList(lib.songs, 0); return; }
    if (this.state === "error" || !audio.src) return this.load(true, this._pendingSeek || audio.currentTime || 0);
    audio.play().catch(() => {});
  },
  pause() { audio.pause(); },
  toggle() { this.isPlaying || this.state === "loading" ? this.pause() : this.play(); },
  stop() {
    this._loadToken++;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    this.set("idle");
  },
  next(auto = false) {
    if (!this.queue.length) return;
    if (auto && this.repeat === "one") { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    let n = this.index + 1;
    if (n >= this.queue.length) {
      if (this.repeat === "all" || !auto) n = 0;
      else { this.set("paused"); audio.currentTime = 0; return; }
    }
    this.playAt(n);
  },
  prev() {
    if (audio.currentTime > 3 || this.index <= 0) { this.seekTo(0); if (!this.isPlaying) this.play(); return; }
    this.playAt(this.index - 1);
  },
  onEnded() { this.next(true); },
  seekTo(sec) {
    if (!audio.src) { this._pendingSeek = sec; bus.emit("player:time", this); return; }
    const d = audio.duration || (this.current && this.current.duration) || 0;
    audio.currentTime = clamp(sec, 0, Math.max(0, d - 0.05));
    bus.emit("player:time", this);
  },
  seekBy(delta) { this.seekTo((audio.currentTime || 0) + delta); },
  get duration() { return audio.duration && isFinite(audio.duration) ? audio.duration : (this.current && this.current.duration) || 0; },
  get time() { return audio.src ? audio.currentTime || 0 : this._pendingSeek || 0; },
  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    audio.volume = this.volume;
    if (this.muted && v > 0) { this.muted = false; audio.muted = false; }
    this.savePrefs();
    bus.emit("player:volume", this);
  },
  toggleMute() {
    this.muted = !this.muted;
    audio.muted = this.muted;
    bus.emit("player:volume", this);
  },
  toggleShuffle() {
    this.shuffle = !this.shuffle;
    const cur = this.current;
    if (this.shuffle && cur) {
      this.original = this.queue.slice();
      const before = this.queue.slice(0, this.index + 1), after = this.queue.slice(this.index + 1);
      this.queue = before.concat(shuffled(after));
    } else if (!this.shuffle && this.original) {
      this.queue = this.original;
      this.index = Math.max(0, this.queue.indexOf(cur));
      this.original = null;
    }
    this.savePrefs();
    bus.emit("player:queue", this);
    bus.emit("player:state", this);
  },
  cycleRepeat() {
    this.repeat = this.repeat === "off" ? "all" : this.repeat === "all" ? "one" : "off";
    this.savePrefs();
    bus.emit("player:state", this);
  },

  onTime() {
    const t = audio.currentTime || 0;
    const dt = t - this._lastT;
    this._lastT = t;
    if (this.isPlaying && dt > 0 && dt < 1.5) this._listened += dt;
    const song = this.current;
    if (song && !this._counted && (this._listened >= 15 || (this.duration && this._listened >= this.duration * 0.5))) {
      this._counted = true;
      lib.markPlayed(song.id);
      this.fillCache(song);
    }
    if ("mediaSession" in navigator && navigator.mediaSession.setPositionState && this.duration) {
      if (!this._msT || Date.now() - this._msT > 1000) {
        this._msT = Date.now();
        try { navigator.mediaSession.setPositionState({ duration: this.duration, position: Math.min(t, this.duration), playbackRate: 1 }); } catch (e) {}
      }
    }
    if (!this._saveT || Date.now() - this._saveT > 5000) { this._saveT = Date.now(); this.saveSession(); }
    bus.emit("player:time", this);
  },

  /** after a real listen, keep a copy for instant/offline replays (one at a time) */
  async fillCache(song) {
    if (song._cached || this._filling || (navigator.connection && navigator.connection.saveData)) return;
    if (await cache.has(song.id)) { song._cached = true; return; }
    this._filling = true;
    try {
      const b = await api.blob(`/api/songs/${song.id}/audio`, song.mimeType);
      if (await cache.put(song.id, b)) { song._cached = true; bus.emit("cache", song.id); }
    } catch (e) {} finally { this._filling = false; }
  },

  mediaMeta() {
    const s = this.current;
    if (!("mediaSession" in navigator) || !s) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: s.name, artist: s.artist || "", album: s.album || "",
        artwork: [{ src: artOf(s), sizes: "600x600" }],
      });
    } catch (e) {}
  },

  /* ---------- persistence ---------- */
  savePrefs() {
    store.set("play_prefs", { volume: this.volume, shuffle: this.shuffle, repeat: this.repeat });
    clearTimeout(this._prefT);
    this._prefT = setTimeout(() => {
      if (api.token) api.put("/api/preferences", { preferences: { volume: this.volume, shuffle: this.shuffle, repeat: this.repeat } }).catch(() => {});
    }, 1500);
  },
  saveSession() {
    if (!this.current) return store.del("play_session");
    store.set("play_session", {
      ids: this.queue.map((s) => s.id).slice(0, 500),
      index: this.index,
      time: Math.floor(this.time),
      source: this.source,
    });
  },
  /** after the library loads: put the last queue back, paused at the same second */
  restore() {
    if (this.current) return;
    const s = store.get("play_session");
    if (!s || !Array.isArray(s.ids)) return;
    const songs = s.ids.map((id) => lib.byId(id)).filter(Boolean);
    const cur = lib.byId(s.ids[s.index]);
    if (!cur) return;
    this.queue = songs;
    this.index = songs.indexOf(cur);
    this.source = s.source || "Library";
    this._pendingSeek = s.time || 0;
    this.state = "paused";
    bus.emit("player:queue", this);
    bus.emit("player:track", this);
    bus.emit("player:state", this);
    bus.emit("player:time", this);
    this.mediaMeta();
  },
  reset() {
    this.stop();
    this.queue = []; this.index = -1; this.original = null;
    store.del("play_session");
    bus.emit("player:queue", this);
    bus.emit("player:track", this);
  },
};
