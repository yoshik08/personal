/* global player singleton. one audio element, survives navigation. */
(function () {
"use strict";
const { utils, api, cache, toast, analytics } = window.Play;

const player = {
  audio: new Audio(),
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  downloading: false,   /* first-play fetch from /api/audio/:trackId */
  downloadInfo: null,   /* {title, startedAt, gotBytes, totalBytes} */
  loading: false,
  error: null,
  shuffle: false,
  repeat: "off",        /* off | all | one */
  volume: 0.8,
  muted: false,
  playStartAt: 0,       /* for history threshold */

  init() {
    const a = this.audio;
    a.preload = "auto";
    a.volume = this.volume;
    a.addEventListener("timeupdate", () => this.emit("time"));
    a.addEventListener("durationchange", () => this.emit("time"));
    a.addEventListener("play", () => { this.isPlaying = true; this.emit("state"); this.mediaSession(); });
    a.addEventListener("pause", () => { this.isPlaying = false; this.emit("state"); this.recordHistory(); });
    a.addEventListener("ended", () => this.onEnded());
    a.addEventListener("waiting", () => this.emit("state"));
    a.addEventListener("playing", () => this.emit("state"));
    a.addEventListener("error", () => {
      this.error = "playback error";
      this.downloading = false; this.loading = false;
      this.emit("state");
      toast("playback unavailable for this track");
    });
    /* restore prefs */
    try {
      const p = JSON.parse(localStorage.getItem("play_prefs") || "{}");
      if (typeof p.volume === "number") { this.volume = p.volume; a.volume = p.volume; }
      if (typeof p.shuffle === "boolean") this.shuffle = p.shuffle;
      if (["off", "all", "one"].includes(p.repeat)) this.repeat = p.repeat;
    } catch (e) {}
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", () => this.play());
      navigator.mediaSession.setActionHandler("pause", () => this.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => this.prev());
      navigator.mediaSession.setActionHandler("nexttrack", () => this.next());
    }
    document.addEventListener("keydown", (e) => this.keys(e));
  },

  keys(e) {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === " ") { e.preventDefault(); this.toggle(); }
    else if (e.key === "ArrowRight" && e.shiftKey) this.next();
    else if (e.key === "ArrowLeft" && e.shiftKey) this.prev();
  },

  on(evt, fn) {
    (this._l = this._l || {})[evt] = (this._l[evt] || []).concat(fn);
  },
  emit(evt, data) {
    ((this._l || {})[evt] || []).forEach((fn) => { try { fn(data); } catch (e) {} });
  },

  /* ---------- queue ---------- */
  setQueue(tracks, startIndex = 0) {
    this.queue = tracks.slice();
    this.queueIndex = startIndex;
  },
  playQueue(tracks, startIndex = 0) {
    let q = tracks.slice();
    if (this.shuffle) {
      const [first, ...rest] = q.slice(startIndex).concat(q.slice(0, startIndex));
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      q = [first, ...rest];
      startIndex = 0;
    }
    this.setQueue(q, startIndex);
    this.playAt(startIndex);
  },
  playAt(i) {
    if (i < 0 || i >= this.queue.length) return;
    this.queueIndex = i;
    this.loadTrack(this.queue[i], true);
  },
  playNext(track) {
    this.queue.splice(this.queueIndex + 1, 0, track);
    toast("up next: " + track.title);
    this.emit("queue");
  },
  addToQueue(track) {
    this.queue.push(track);
    toast("added to queue");
    this.emit("queue");
  },
  removeFromQueue(i) {
    if (i === this.queueIndex) return this.next();
    this.queue.splice(i, 1);
    if (i < this.queueIndex) this.queueIndex--;
    this.emit("queue");
  },
  moveInQueue(from, to) {
    const [t] = this.queue.splice(from, 1);
    this.queue.splice(to, 0, t);
    if (from === this.queueIndex) this.queueIndex = to;
    else if (from < this.queueIndex && to >= this.queueIndex) this.queueIndex--;
    else if (from > this.queueIndex && to <= this.queueIndex) this.queueIndex++;
    this.emit("queue");
  },
  clearQueue() {
    this.queue = this.queueIndex >= 0 ? [this.queue[this.queueIndex]] : [];
    this.queueIndex = 0;
    this.emit("queue");
  },

  /* ---------- transport ---------- */
  async loadTrack(track, autoplay) {
    if (!track) return;
    this.error = null;
    this.recordHistory(); /* close out previous track */
    /* stop current audio immediately — don't let old track play under new ui */
    try { this.audio.pause(); } catch (e) {}
    this.currentTrack = track;
    this.downloading = false; this.loading = true;
    this.emit("track");
    this.emit("state");
    this.playStartAt = Date.now();

    let blob = await cache.get(track.id);
    if (!blob) {
      /* first play: download can take 1-3 min on throttled connections */
      this.downloading = true; this.loading = false;
      this.downloadInfo = { title: track.title, startedAt: Date.now(), gotBytes: 0, totalBytes: 0 };
      this.emit("state");
      this.emit("download");
      try {
        blob = await api.fetchBlob("/api/audio/" + encodeURIComponent(track.id), (got, total) => {
          this.downloadInfo.gotBytes = got;
          this.downloadInfo.totalBytes = total;
          this.emit("download");
        });
        await cache.put(track.id, blob, track); /* failed put is silent — still plays */
      } catch (e) {
        this.downloading = false;
        this.downloadInfo = null;
        this.error = "playback unavailable for this track";
        this.emit("state");
        toast("couldn't fetch audio for “" + track.title + "”");
        return;
      }
      this.downloading = false;
      this.downloadInfo = null;
      this.loading = true;
      this.emit("state");
    }
    if (this._objUrl) URL.revokeObjectURL(this._objUrl);
    this._objUrl = URL.createObjectURL(blob);
    this.audio.src = this._objUrl;
    this.loading = false;
    this.emit("state");
    analytics.track("track_play", { id: track.id, title: track.title, cached: true });
    if (autoplay) {
      try { await this.audio.play(); }
      catch (e) { this.error = "playback blocked"; this.emit("state"); }
    }
  },

  play() {
    if (!this.currentTrack && this.queue.length) return this.playAt(0);
    if (!this.currentTrack) return;
    if (!this.audio.src) return this.loadTrack(this.currentTrack, true);
    this.audio.play().catch(() => {});
  },
  pause() { this.audio.pause(); },
  toggle() { this.isPlaying ? this.pause() : this.play(); },

  next() {
    if (this.repeat === "one") { this.audio.currentTime = 0; this.play(); return; }
    let n = this.queueIndex + 1;
    if (n >= this.queue.length) {
      if (this.repeat === "all" && this.queue.length) n = 0;
      else { this.pause(); return; }
    }
    this.playAt(n);
  },
  prev() {
    if (this.audio.currentTime > 3) { this.audio.currentTime = 0; return; }
    this.playAt(Math.max(0, this.queueIndex - 1));
  },
  onEnded() {
    this.recordHistory(true);
    this.next();
  },
  seek(frac) {
    if (this.audio.duration) this.audio.currentTime = frac * this.audio.duration;
  },
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    this.audio.volume = this.volume;
    this.muted = this.volume === 0;
    this.savePrefs();
    this.emit("state");
  },
  toggleMute() {
    this.muted = !this.muted;
    this.audio.muted = this.muted;
    this.emit("state");
  },
  toggleShuffle() {
    this.shuffle = !this.shuffle;
    this.savePrefs();
    this.emit("state");
    toast("shuffle " + (this.shuffle ? "on" : "off"));
  },
  cycleRepeat() {
    this.repeat = this.repeat === "off" ? "all" : this.repeat === "all" ? "one" : "off";
    this.savePrefs();
    this.emit("state");
    toast("repeat: " + this.repeat);
  },
  savePrefs() {
    try {
      localStorage.setItem("play_prefs", JSON.stringify({
        volume: this.volume, shuffle: this.shuffle, repeat: this.repeat,
      }));
    } catch (e) {}
  },

  /* record play when threshold reached (30s or 50%) — fire and forget */
  recordHistory(force) {
    const t = this.currentTrack;
    if (!t || !window.Play.auth.user) return;
    const playedSec = (Date.now() - this.playStartAt) / 1000;
    const dur = t.duration || this.audio.duration || 0;
    if (!force && playedSec < 30 && !(dur > 0 && playedSec >= dur * 0.5)) return;
    this.playStartAt = Date.now();
    api.post("/api/history", { track: t, playedSec: Math.round(playedSec) }).catch(() => {});
  },

  mediaSession() {
    if (!("mediaSession" in navigator) || !this.currentTrack) return;
    const t = this.currentTrack;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist, album: t.album,
        artwork: t.albumArt ? [{ src: t.albumArt, sizes: "600x600" }] : [],
      });
    } catch (e) {}
  },

  downloadStatus() {
    if (!this.downloading || !this.downloadInfo) return null;
    const d = this.downloadInfo;
    const secs = Math.floor((Date.now() - d.startedAt) / 1000);
    return { title: d.title, secs, gotMB: (d.gotBytes / 1048576).toFixed(1), totalMB: d.totalBytes ? (d.totalBytes / 1048576).toFixed(1) : null };
  },
};

window.Play.player = player;
})();
