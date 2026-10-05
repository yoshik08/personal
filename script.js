/* ============================================================
   yoshik v4 — animation engine (ramx.in skin)
   boot > cursor > typing > magnetic > tilt > accordion >
   reveals > progress > toggles > spotify > discord
   ============================================================ */
(function () {
  "use strict";

  /* ---------- config ---------- */
  var DISCORD_ID = "746561388612157460"; // discord settings > advanced > developer mode > right-click yourself > copy user id
  var DISCORD_USERNAME = "yoshik08";
  var EMAIL = "me@yoshik.xyz";

  var root = document.documentElement;
  var motionOK = function () {
    return root.getAttribute("data-motion") !== "off" &&
           !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  };
  var finePointer = window.matchMedia("(pointer: fine)").matches;

  /* ---------- persisted prefs ---------- */
  try {
    var t = localStorage.getItem("yk-theme");
    if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
    if (localStorage.getItem("yk-motion") === "off") root.setAttribute("data-motion", "off");
    /* respect the os: default motion off when the user asked for reduced motion */
    else if (!localStorage.getItem("yk-motion") &&
             window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      root.setAttribute("data-motion", "off");
  } catch (e) {}

  /* ---------- rAF loop watchdog ----------
     stamps every animation loop each frame. if a loop flatlines
     (dead chain after a tab switch, stray exception), the watchdog
     at the bottom restarts it. restarts are generation-guarded so
     a living loop can never double up. */
  var loopState = {};
  function loopTick(key) {
    var st = loopState[key] || (loopState[key] = { gen: 0, last: 0 });
    st.last = performance.now();
  }
  function loopGen(key) {
    var st = loopState[key] || (loopState[key] = { gen: 0, last: 0 });
    return st.gen;
  }
  function bumpLoop(key) {
    var st = loopState[key] || (loopState[key] = { gen: 0, last: 0 });
    st.gen++;
  }
  var startFxLoop = null; /* assigned by the fx module below */
  window.__loopState = loopState; /* debug: lets automation check loop health */

  /* ---------- 1. boot ---------- */
  var boot = document.getElementById("boot");
  var bootDone = false;
  function finishBoot() {
    if (bootDone) return;
    bootDone = true;
    boot.classList.add("done");
    setTimeout(function () { boot.style.display = "none"; }, 600);
  }
  if (motionOK()) {
    Array.prototype.forEach.call(boot.querySelectorAll(".boot-line"), function (ln) {
      setTimeout(function () { ln.classList.add("show"); }, +ln.getAttribute("data-t"));
    });
    setTimeout(finishBoot, 1150);
    boot.addEventListener("click", finishBoot);
  } else {
    finishBoot();
  }

  /* ---------- 2. cursor (spring physics) ---------- */
  var dot = document.querySelector(".cursor-dot");
  var ring = document.querySelector(".cursor-ring");
  var mx = -100, my = -100, rx = -100, ry = -100, rvx = 0, rvy = 0, pulse = 0;
  function startCursorLoop() {
    bumpLoop("cursor");
    var gen = loopGen("cursor");
    (function loop() {
      if (loopGen("cursor") !== gen) return; /* superseded by a restart */
      loopTick("cursor");
      if (!motionOK()) { requestAnimationFrame(loop); return; }
      /* spring physics: tight but alive, with a whisper of overshoot */
      rvx += (mx - rx) * 0.35;
      rvy += (my - ry) * 0.35;
      rvx *= 0.62; rvy *= 0.62;
      rx += rvx; ry += rvy;
      pulse *= 0.9;
      var s = document.body.classList.contains("link-hover") ? 24 : 15;
      var sc = 1 + pulse * 0.7;
      ring.style.transform = "translate(" + (rx - s) + "px," + (ry - s) + "px) scale(" + sc.toFixed(3) + ")";
      requestAnimationFrame(loop);
    })();
  }
  if (finePointer) {
    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = "translate(" + (mx - 2.5) + "px," + (my - 2.5) + "px)";
    });
    document.addEventListener("mousedown", function () { pulse = 1; });
    startCursorLoop();
    document.querySelectorAll("a, button, [data-hover]").forEach(function (el) {
      el.addEventListener("mouseenter", function () { document.body.classList.add("link-hover"); });
      el.addEventListener("mouseleave", function () { document.body.classList.remove("link-hover"); });
    });
  }

  /* ---------- 3. typing ---------- */
  var roles = [
    "full-stack developer",
    "ml engineer",
    "android developer",
    "backend engineer"
  ];
  var typedEl = document.getElementById("typed");
  var ri = 0, ci = 0, deleting = false;
  function typeTick() {
    if (!motionOK()) { typedEl.textContent = roles[0]; return; }
    var word = roles[ri];
    if (!deleting) {
      ci++;
      typedEl.textContent = word.slice(0, ci);
      if (ci === word.length) { deleting = true; return setTimeout(typeTick, 1700); }
      setTimeout(typeTick, 50 + Math.random() * 55);
    } else {
      ci--;
      typedEl.textContent = word.slice(0, ci);
      if (ci === 0) { deleting = false; ri = (ri + 1) % roles.length; return setTimeout(typeTick, 350); }
      setTimeout(typeTick, 26);
    }
  }
  setTimeout(typeTick, 1300);

  /* ---------- 4. magnetic + springy pops ---------- */
  var magEls = [];
  function startMagLoop() {
    bumpLoop("mag");
    var gen = loopGen("mag");
    /* one spring loop for all: smooth glide + overshooting scale */
    (function magLoop() {
      if (loopGen("mag") !== gen) return; /* superseded by a restart */
      loopTick("mag");
      magEls.forEach(function (st) {
        if (!motionOK()) {
          if (st.el.style.transform) st.el.style.transform = "";
          return;
        }
        st.x += (st.tx - st.x) * 0.2;
        st.y += (st.ty - st.y) * 0.2;
        st.sv += (st.tsc - st.sc) * 0.35;
        st.sv *= 0.6;
        st.sc += st.sv;
        st.el.style.transform =
          "translate(" + st.x.toFixed(2) + "px," + st.y.toFixed(2) + "px)" +
          " scale(" + st.sc.toFixed(3) + ")";
      });
      requestAnimationFrame(magLoop);
    })();
  }
  if (finePointer) {
    document.querySelectorAll(".magnetic").forEach(function (el) {
      var st = { el: el, tx: 0, ty: 0, x: 0, y: 0, sc: 1, tsc: 1, sv: 0 };
      magEls.push(st);
      var R = 80;
      el.addEventListener("mousemove", function (e) {
        if (!motionOK()) return;
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        var dist = Math.hypot(dx, dy);
        if (dist < R) {
          var f = 1 - dist / R;
          st.tx = dx * f * 0.3;
          st.ty = dy * f * 0.3;
        } else { st.tx = 0; st.ty = 0; }
      });
      el.addEventListener("mouseenter", function () { st.tsc = 1.07; });
      el.addEventListener("mousedown", function () { st.tsc = 0.9; });
      el.addEventListener("mouseup", function () { st.tsc = 1.07; });
      el.addEventListener("mouseleave", function () { st.tsc = 1; st.tx = 0; st.ty = 0; });
    });
    startMagLoop();
  }

  /* ---------- 5. tilt + glare ---------- */
  if (finePointer) {
    document.querySelectorAll(".tilt").forEach(function (card) {
      var glare = card.querySelector(".glare");
      card.addEventListener("mousemove", function (e) {
        if (!motionOK()) return;
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        card.style.transition = "transform .08s linear";
        card.style.transform = "perspective(800px) rotateX(" + ((0.5 - py) * 7) + "deg) rotateY(" + ((px - 0.5) * 9) + "deg)";
        if (glare) { glare.style.setProperty("--gx", px * 100 + "%"); glare.style.setProperty("--gy", py * 100 + "%"); }
      });
      card.addEventListener("mouseleave", function () {
        card.style.transition = "transform .6s cubic-bezier(.16, 1, .3, 1)";
        card.style.transform = "perspective(800px) rotateX(0deg) rotateY(0deg)";
      });
    });
  }

  /* ---------- 6. work accordion ---------- */
  document.querySelectorAll(".row").forEach(function (row) {
    var btn = row.querySelector(".row-top");
    var detail = row.querySelector(".row-detail");
    btn.addEventListener("click", function () {
      var isOpen = detail.classList.contains("open");
      document.querySelectorAll(".row-detail.open").forEach(function (d) {
        d.classList.remove("open");
        d.closest(".row").querySelector(".row-top").setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        detail.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  /* ---------- 7. reveals ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });
  document.querySelectorAll("[data-reveal]").forEach(function (el) { io.observe(el); });

  /* ---------- 8. scroll progress ---------- */
  var pfill = document.getElementById("progressFill");
  function updateProgress() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    pfill.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0).toFixed(1) + "%";
  }
  document.addEventListener("scroll", updateProgress, { passive: true });
  updateProgress();

  /* ---------- 9. toggles ---------- */
  var themeBtn = document.getElementById("themeBtn");
  var motionBtn = document.getElementById("motionBtn");
  function paintMotionBtn() { motionBtn.classList.toggle("off", root.getAttribute("data-motion") === "off"); }
  paintMotionBtn();
  themeBtn.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("yk-theme", next); } catch (e) {}
    if (window.ykThemePop) window.ykThemePop();
  });
  motionBtn.addEventListener("click", function () {
    var off = root.getAttribute("data-motion") !== "off";
    root.setAttribute("data-motion", off ? "off" : "on");
    try { localStorage.setItem("yk-motion", off ? "off" : "on"); } catch (e) {}
    paintMotionBtn();
  });

  /* ---------- 10. copy email ---------- */
  document.getElementById("mailCopy").addEventListener("click", function () {
    var b = this;
    var done = function (ok) {
      b.textContent = ok ? "copied ✓" : EMAIL + " ⧉";
      setTimeout(function () { b.textContent = EMAIL + " ⧉"; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(EMAIL).then(function () { done(true); }, function () { done(false); });
    } else { done(false); }
  });

  /* ---------- 10b. playback clock ----------
     Local high-resolution estimate of Spotify playback position.
     The server polls Spotify ~every 5s; each response is an anchor
     { progressMs, timestamp, isPlaying }. Between anchors the browser
     advances a monotonic performance.now() clock. Each new anchor only
     corrects drift: tiny drift is ignored, moderate drift is absorbed
     gradually over ~5s (no visible jump), large drift/seek hard-resets. */
  /* ---------- 10b. spotify remote clock (Lyrics V2) ----------
     Local high-resolution estimate of Spotify playback position.
     Anchor: anchorMs = d.progressMs + (t1 - t0)/2 + (d.serverHoldMs || 0),
     where t0 is recorded before the /api/now-playing fetch and t1 on
     resolve. The server `timestamp` is never used (client/server clock
     skew made it unreliable).
     Slewing: moderate drift is closed by running the virtual clock at
     ±6% until the drift hits 0. |drift| > 1500ms hard-snaps and counts
     as a seek: onSeek fires and 3 rapid 1s polls re-lock the anchor.
     Exposes the engine clock interface { now, playing, onSeek, onRate }. */
  function createRemoteClock() {
    var baseMs = 0;        /* estimated progress at basePerf */
    var basePerf = 0;      /* performance.now() corresponding to baseMs */
    var playing = false;
    var slewMs = 0;        /* signed drift left to absorb at ±6% */
    var SNAP_MS = 1500;    /* above this: hard-snap, counts as seek */
    var IGNORE_MS = 120;   /* below this: drift is noise, ignore */
    var SLEW_RATE = 0.06;
    var seekCbs = [], rateCbs = [];
    var relockTimer = null;

    function fire(list) {
      for (var i = 0; i < list.length; i++) { try { list[i](); } catch (e) {} }
    }
    function sub(list, cb) {
      list.push(cb);
      return function () {
        var i = list.indexOf(cb);
        if (i >= 0) list.splice(i, 1);
      };
    }
    /* 3 rapid 1s polls to re-lock after a seek */
    function relockPolls() {
      var n = 0;
      if (relockTimer) { clearInterval(relockTimer); relockTimer = null; }
      relockTimer = setInterval(function () {
        n++;
        if (n > 3 || document.hidden) {
          clearInterval(relockTimer); relockTimer = null; return;
        }
        pollSpotify();
      }, 1000);
    }
    function now() {
      var pos = baseMs;
      if (playing) {
        var elapsed = performance.now() - basePerf;
        if (slewMs !== 0) {
          var closing = elapsed * SLEW_RATE;
          if (Math.abs(slewMs) <= closing) {
            /* drift closes mid-window: run at the slew rate for the
               closing portion, then 1x for the remainder */
            var closePart = Math.abs(slewMs) / SLEW_RATE;
            var r = slewMs > 0 ? 1 + SLEW_RATE : 1 - SLEW_RATE;
            pos += closePart * r + (elapsed - closePart);
            baseMs = pos; basePerf = performance.now(); slewMs = 0;
          } else {
            pos += elapsed * (slewMs > 0 ? 1 + SLEW_RATE : 1 - SLEW_RATE);
            slewMs -= (slewMs > 0 ? 1 : -1) * closing;
          }
        } else {
          pos += elapsed;
        }
      }
      return pos;
    }
    function isPlaying() { return playing; }
    /* hard anchor: trust this position completely (track change, seek, resume) */
    function setAnchor(p) {
      baseMs = p; basePerf = performance.now(); slewMs = 0;
    }
    function setPlaying(p) {
      p = !!p;
      if (playing && !p) { /* pausing: snapshot so the clock freezes */
        baseMs = now(); slewMs = 0; basePerf = performance.now();
      } else if (!playing && p) {
        basePerf = performance.now();
      }
      if (playing !== p) { playing = p; fire(rateCbs); }
    }
    /* reconcile a fresh server anchor with the local estimate */
    function correctDrift(serverMs) {
      var drift = serverMs - now();
      var ad = Math.abs(drift);
      if (ad < IGNORE_MS) return "ignored";
      if (ad > SNAP_MS) {
        setAnchor(serverMs);
        fire(seekCbs);
        relockPolls();
        return "reset";
      }
      /* continuous slew: rebase on the current smooth estimate, then run
         the virtual clock at ±6% until the drift closes to 0 */
      baseMs = now(); basePerf = performance.now();
      slewMs = drift;
      return "slewing";
    }
    return {
      /* engine clock interface */
      now: now,
      playing: isPlaying,
      onSeek: function (cb) { return sub(seekCbs, cb); },
      onRate: function (cb) { return sub(rateCbs, cb); },
      /* legacy aliases used by the page's own UI */
      getProgressMs: now,
      isPlaying: isPlaying,
      setAnchor: setAnchor,
      setPlaying: setPlaying,
      correctDrift: correctDrift
    };
  }

  /* ---------- 11. spotify ---------- */
  var spTrack = document.getElementById("spTrack"),
      spArtist = document.getElementById("spArtist"),
      spArt = document.getElementById("spArt"),
      spProg = document.getElementById("spProg"),
      spDot = document.getElementById("spDot"),
      spHeroLink = document.getElementById("spHeroLink"),
      spHeroArtists = document.getElementById("spHeroArtists"),
      spLabel = document.getElementById("spLabel"),
      lyricsBtn = document.getElementById("lyricsBtn"),
      spTimer = null;
  var spState = { key: null, title: null, artist: "", artists: [], trackUrl: null, image: null, isrc: null, playing: false, progressMs: null, durationMs: null };
  var playbackClock = createRemoteClock();
  /* RTT anchor: t0 is recorded before the /api/now-playing fetch, t1 on
     resolve. position = progressMs + (t1-t0)/2 + serverHoldMs.
     the server `timestamp` field is intentionally not used. */
  var spRtt = { t0: 0, t1: 0 };
  function spotifyAnchorMs(d) {
    var transit = (spRtt.t1 - spRtt.t0) / 2;
    if (!(transit >= 0)) transit = 0;
    return Math.max(0, (d.progressMs || 0) + transit + (d.serverHoldMs || 0));
  }
  function renderHeroArtists(list) {
    spHeroArtists.textContent = "";
    if (!list || !list.length) return;
    spHeroArtists.appendChild(document.createTextNode(" — "));
    list.slice(0, 2).forEach(function (a, i) {
      if (i > 0) spHeroArtists.appendChild(document.createTextNode(", "));
      var link = document.createElement("a");
      link.textContent = a.name;
      if (a.url) {
        link.href = a.url;
        link.target = "_blank";
        link.rel = "noopener";
      }
      spHeroArtists.appendChild(link);
    });
    if (list.length > 2) spHeroArtists.appendChild(document.createTextNode(", …"));
  }
  function renderSpotify(d) {
    var title = d && d.title ? d.title : null;
    var artist = d && d.artist ? d.artist : "";
    var live = !!(d && d.playing);
    if (!title) {
      spTrack.textContent = "nothing playing rn";
      spArtist.textContent = "quiet mode";
      spHeroLink.textContent = "quiet rn";
      spHeroLink.removeAttribute("href");
      spHeroArtists.textContent = "";
      spLabel.textContent = "last played —";
      spDot.classList.remove("on");
      lyricsBtn.style.display = "none";
      spState = { key: null, title: null, artist: "", artists: [], trackUrl: null, image: null, isrc: null, playing: false, progressMs: null, durationMs: null };
      playbackClock.setPlaying(false);
      if (spTimer) { clearInterval(spTimer); spTimer = null; }
      lyrEngineKey = null;
      if (fullEngine) {
        var lyrEmpty = { level: "plain", lines: [] };
        fullEngine.setLyrics(lyrEmpty);
        cardEngine.setLyrics(lyrEmpty);
        deskEngine.setLyrics(lyrEmpty);
      }
      if (npKaraoke) npKaraoke.style.display = "none";
      return;
    }
    spTrack.textContent = title;
    spArtist.textContent = (live ? "" : "last: ") + artist;
    spHeroLink.textContent = title;
    if (d.url) spHeroLink.setAttribute("href", d.url); else spHeroLink.removeAttribute("href");
    renderHeroArtists(d.artists);
    spLabel.textContent = live ? "now playing —" : "last played —";
    spDot.classList.toggle("on", live);
    if (d.image) { spArt.style.backgroundImage = "url(" + d.image + ")"; spArt.textContent = ""; }
    lyricsBtn.style.display = "";
    if (npKaraoke) npKaraoke.style.display = "";
    spState.title = title;
    spState.artist = artist;
    spState.artists = d.artists || [];
    spState.trackUrl = d.url || null;
    spState.image = d.image || null;
    spState.isrc = d.isrc || null;
    spState.playing = live;
    spState.progressMs = d.progressMs;
    spState.durationMs = d.durationMs;
    /* reconcile the local clock with the fresh RTT anchor (track change
       and resume hard-reset; pause freezes; otherwise drift is slewed
       away at ±6%, hard-snap past 1500ms counts as a seek) */
    (function () {
      var key = d.trackId || (title + " :: " + artist);
      var isNewTrack = spState.key !== null && key !== spState.key;
      var trackChanged = key !== spState.key;
      var wasPlaying = playbackClock.isPlaying();
      spState.key = key;
      if (!live) {
        playbackClock.setPlaying(false);
        playbackClock.setAnchor(d.progressMs || 0);
      } else if (isNewTrack || !wasPlaying) {
        playbackClock.setAnchor(spotifyAnchorMs(d));
        playbackClock.setPlaying(true);
      } else {
        playbackClock.setPlaying(true);
        playbackClock.correctDrift(spotifyAnchorMs(d));
      }
      /* lyrics prefetch: fire the moment a new track is seen, in the
         background — don't wait for the overlay to open */
      if (trackChanged && typeof prefetchLyrics === "function") prefetchLyrics(key, d);
      /* feed the engines if the overlay is open and the track moved on */
      if (typeof feedLyricEngines === "function") feedLyricEngines();
    })();
    if (spTimer) { clearInterval(spTimer); spTimer = null; }
    if (live && d.progressMs != null && d.durationMs) {
      var draw = function () {
        var p = playbackClock.getProgressMs();
        spProg.style.width = Math.min(100, (p / d.durationMs) * 100) + "%";
        if (p >= d.durationMs) {
          if (spTimer) { clearInterval(spTimer); spTimer = null; }
          pollSpotify(); /* track ended — grab the next one right away */
        }
      };
      draw();
      spTimer = setInterval(draw, 1000);
    }
  }
  function pollSpotify() {
    spRtt.t0 = performance.now();
    fetch("/api/now-playing", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { spRtt.t1 = performance.now(); renderSpotify(d); })
      .catch(function () {});
  }
  /* adaptive polling: 3.5s while the lyrics overlay is open, 12s when only
     the now-playing card is visible, paused while the tab is hidden.
     immediate poll on visibilitychange and at predicted track end (the
     track-end check lives in the progress drawer above). */
  var spPollTimer = null;
  function spPollCadence() {
    return (typeof lyricsOverlay !== "undefined" && lyricsOverlay &&
            lyricsOverlay.classList.contains("open")) ? 3500 : 12000;
  }
  function scheduleSpotifyPoll() {
    if (spPollTimer) { clearTimeout(spPollTimer); spPollTimer = null; }
    if (document.hidden) return; /* paused; visibilitychange restarts us */
    spPollTimer = setTimeout(function () {
      spPollTimer = null;
      pollSpotify();
      scheduleSpotifyPoll();
    }, spPollCadence());
  }
  pollSpotify();
  scheduleSpotifyPoll();
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) {
      pollSpotify();         /* refresh the second you're back */
      scheduleSpotifyPoll(); /* restart the adaptive cadence */
      reacquireWakeLock();   /* desk mode: re-grab the screen wake lock */
    }
  });

  /* ---------- 11b. synced lyrics overlay (Lyrics V2 engine) ---------- */
  var lyricsOverlay = document.getElementById("lyricsOverlay"),
      lyricsBg = document.getElementById("lyricsBg"),
      lyricsLines = document.getElementById("lyricsLines"),
      lyricsHint = document.getElementById("lyricsHint"),
      lyricsTitle = document.getElementById("lyricsTitle"),
      lyricsArtist = document.getElementById("lyricsArtist"),
      lyricsArt = document.getElementById("lyricsArt"),
      lyricsProg = document.getElementById("lyricsProg"),
      lyricsDesk = document.getElementById("lyricsDesk"),
      lyricsShare = document.getElementById("lyricsShare"),
      deskStage = document.getElementById("deskStage"),
      npKaraoke = document.getElementById("npKaraoke");
  /* L1 lyric cache: track key -> { kind: "synced"|"plain"|"empty", data }.
     data is the full /api/lyrics v2 payload, handed straight to the engine.
     L2 is the 24h edge cache on /api/lyrics, so each track hits the
     network at most once per day per browser. */
  var lyrStore = new Map();
  var lyrInflight = {}; /* key -> true while a fetch is in flight */
  var lyrEngineKey = null; /* track key the engines currently hold */
  function lyrPut(key, val) {
    lyrStore.set(key, val);
    if (lyrStore.size > 24) lyrStore.delete(lyrStore.keys().next().value);
  }
  function lyrUrl(d) {
    return "/api/lyrics?artist=" + encodeURIComponent(((d && d.artist) || "").split(",")[0]) +
      "&title=" + encodeURIComponent((d && d.title) || "") +
      "&duration=" + Math.round(((d && d.durationMs) || 0) / 1000) +
      "&isrc=" + encodeURIComponent((d && d.isrc) || "");
  }
  function lyrNormalize(data) {
    if (data && data.level === "plain") return { kind: "plain", data: data };
    if (data && data.lines && data.lines.length) return { kind: "synced", data: data };
    return { kind: "empty", data: null };
  }

  /* engine clock adapter: wraps the spotify remote clock */
  var spotifyClock = {
    now: function () { return playbackClock.now(); },
    playing: function () { return playbackClock.isPlaying(); },
    onSeek: function (cb) { return playbackClock.onSeek(cb); },
    onRate: function (cb) { return playbackClock.onRate(cb); }
  };
  var fullEngine = null, cardEngine = null, deskEngine = null;
  if (window.LyricsEngine) {
    var lyrMotion = motionOK();
    fullEngine = window.LyricsEngine.create({ container: lyricsLines, clock: spotifyClock, mode: "full", motion: lyrMotion });
    /* S1: card karaoke — a second engine instance in card mode showing the
       current line under the track title, live word-by-word wipe.
       tap (via the engine's onOpenRequest) opens the fullscreen overlay. */
    cardEngine = window.LyricsEngine.create({ container: npKaraoke, clock: spotifyClock, mode: "card", motion: lyrMotion, onOpenRequest: openLyrics });
    /* S2: desk mode focus layout — card mode at giant size */
    deskEngine = window.LyricsEngine.create({ container: deskStage, clock: spotifyClock, mode: "card", motion: lyrMotion });
    cardEngine.open(); /* card karaoke runs live under the card */
  }

  /* feed all engines with the v2 payload for `key` (idempotent per key) */
  function applyEngineLyrics(key) {
    if (!key || key === lyrEngineKey || !fullEngine) return;
    var entry = lyrStore.get(key);
    if (!entry) return;
    setLyricsHeader();
    var kind = entry.kind, data = entry.data;
    if (kind === "synced" || kind === "plain") {
      lyricsHint.textContent = kind === "plain" ? "unsynced lyrics" : "";
      lyricsHint.style.cursor = "";
      lyricsHint.onclick = null;
      fullEngine.setLyrics(data);
      cardEngine.setLyrics(data);
      deskEngine.setLyrics(data);
    } else {
      var lyrNone = { level: "plain", lines: [] };
      fullEngine.setLyrics(lyrNone);
      cardEngine.setLyrics(lyrNone);
      deskEngine.setLyrics(lyrNone);
      lyricsHint.textContent = "no lyrics found for this one";
    }
    lyrEngineKey = key;
  }
  /* called from renderSpotify on every poll: move the engines to the
     current track as soon as its (possibly prefetched) data is ready */
  function feedLyricEngines() {
    if (!fullEngine || !spState.key || spState.key === lyrEngineKey) return;
    if (lyrStore.has(spState.key)) applyEngineLyrics(spState.key);
  }
  /* called when a NEW track is detected: fetch in the background, don't
     wait for the overlay to open. stores prefetched data keyed by trackId. */
  function prefetchLyrics(key, d) {
    requestLyrics(key, d, true);
  }
  function setHintRetry(key, d, msg) {
    lyricsHint.textContent = msg;
    lyricsHint.style.cursor = "pointer";
    lyricsHint.onclick = function () {
      lyricsHint.style.cursor = "";
      lyricsHint.onclick = null;
      requestLyrics(key, d, false);
    };
  }
  /* silent=true: background prefetch, no overlay UI writes */
  function requestLyrics(key, d, silent) {
    if (!key || lyrStore.has(key) || lyrInflight[key]) return;
    lyrInflight[key] = true;
    if (!silent) {
      lyricsHint.textContent = "finding lyrics…";
      lyricsHint.style.cursor = "";
      lyricsHint.onclick = null;
    }
    fetch(lyrUrl(d))
      .then(function (r) {
        if (r.status === 429) { var e = new Error("rate-limited"); e.rate = true; throw e; }
        if (!r.ok) throw new Error("bad response");
        return r.json();
      })
      .then(function (data) {
        delete lyrInflight[key];
        /* always cache the result, even if the user moved on mid-fetch */
        lyrPut(key, lyrNormalize(data));
        if (spState.key === key) applyEngineLyrics(key);
      })
      .catch(function (err) {
        delete lyrInflight[key];
        if (silent) return;
        setHintRetry(key, d, err && err.rate ? "too many requests — tap to retry"
                                            : "couldn't load lyrics — tap to retry");
      });
  }
  function setLyricsHeader() {
    lyricsTitle.textContent = spState.title || "";
    if (spState.trackUrl) lyricsTitle.setAttribute("href", spState.trackUrl);
    else lyricsTitle.removeAttribute("href");
    lyricsArtist.textContent = "";
    (spState.artists || []).forEach(function (a, i) {
      if (i > 0) lyricsArtist.appendChild(document.createTextNode(", "));
      var link = document.createElement("a");
      link.textContent = a.name;
      if (a.url) { link.href = a.url; link.target = "_blank"; link.rel = "noopener"; }
      lyricsArtist.appendChild(link);
    });
    if (spState.image) {
      lyricsArt.src = spState.image;
      lyricsBg.style.backgroundImage = "url(" + spState.image + ")";
    }
  }
  /* lightweight UI timer while the overlay is open: progress bar only.
     the engine runs its own rAF loop for the lyrics themselves. */
  var lyrUiTimer = null;
  function startLyricUi() {
    stopLyricUi();
    var draw = function () {
      if (!spState.durationMs) return;
      var pos = Math.min(playbackClock.getProgressMs(), spState.durationMs);
      lyricsProg.style.width = (pos / spState.durationMs * 100) + "%";
    };
    draw();
    lyrUiTimer = setInterval(draw, 1000);
  }
  function stopLyricUi() {
    if (lyrUiTimer) { clearInterval(lyrUiTimer); lyrUiTimer = null; }
  }
  function openLyrics() {
    if (!spState.title) return;
    setLyricsHeader();
    lyricsOverlay.classList.add("open");
    lyricsOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    scheduleSpotifyPoll(); /* tighten to the 3.5s cadence while open */
    startLyricUi();
    if (!fullEngine) {
      lyricsHint.textContent = "lyrics engine failed to load";
      return;
    }
    var key = spState.key;
    if (key && key !== lyrEngineKey) {
      if (lyrStore.has(key)) {
        applyEngineLyrics(key);
      } else {
        /* not prefetched yet — fetch in the foreground with UI states */
        requestLyrics(key, {
          title: spState.title, artist: spState.artist,
          durationMs: spState.durationMs, isrc: spState.isrc
        }, false);
      }
    }
    fullEngine.open();
  }
  function closeLyrics() {
    lyricsOverlay.classList.remove("open");
    lyricsOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (deskOn) deskExit();
    if (fullEngine) fullEngine.close();
    stopLyricUi();
    scheduleSpotifyPoll(); /* relax back to the 12s card cadence */
  }
  lyricsBtn.addEventListener("click", openLyrics);
  document.getElementById("lyricsClose").addEventListener("click", closeLyrics);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && lyricsOverlay.classList.contains("open")) closeLyrics();
  });
  /* S1: keyboard access for the card karaoke line */
  if (npKaraoke) npKaraoke.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLyrics(); }
  });

  /* ---------- S2. desk mode ---------- */
  var deskOn = false, wakeLock = null;
  function deskEnter() {
    if (!fullEngine || deskOn) return;
    deskOn = true;
    document.body.classList.add("desk-mode");
    deskStage.setAttribute("aria-hidden", "false");
    lyricsDesk.classList.add("on");
    fullEngine.close();
    deskEngine.open();
    if (document.documentElement.requestFullscreen) {
      try {
        var p = document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }
    reacquireWakeLock();
  }
  function deskExit() {
    if (!deskOn) return;
    deskOn = false;
    document.body.classList.remove("desk-mode");
    deskStage.setAttribute("aria-hidden", "true");
    lyricsDesk.classList.remove("on");
    deskEngine.close();
    if (lyricsOverlay.classList.contains("open") && fullEngine) fullEngine.open();
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        var p = document.exitFullscreen();
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    }
  }
  function reacquireWakeLock() {
    if (!deskOn || wakeLock || !navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; }, function () {});
  }
  if (lyricsDesk) lyricsDesk.addEventListener("click", function () {
    if (deskOn) deskExit(); else deskEnter();
  });

  /* ---------- S4. share poster ---------- */
  var lastShareAt = 0;
  function lineElFromEvent(e) {
    var t = e.target;
    while (t && t !== lyricsLines && t !== deskStage) {
      if (t.classList && t.classList.contains("lyrics-line")) return t;
      t = t.parentNode;
    }
    return null;
  }
  function shareLineText(text) {
    text = (text || "").replace(/\s+/g, " ").trim();
    if (!text) return;
    var t = Date.now();
    if (t - lastShareAt < 2000) return; /* long-press + contextmenu double-fire guard */
    lastShareAt = t;
    renderSharePoster(text, function (blob) {
      if (!blob) return;
      var file = null;
      try { file = new File([blob], "lyric.png", { type: "image/png" }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: spState.title || "lyrics" }).catch(function () {});
      } else {
        /* download fallback */
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = "lyric.png";
        document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 4000);
      }
    });
  }
  function renderSharePoster(text, cb) {
    var W = 1080, H = 1920;
    var canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d");
    var artFailed = false;
    function finish() {
      try {
        canvas.toBlob(function (blob) {
          if (!blob && !artFailed) { artFailed = true; paint(null); return; }
          cb(blob);
        }, "image/png");
      } catch (e) {
        /* tainted canvas (art without CORS) — re-render on a clean bg */
        if (!artFailed) { artFailed = true; paint(null); }
        else cb(null);
      }
    }
    function paint(bgImg) {
      if (bgImg) {
        try { ctx.filter = "blur(90px)"; } catch (e) {}
        var s = Math.max(W / bgImg.width, H / bgImg.height);
        ctx.drawImage(bgImg, (W - bgImg.width * s) / 2, (H - bgImg.height * s) / 2,
                      bgImg.width * s, bgImg.height * s);
        try { ctx.filter = "none"; } catch (e) {}
      } else {
        var g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#17171c"); g.addColorStop(1, "#08080a");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H);
      /* lyric text: white Hanken 800, wrapped */
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      var size = 84;
      ctx.font = '800 ' + size + 'px "Hanken Grotesk", -apple-system, sans-serif';
      var maxW = W - 160, words = text.split(" "), lines = [], cur = "", i;
      for (i = 0; i < words.length; i++) {
        var trial = cur ? cur + " " + words[i] : words[i];
        if (ctx.measureText(trial).width > maxW && cur) { lines.push(cur); cur = words[i]; }
        else cur = trial;
      }
      if (cur) lines.push(cur);
      var lh = size * 1.15, y = H / 2 - (lines.length * lh) / 2 + lh / 2;
      for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], 80, y + i * lh);
      /* track / artist / brand */
      ctx.font = '600 40px "Hanken Grotesk", -apple-system, sans-serif';
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(spState.title || "", 80, H - 240);
      ctx.font = '400 34px "Hanken Grotesk", -apple-system, sans-serif';
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(spState.artist || "", 80, H - 190);
      ctx.font = '500 30px "JetBrains Mono", monospace';
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillText("yoshik.xyz", 80, H - 110);
      finish();
    }
    if (spState.image) {
      var img = new Image();
      img.crossOrigin = "anonymous";
      var done = false;
      img.onload = function () { if (!done) { done = true; paint(img); } };
      img.onerror = function () { if (!done) { done = true; paint(null); } };
      img.src = spState.image;
      setTimeout(function () { if (!done) { done = true; paint(null); } }, 4000);
    } else {
      paint(null);
    }
  }
  function bindShareGestures(root) {
    root.addEventListener("contextmenu", function (e) {
      var line = lineElFromEvent(e);
      if (!line) return;
      e.preventDefault();
      shareLineText(line.textContent);
    });
    var lpTimer = null;
    root.addEventListener("touchstart", function (e) {
      var line = lineElFromEvent(e);
      if (!line) return;
      if (lpTimer) clearTimeout(lpTimer);
      lpTimer = setTimeout(function () { lpTimer = null; shareLineText(line.textContent); }, 600);
    }, { passive: true });
    var lpClear = function () { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
    root.addEventListener("touchend", lpClear);
    root.addEventListener("touchmove", lpClear, { passive: true });
  }
  bindShareGestures(lyricsLines);
  bindShareGestures(deskStage);
  if (lyricsShare) lyricsShare.addEventListener("click", function () {
    var active = (deskOn ? deskStage : lyricsLines).querySelector(".lyrics-line.is-active");
    shareLineText(active ? active.textContent : (spState.title || ""));
  });


  /* ---------- 12. discord ---------- */
  var dcStatus = document.getElementById("dcStatus"),
      dcName = document.getElementById("dcName"),
      dcAva = document.getElementById("dcAva"),
      dcDot = document.getElementById("dcDot");
  var statusWord = { online: "online", idle: "idle", dnd: "do not disturb", offline: "offline" };
  function pollDiscord() {
    if (!DISCORD_ID || DISCORD_ID.indexOf("YOUR_") === 0) return;
    /* first-party proxy — no third-party cookies, edge-cached 25s */
    fetch("/api/discord", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.username) return;
        dcName.textContent = d.username;
        dcStatus.textContent = statusWord[d.status] || d.status || "offline";
        dcDot.classList.toggle("on", d.status === "online" || d.status === "idle" || d.status === "dnd");
        if (d.avatar) {
          dcAva.style.backgroundImage = "url(" + d.avatar + ")";
          dcAva.textContent = "";
        }
      })
      .catch(function () {});
  }
  pollDiscord();
  setInterval(pollDiscord, 30000);
  /* copy the hardcoded 4L username */
  document.getElementById("dcCopyName").addEventListener("click", function () {
    var b = this;
    var done = function (ok) {
      if (ok) b.classList.add("ok");
      setTimeout(function () { b.classList.remove("ok"); }, 1200);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText("x04_").then(function () { done(true); }, function () { done(false); });
    } else { done(false); }
  });
  document.getElementById("dcOpen").addEventListener("click", function (e) {
    if (/android|iphone|ipad|ipod/i.test(navigator.userAgent || "")) {
      e.preventDefault();
      var t = Date.now();
      window.location.href = "discord://discord.com/users/" + DISCORD_ID;
      setTimeout(function () {
        if (Date.now() - t < 1800) {
          window.open("https://discord.com/users/" + DISCORD_ID, "_blank");
        }
      }, 1100);
    }
  });

  /* ---------- 13. pokeballs + osu trail ---------- */
  (function pokefx() {
    var bgC = document.createElement("canvas");
    bgC.id = "pokebg";
    var fgC = document.createElement("canvas");
    fgC.id = "fgtrail";
    document.body.appendChild(bgC);
    document.body.appendChild(fgC);
    var bgx = bgC.getContext("2d");
    var fgx = fgC.getContext("2d");
    var W = 0, H = 0;
    function size() {
      /* mobile gpus: cap dpr lower, fewer pixels to push */
      var dpr = Math.min(window.devicePixelRatio || 1, finePointer ? 2 : 1.5);
      W = window.innerWidth; H = window.innerHeight;
      [bgC, fgC].forEach(function (c) {
        c.width = W * dpr; c.height = H * dpr;
        c.style.width = W + "px"; c.style.height = H + "px";
        c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
      });
    }
    size();
    window.addEventListener("resize", size);

    function accent() {
      return getComputedStyle(root).getPropertyValue("--accent").trim() || "#3b5bfd";
    }

    /* floating pokeballs */
    var pokeImg = new Image();
    var pokeReady = false;
    pokeImg.onload = function () { pokeReady = true; };
    pokeImg.src = "assets/pokeball.png";

    var balls = [];
    /* fewer floating balls on touch devices — cheaper on mobile gpus */
    var BALL_COUNT = finePointer ? 14 : 6;
    for (var i = 0; i < BALL_COUNT; i++) {
      var r = 13 + Math.random() * 22;
      balls.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: r,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        kx: 0, ky: 0,
        alpha: 0.10 + Math.random() * 0.05,
        ph: Math.random() * Math.PI * 2,
        wob: 0.4 + Math.random() * 0.8,
        pop: 0,
        spin: (Math.random() - 0.5) * 0.012,
        rot: Math.random() * Math.PI * 2
      });
    }

    function drawBall(b) {
      var c = bgx;
      var rr = b.r * (1 + b.pop * 0.3);
      c.save();
      c.globalAlpha = root.getAttribute("data-theme") === "light" ? 0.25 : b.alpha;
      c.translate(b.x, b.y);
      c.rotate(b.rot);
      if (pokeReady) {
        c.drawImage(pokeImg, -rr, -rr, rr * 2, rr * 2);
      } else {
        /* vector fallback while the image loads */
        c.beginPath(); c.arc(0, 0, rr, 0, Math.PI); c.fillStyle = "#ececec"; c.fill();
        c.beginPath(); c.arc(0, 0, rr, Math.PI, 0); c.fillStyle = "#e23b3b"; c.fill();
        c.fillStyle = "#202020";
        c.fillRect(-rr, -rr * 0.09, rr * 2, rr * 0.18);
        c.beginPath(); c.arc(0, 0, rr, 0, Math.PI * 2);
        c.lineWidth = Math.max(1.5, rr * 0.07); c.strokeStyle = "#202020"; c.stroke();
        c.beginPath(); c.arc(0, 0, rr * 0.3, 0, Math.PI * 2);
        c.fillStyle = "#f4f4f4"; c.fill(); c.stroke();
        c.beginPath(); c.arc(0, 0, rr * 0.13, 0, Math.PI * 2);
        c.fillStyle = "#202020"; c.fill();
      }
      c.restore();
    }

    /* pikachu easter egg: every 25th blast, one pops out */
    var pikaImg = new Image();
    var pikaReady = false;
    pikaImg.onload = function () { pikaReady = true; };
    pikaImg.src = "assets/pikachu.png";
    var blastCount = 0;
    var pikachus = [];

    /* theme toggle: 100 pokemon burst from the button */
    var pokeIds = [1,4,7,152,155,158,252,255,258,387,390,393,495,498,501,650,653,656,722,725,728,810,813,816,906,909,912,25,35,37,39,52,54,58,77,100,113,133,151,172,173,174,175,183,196,197,209,216,220,231,251,270,280,298,300,309,325,333,351,358,360,403,406,417,420,425,427,439,440,447,492,546,572,587,607,610,613,633,636,677,684,686,700,702,704,719,742,744,775,777,778,789,800,808,831,835,872,915,921,926];
    var pokeImgs = pokeIds.map(function (id) {
      var im = new Image();
      im.src = "assets/pokemon/" + id + ".png";
      return im;
    });
    var popBalls = [];
    window.ykThemePop = function () {
      if (!motionOK()) return;
      var btn = document.getElementById("themeBtn");
      if (!btn) return;
      var r = btn.getBoundingClientRect();
      var x = r.left + r.width / 2, y = r.top + r.height / 2;
      blast(x, y);
      for (var i = 0; i < pokeImgs.length; i++) {
        var a = Math.random() * Math.PI * 2;
        var sp = 1.5 + Math.random() * 4.5;
        popBalls.push({
          img: pokeImgs[i],
          x: x, y: y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2.5,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.25,
          sz: 16 + Math.random() * 18,
          life: 1
        });
      }
    };

    /* blast fx (foreground, above content) */
    var bursts = [];
    var parts = [];
    var flashes = [];
    var ripples = [];
    function blast(x, y) {
      bursts.push({ x: x, y: y, r: 8, life: 1 });
      flashes.push({ x: x, y: y, life: 1 });
      for (var j = 0; j < 14; j++) {
        var a = Math.random() * Math.PI * 2;
        var sp = 1.2 + Math.random() * 3.2;
        parts.push({
          x: x, y: y,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 1, sz: 1.5 + Math.random() * 2.5,
          white: Math.random() < 0.35
        });
      }
    }

    /* click accuracy hud */
    var accTotal = 0, accHits = 0;
    var accEl = document.getElementById("accBadge");
    function paintAcc() {
      var label = accTotal ? (accHits / accTotal * 100).toFixed(1) + "%" : "--";
      accEl.innerHTML = "acc " + label + " <span>" + accHits + "/" + accTotal + "</span>";
    }
    paintAcc();
    accEl.addEventListener("click", function (e) {
      e.stopPropagation();
      accTotal = 0; accHits = 0;
      paintAcc();
    });

    /* osu-style click ripple on every press */
    document.addEventListener("mousedown", function (e) {
      if (!motionOK()) return;
      ripples.push({ x: e.clientX, y: e.clientY, r: 4, life: 1 });
    });

    document.addEventListener("click", function (e) {
      if (!motionOK()) return;
      accTotal++;
      var hit = false;
      balls.forEach(function (b) {
        var dx = e.clientX - b.x, dy = e.clientY - b.y;
        var d = Math.hypot(dx, dy);
        if (d < b.r + 16) {
          hit = true;
          blast(b.x, b.y);
          blastCount++;
          if (blastCount % 25 === 0 && pikaReady) {
            /* easter egg: pikachu pops out and dashes away */
            var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
            var spd = 2.6 + Math.random() * 2.2;
            pikachus.push({
              x: b.x, y: b.y,
              vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
              rot: (Math.random() - 0.5) * 0.5,
              vrot: (Math.random() - 0.5) * 0.09,
              pop: 0, life: 1,
              sz: 52 + Math.random() * 22
            });
          }
          var k = d || 1;
          b.kx += (dx / k) * 2.4;
          b.ky += (dy / k) * 2.4;
          var ks = Math.hypot(b.kx, b.ky);
          if (ks > 3.2) { b.kx *= 3.2 / ks; b.ky *= 3.2 / ks; }
          b.pop = 1;
        }
      });
      if (hit) accHits++;
      paintAcc();
    });

    /* osu-style trail */
    var trail = [];
    if (finePointer) {
      document.addEventListener("mousemove", function (e) {
        trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
        if (trail.length > 42) trail.shift();
      });
    }

    startFxLoop = function () {
      bumpLoop("fx");
      var gen = loopGen("fx");
      (function frame() {
      if (loopGen("fx") !== gen) return; /* superseded by a restart */
      loopTick("fx");
      if (!motionOK()) { requestAnimationFrame(frame); return; }
      /* self-heal: a resize that fired while hidden can leave stale dims */
      if (W !== window.innerWidth || H !== window.innerHeight) size();
      var t = performance.now() / 1000;
      var now = performance.now();
      var col = accent();

      bgx.clearRect(0, 0, W, H);
      balls.forEach(function (b) {
        b.x += b.vx + b.kx + Math.sin(t * b.wob + b.ph) * 0.3;
        b.y += b.vy + b.ky + Math.cos(t * b.wob * 0.85 + b.ph) * 0.3;
        b.rot += b.spin;
        b.pop *= 0.93;
        b.kx *= 0.96; b.ky *= 0.96;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
        if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
        drawBall(b);
      });

      fgx.clearRect(0, 0, W, H);
      if (finePointer && trail.length > 1) {
        trail = trail.filter(function (p) { return now - p.t < 450; });
        fgx.lineCap = "round"; fgx.lineJoin = "round";
        for (var m = 1; m < trail.length; m++) {
          var p0 = trail[m - 1], p1 = trail[m];
          var age = (now - p1.t) / 450;
          fgx.strokeStyle = col;
          fgx.globalAlpha = (1 - age) * 0.5;
          fgx.lineWidth = 0.6 + 3 * (1 - age);
          fgx.beginPath();
          fgx.moveTo(p0.x, p0.y);
          fgx.lineTo(p1.x, p1.y);
          fgx.stroke();
        }
        var head = trail[trail.length - 1];
        fgx.globalAlpha = 0.85;
        fgx.fillStyle = col;
        fgx.beginPath(); fgx.arc(head.x, head.y, 2.2, 0, Math.PI * 2); fgx.fill();
        fgx.globalAlpha = 1;
      }
      for (var qi = ripples.length - 1; qi >= 0; qi--) {
        var rp = ripples[qi];
        rp.r += 4.2; rp.life -= 0.09;
        if (rp.life <= 0) { ripples.splice(qi, 1); continue; }
        fgx.globalAlpha = rp.life * 0.55;
        fgx.strokeStyle = col;
        fgx.lineWidth = 2;
        fgx.beginPath(); fgx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2); fgx.stroke();
        fgx.globalAlpha = 1;
      }
      for (var fi = flashes.length - 1; fi >= 0; fi--) {
        var fl = flashes[fi];
        fl.life -= 0.12;
        if (fl.life <= 0) { flashes.splice(fi, 1); continue; }
        fgx.globalAlpha = fl.life * 0.45;
        fgx.fillStyle = col;
        fgx.beginPath(); fgx.arc(fl.x, fl.y, 12 * (1 - fl.life) + 4, 0, Math.PI * 2); fgx.fill();
        fgx.globalAlpha = 1;
      }
      for (var bi = bursts.length - 1; bi >= 0; bi--) {
        var bu = bursts[bi];
        bu.r += 3.4; bu.life -= 0.055;
        if (bu.life <= 0) { bursts.splice(bi, 1); continue; }
        fgx.globalAlpha = bu.life * 0.8;
        fgx.strokeStyle = col;
        fgx.lineWidth = 2.5;
        fgx.beginPath(); fgx.arc(bu.x, bu.y, bu.r, 0, Math.PI * 2); fgx.stroke();
        fgx.globalAlpha = 1;
      }
      for (var pi = parts.length - 1; pi >= 0; pi--) {
        var pt = parts[pi];
        pt.x += pt.vx; pt.y += pt.vy;
        pt.vx *= 0.96; pt.vy *= 0.96; pt.vy += 0.04;
        pt.life -= 0.032;
        if (pt.life <= 0) { parts.splice(pi, 1); continue; }
        fgx.globalAlpha = pt.life;
        fgx.fillStyle = pt.white ? "#ffffff" : col;
        fgx.beginPath(); fgx.arc(pt.x, pt.y, pt.sz * pt.life + 0.4, 0, Math.PI * 2); fgx.fill();
        fgx.globalAlpha = 1;
      }

      /* pikachus: pop out with overshoot, arc away, fade */
      for (var ki = pikachus.length - 1; ki >= 0; ki--) {
        var pk = pikachus[ki];
        pk.x += pk.vx; pk.y += pk.vy;
        pk.vy += 0.07; pk.vx *= 0.99;
        pk.rot += pk.vrot;
        if (pk.pop < 1) pk.pop = Math.min(1, pk.pop + 0.14);
        pk.life -= 0.011;
        if (pk.life <= 0 || pk.y > H + 90 || pk.x < -90 || pk.x > W + 90) {
          pikachus.splice(ki, 1); continue;
        }
        var pp = pk.pop;
        var eob = 1 + 2.70158 * Math.pow(pp - 1, 3) + 1.70158 * Math.pow(pp - 1, 2);
        var psz = pk.sz * Math.max(0.01, eob);
        fgx.save();
        fgx.globalAlpha = Math.min(1, pk.life * 2.5) * (root.getAttribute("data-theme") === "light" ? 0.25 : 0.95);
        fgx.translate(pk.x, pk.y);
        fgx.rotate(pk.rot);
        fgx.drawImage(pikaImg, -psz / 2, -psz / 2, psz, psz);
        fgx.restore();
      }

      /* theme pop balls: 100 pokeballs burst out, arc down, fade */
      for (var qi = popBalls.length - 1; qi >= 0; qi--) {
        var qb = popBalls[qi];
        qb.x += qb.vx; qb.y += qb.vy;
        qb.vy += 0.14; qb.vx *= 0.99;
        qb.rot += qb.vrot;
        qb.life -= 0.009;
        if (qb.life <= 0) { popBalls.splice(qi, 1); continue; }
        fgx.save();
        fgx.globalAlpha = Math.min(1, qb.life * 2);
        fgx.translate(qb.x, qb.y);
        fgx.rotate(qb.rot);
        if (qb.img.complete && qb.img.naturalWidth) fgx.drawImage(qb.img, -qb.sz / 2, -qb.sz / 2, qb.sz, qb.sz);
        fgx.restore();
      }

      requestAnimationFrame(frame);
      })();
    };
    startFxLoop();
  })();

  /* ---------- loop watchdog: revive any flatlined rAF loop ---------- */
  setInterval(function () {
    if (document.hidden || !motionOK()) return;
    var now = performance.now();
    function dead(key) {
      var st = loopState[key];
      return !!st && now - st.last > 3000;
    }
    if (dead("cursor") && finePointer) startCursorLoop();
    if (dead("mag") && finePointer) startMagLoop();
    if (dead("fx") && startFxLoop) startFxLoop();
  }, 2000);

  /* ---------- forced revival on tab return ----------
     belt and suspenders next to the watchdog: when the tab becomes
     visible again, hand every loop a fresh generation. gen-guarded,
     so healthy loops just hand off seamlessly. */
  function reviveLoops() {
    if (!motionOK()) return;
    if (finePointer) { startCursorLoop(); startMagLoop(); }
    if (startFxLoop) startFxLoop();
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) setTimeout(reviveLoops, 400);
  });
  window.addEventListener("focus", function () { setTimeout(reviveLoops, 400); });
  window.addEventListener("pageshow", function () { setTimeout(reviveLoops, 400); });

})();
