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
  var motionOK = function () { return root.getAttribute("data-motion") !== "off"; };
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
  function createPlaybackClock() {
    var baseMs = 0;      /* estimated progress at basePerf */
    var basePerf = 0;    /* performance.now() corresponding to baseMs */
    var playing = false;
    var corrMs = 0;      /* drift currently being absorbed gradually */
    var corrStart = 0;   /* performance.now() when gradual correction began */
    var CORR_WINDOW = 5000;
    var IGNORE_MS = 120; /* below this: drift is noise, ignore */
    var RESET_MS = 2500; /* above this: treat as seek, hard reset */

    function corrApplied() {
      if (!corrMs) return 0;
      var t = (performance.now() - corrStart) / CORR_WINDOW;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      return corrMs * t;
    }
    /* fold a finished gradual correction into the base values */
    function fold() {
      if (!corrMs) return;
      var now = performance.now();
      if (now - corrStart >= CORR_WINDOW) {
        baseMs = baseMs + (playing ? now - basePerf : 0) + corrMs;
        basePerf = now;
        corrMs = 0;
      }
    }
    function getProgressMs() {
      fold();
      var pos = baseMs;
      if (playing) pos += performance.now() - basePerf;
      pos += corrApplied();
      return pos;
    }
    return {
      getProgressMs: getProgressMs,
      isPlaying: function () { return playing; },
      /* hard anchor: trust this position completely (track change, seek, resume) */
      setAnchor: function (p) {
        baseMs = p; basePerf = performance.now(); corrMs = 0;
      },
      setPlaying: function (p) {
        p = !!p;
        if (playing && !p) { /* pausing: snapshot so the clock freezes */
          baseMs = getProgressMs(); corrMs = 0; basePerf = performance.now();
        } else if (!playing && p) {
          basePerf = performance.now();
        }
        playing = p;
      },
      /* reconcile a fresh server anchor with the local estimate */
      correctDrift: function (serverMs) {
        var drift = serverMs - getProgressMs();
        var ad = Math.abs(drift);
        if (ad < IGNORE_MS) return "ignored";
        if (ad > RESET_MS) { this.setAnchor(serverMs); return "reset"; }
        /* absorb gradually: rebase on the current smooth estimate, then
           run the clock slightly fast/slow until the drift is gone */
        var now = getProgressMs();
        baseMs = now; basePerf = performance.now();
        corrMs = drift * 0.5; corrStart = performance.now();
        return "nudged";
      }
    };
  }

  /* lyric index lookup: advance forward from the hint when playing normally
     (O(1) amortized), binary search when seeking backward */
  function findLyricIndex(lines, pos, hint) {
    var n = lines.length, i;
    if (!n) return -1;
    i = hint < 0 ? 0 : hint >= n ? n - 1 : hint;
    if (pos >= lines[i].time) {
      while (i + 1 < n && lines[i + 1].time <= pos) i++;
      return i;
    }
    var lo = 0, hi = n - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (lines[mid].time <= pos) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans;
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
  var spState = { key: null, title: null, artist: "", artists: [], trackUrl: null, image: null, playing: false, progressMs: null, durationMs: null };
  var playbackClock = createPlaybackClock();
  /* server timestamp -> browser position: account for the time playback
     kept running between Spotify's snapshot and this browser receiving it */
  function spotifyAnchorMs(d) {
    var ts = d.timestamp || Date.now();
    var transit = Date.now() - ts;
    if (transit < 0) transit = 0;
    return Math.max(0, (d.progressMs || 0) + transit);
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

  var itunesArtCache = new Map();
  function upgradeArtwork(title, artist, trackId, fallback, callback) {
    var key = trackId || (title + " :: " + artist);
    if (itunesArtCache.has(key)) return callback(itunesArtCache.get(key));
    var term = encodeURIComponent(title + " " + artist.split(",")[0]);
    fetch("https://itunes.apple.com/search?term=" + term + "&entity=song&limit=1")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var highRes = fallback;
        if (data.results && data.results.length > 0) {
          var res = data.results[0];
          var a1 = res.artistName.toLowerCase();
          var a2 = artist.split(",")[0].toLowerCase().trim();
          if (a1.indexOf(a2) !== -1 || a2.indexOf(a1) !== -1) {
            highRes = res.artworkUrl100.replace("100x100bb", "1500x1500bb");
          }
        }
        itunesArtCache.set(key, highRes);
        callback(highRes);
      })
      .catch(function() {
        itunesArtCache.set(key, fallback);
        callback(fallback);
      });
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
      var ab = document.getElementById("audioBars");
      if (ab) ab.classList.add("paused");
      lyricsBtn.style.display = "none";
      spState = { key: null, title: null, artist: "", artists: [], trackUrl: null, image: null, playing: false, progressMs: null, durationMs: null };
      playbackClock.setPlaying(false);
      if (spTimer) { clearInterval(spTimer); spTimer = null; }
      return;
    }
    spTrack.textContent = title;
    spArtist.textContent = (live ? "" : "last: ") + artist;
    spHeroLink.textContent = title;
    if (d.url) spHeroLink.setAttribute("href", d.url); else spHeroLink.removeAttribute("href");
    renderHeroArtists(d.artists);
    spLabel.textContent = live ? "now playing —" : "last played —";
    spDot.classList.toggle("on", live);
    var audioBars = document.getElementById("audioBars");
    if (audioBars) audioBars.classList.toggle("paused", !live);
    if (d.image) { spArt.style.backgroundImage = "url(" + d.image + ")"; spArt.textContent = ""; }
    lyricsBtn.style.display = "";
    
    var key = d.trackId || (title + " :: " + artist);
    spState.title = title;
    spState.artist = artist;
    spState.artists = d.artists || [];
    spState.trackUrl = d.url || null;
    spState.image = d.image || null;
    spState.playing = live;
    spState.progressMs = d.progressMs;
    spState.durationMs = d.durationMs;

    if (d.image) {
      upgradeArtwork(title, artist, key, d.image, function(bestImg) {
        if (spState.key === key) {
          spState.image = bestImg;
          spArt.style.backgroundImage = "url(" + bestImg + ")";
          if (document.getElementById("lyricsOverlay").classList.contains("open")) {
            setLyricsHeader();
          }
        }
      });
    }
    /* reconcile the local clock with the fresh server anchor (track change
       and resume hard-reset; pause freezes; otherwise drift is absorbed) */
    (function () {
      var key = d.trackId || (title + " :: " + artist);
      var isNewTrack = spState.key !== null && key !== spState.key;
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
    fetch("/api/now-playing", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(renderSpotify)
      .catch(function () {});
  }
  pollSpotify();
  setInterval(function () { if (!document.hidden) pollSpotify(); }, 5000);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) pollSpotify(); /* refresh the second you're back */
  });

  /* ---------- 11b. synced lyrics overlay (verci-style) + karaoke ---------- */
  var lyricsOverlay = document.getElementById("lyricsOverlay"),
      lyricsBg = document.getElementById("lyricsBg"),
      lyricsLines = document.getElementById("lyricsLines"),
      lyricsHint = document.getElementById("lyricsHint"),
      lyricsTitle = document.getElementById("lyricsTitle"),
      lyricsArtist = document.getElementById("lyricsArtist"),
      lyricsArt = document.getElementById("lyricsArt"),
      lyricsProg = document.getElementById("lyricsProg"),
      karaokeToggle = document.getElementById("karaokeToggle"),
      lyricsClassicView = document.getElementById("lyricsClassicView"),
      lyricsKaraokeView = document.getElementById("lyricsKaraokeView"),
      karaokeArt = document.getElementById("karaokeArt"),
      karaokeTitle = document.getElementById("karaokeTitle"),
      karaokeArtist = document.getElementById("karaokeArtist"),
      karaokeProg = document.getElementById("karaokeProg"),
      kwMain = document.getElementById("kwMain"),
      kwNext = document.getElementById("kwNext"),
      kwDots = document.getElementById("kwDots"),
      karaokeStage = document.getElementById("karaokeStage");

  var EMOJI_MAP = { "look": "👀", "cars": "🚘", "girl": "💅", "yeah": "🔥", "love": "❤️", "money": "💸", "time": "⏳", "god": "🙏", "plan": "📝", "bad": "😈", "good": "😇", "night": "🌙" };
  var OFFSET_MS = 0;
  var karaokeMode = false;
  try { karaokeMode = localStorage.getItem("karaokeMode") === "true"; } catch(e) {}
  var lyrStore = new Map();
  var lyrInflight = {};
  var lyrRaf = 0, lyrActiveIdx = -1, lyrUserScrollAt = 0, lyrRenderedKey = null;
  var karaokeWordList = [];
  var kActiveIdx = -1;
  var kIdleTimer = null;

  function resetKIdle() {
    if (kIdleTimer) clearTimeout(kIdleTimer);
    lyricsOverlay.classList.remove("idle");
    if (karaokeMode) {
      kIdleTimer = setTimeout(function() {
        lyricsOverlay.classList.add("idle");
      }, 3000);
    }
  }
  lyricsOverlay.addEventListener("mousemove", resetKIdle);
  lyricsOverlay.addEventListener("click", resetKIdle);

  function lyrPos() { return playbackClock.getProgressMs(); }
  function lyrPut(key, val) {
    lyrStore.set(key, val);
    if (lyrStore.size > 24) lyrStore.delete(lyrStore.keys().next().value);
  }

  function seededRandom(seed) {
    var x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max == min) { h = s = 0; }
    else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  function extractDominantColors(imgSrc) {
    var img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = function() {
      var cvs = document.createElement("canvas");
      var ctx = cvs.getContext("2d", { willReadFrequently: true });
      cvs.width = 16; cvs.height = 16;
      ctx.drawImage(img, 0, 0, 16, 16);
      var data = ctx.getImageData(0, 0, 16, 16).data;
      var r=0, g=0, b=0, count=0;
      for(var i=0; i<data.length; i+=4) {
        if(data[i+3] < 100) continue;
        r += data[i]; g += data[i+1]; b += data[i+2]; count++;
      }
      if(count > 0) {
        r = Math.floor(r/count); g = Math.floor(g/count); b = Math.floor(b/count);
        var hsl = rgbToHsl(r,g,b);
        var c1 = "hsla(" + hsl[0] + ", " + Math.min(hsl[1]*1.2, 100) + "%, " + Math.max(hsl[2]*0.8, 15) + "%, 0.8)";
        var c2 = "hsla(" + ((hsl[0]+30)%360) + ", " + Math.min(hsl[1]*1.2, 100) + "%, " + Math.max(hsl[2]*0.5, 10) + "%, 0.9)";
        lyricsBg.style.setProperty("--lyr-bg-gradient", "linear-gradient(135deg, " + c1 + ", " + c2 + ", #000)");
        var c3 = "hsla(" + hsl[0] + ", " + Math.min(hsl[1]*1.2, 100) + "%, 65%, 0.4)";
        lyricsOverlay.style.setProperty("--k-accent", c3);
      }
    };
    img.src = imgSrc;
  }

  function updateKaraokeToggle(hasWords) {
    if (!hasWords) {
      karaokeToggle.classList.add("disabled");
      if (karaokeMode) toggleKaraokeMode(false);
    } else {
      karaokeToggle.classList.remove("disabled");
      if (karaokeMode) toggleKaraokeMode(true);
    }
  }

  function toggleKaraokeMode(force) {
    if (karaokeToggle.classList.contains("disabled") && force !== false) return;
    karaokeMode = typeof force === "boolean" ? force : !karaokeMode;
    try { localStorage.setItem("karaokeMode", karaokeMode); } catch(e) {}
    karaokeToggle.classList.toggle("active", karaokeMode);
    resetKIdle();
    lyricsClassicView.style.display = karaokeMode ? "none" : "";
    lyricsKaraokeView.style.display = karaokeMode ? "flex" : "none";
    if (karaokeMode && lyricsKaraokeView.style.display !== "none") {
      setLyricsPadding();
    }
  }
  karaokeToggle.addEventListener("click", toggleKaraokeMode);

  function renderSynced(lines, wordLines, durationMs) {
    lyricsHint.textContent = "";
    lyricsLines.innerHTML = "";
    kwMain.textContent = ""; kwNext.textContent = "";
    karaokeWordList = [];
    var frag = document.createDocumentFragment();
    var anyHasWords = false;

    // Classic view uses 'lines'
    lines.forEach(function (ln, i) {
      var words = ln.text.split(/\s+/).filter(Boolean);
      var hasWords = !!(ln.words && ln.words.length === words.length);
      ln.hasWords = hasWords;
      
      var div = document.createElement("div");
      div.className = "lyr-line";

      if (hasWords) {
        words.forEach(function (w, j) {
          var ws = document.createElement("span");
          ws.className = "w";
          for (var k = 0; k < w.length; k++) {
            var ls = document.createElement("span");
            ls.className = "ch";
            ls.textContent = w[k];
            ws.appendChild(ls);
          }
          div.appendChild(ws);
          if (j < words.length - 1) div.appendChild(document.createTextNode(" "));
        });
      } else {
        div.textContent = ln.text;
      }
      frag.appendChild(div);
    });
    lyricsLines.appendChild(frag);

    // Karaoke view uses 'wordLines' (or lines if it has words as fallback)
    var kLines = (wordLines && wordLines.length > 0) ? wordLines : lines;
    kLines.forEach(function (ln, i) {
      var words = ln.text.split(/\s+/).filter(Boolean);
      var hasWords = !!(ln.words && ln.words.length === words.length);
      if (!hasWords) return; // skip lines without word timings
      anyHasWords = true;
      var nextLnTime = kLines[i + 1] ? kLines[i + 1].time : (ln.time + 8000);
      words.forEach(function (w, j) {
        var wStart = ln.words[j];
        var wEnd = (j + 1 < ln.words.length) ? ln.words[j + 1] : nextLnTime;
        if (wEnd <= wStart) wEnd = wStart + 1;
        karaokeWordList.push({ start: wStart, end: wEnd, text: w, lineIdx: i });
      });
    });

    updateKaraokeToggle(anyHasWords);
    setLyricsPadding();
  }

  function renderPlain(plain) {
    lyricsHint.textContent = "unsynced lyrics";
    lyricsLines.innerHTML = "";
    kwMain.textContent = ""; kwNext.textContent = "";
    karaokeWordList = [];
    updateKaraokeToggle(false);
    var frag = document.createDocumentFragment();
    plain.split("\n").forEach(function (t) {
      t = t.trim();
      if (!t) return;
      var div = document.createElement("div");
      div.className = "lyr-line past";
      div.textContent = t;
      frag.appendChild(div);
    });
    lyricsLines.appendChild(frag);
    setLyricsPadding();
  }

  function renderNoLyrics() {
    lyricsLines.innerHTML = "";
    kwMain.textContent = ""; kwNext.textContent = "";
    karaokeWordList = [];
    updateKaraokeToggle(false);
    lyricsHint.textContent = "no lyrics found for this one";
  }

  function renderLyrEntry(key, durationMs) {
    var entry = lyrStore.get(key);
    if (!entry) return;
    lyrActiveIdx = -1; kActiveIdx = -1;
    if (entry.lines) renderSynced(entry.lines, entry.wordLines, durationMs);
    else if (entry.plain) renderPlain(entry.plain);
    else renderNoLyrics();
  }

  var lyrLastQuery = null;
  function fetchLyrics(title, artist, durationMs, force) {
    var key = spState.key;
    if (!key) return;
    if (!force && (lyrStore.has(key) || lyrInflight[key])) return;
    lyrInflight[key] = true;
    lyrLastQuery = { title: title, artist: artist, durationMs: durationMs, retried: false };
    lyrActiveIdx = -1; kActiveIdx = -1; lyrRenderedKey = null;
    lyricsLines.innerHTML = ""; kwMain.textContent = ""; kwNext.textContent = "";
    lyricsHint.textContent = "finding lyrics…";
    lyricsHint.style.cursor = "";
    lyricsHint.onclick = null;
    var base = "/api/lyrics?artist=" + encodeURIComponent((artist || "").split(",")[0]) +
      "&title=" + encodeURIComponent(title) +
      "&duration=" + Math.round((durationMs || 0) / 1000);
      
    Promise.all([
      fetch(base + "&mode=line").then(function(r) { return r.ok ? r.json() : null; }),
      fetch(base + "&mode=word").then(function(r) { return r.ok ? r.json() : null; })
    ]).then(function(results) {
      delete lyrInflight[key];
      var dLine = results[0], dWord = results[1];
      if (dLine && dLine.error && dLine.error === "rate-limited") { var e = new Error("rate-limited"); e.rate = true; throw e; }
      
      var entry = { empty: true };
      if (dLine && dLine.lines && dLine.lines.length) {
        entry.lines = dLine.lines;
      } else if (dLine && dLine.plain) {
        entry.plain = dLine.plain;
      }
      
      if (dWord && dWord.lines && dWord.lines.length && dWord.wordSync) {
        entry.wordLines = dWord.lines;
      }
      
      lyrPut(key, entry);
      if (spState.key === key && lyricsOverlay.classList.contains("open"))
        renderLyrEntry(key, durationMs);
    }).catch(function (err) {
      delete lyrInflight[key];
      var lq = lyrLastQuery;
      if (!err.rate && lq && !lq.retried && lyricsOverlay.classList.contains("open")) {
        lq.retried = true;
        lyricsHint.textContent = "retrying…";
        setTimeout(function () {
          if (lyricsOverlay.classList.contains("open") && spState.key === key && !lyrStore.has(key))
            fetchLyrics(title, artist, durationMs, true);
        }, 2500);
        return;
      }
      lyricsLines.innerHTML = ""; kwMain.textContent = "";
      lyricsHint.textContent = err.rate ? "too many requests — tap to retry" : "couldn't load lyrics — tap to retry";
      lyricsHint.style.cursor = "pointer";
      lyricsHint.onclick = function () {
        lyricsHint.style.cursor = "";
        lyricsHint.onclick = null;
        fetchLyrics(title, artist, durationMs, true);
      };
    });
  }

  function setLyricsHeader() {
    lyricsTitle.textContent = spState.title || "";
    karaokeTitle.textContent = spState.title || "";
    if (spState.trackUrl) {
      lyricsTitle.setAttribute("href", spState.trackUrl);
      karaokeTitle.setAttribute("href", spState.trackUrl);
    } else {
      lyricsTitle.removeAttribute("href");
      karaokeTitle.removeAttribute("href");
    }
    lyricsArtist.textContent = "";
    karaokeArtist.textContent = "";
    (spState.artists || []).forEach(function (a, i) {
      if (i > 0) {
        lyricsArtist.appendChild(document.createTextNode(", "));
        karaokeArtist.appendChild(document.createTextNode(", "));
      }
      var link = document.createElement("a");
      link.textContent = a.name;
      if (a.url) { link.href = a.url; link.target = "_blank"; link.rel = "noopener"; }
      lyricsArtist.appendChild(link);
      karaokeArtist.appendChild(link.cloneNode(true));
    });
    if (spState.image) {
      lyricsArt.src = spState.image;
      karaokeArt.src = spState.image;
      lyricsBg.style.backgroundImage = "url(" + spState.image + ")";
      extractDominantColors(spState.image);
    }
  }

  function lyrProgress() {
    if (!spState.durationMs) return;
    var pos = Math.min(lyrPos(), spState.durationMs);
    var p = (pos / spState.durationMs * 100) + "%";
    lyricsProg.style.width = p;
    karaokeProg.style.width = p;
  }

  function setLyricsPadding() {
    var h = lyricsLines.clientHeight / 2;
    lyricsLines.style.paddingTop = h + "px";
    lyricsLines.style.paddingBottom = h + "px";

    if (karaokeWords && karaokeWords.parentNode) {
      var kh = karaokeWords.parentNode.clientHeight / 2;
      karaokeWords.style.paddingTop = kh + "px";
      karaokeWords.style.paddingBottom = kh + "px";
    }
  }

  function findKaraokeIndex(pos, hint) {
    var n = karaokeWordList.length;
    if (!n) return -1;
    var i = hint < 0 ? 0 : hint >= n ? n - 1 : hint;
    if (pos >= karaokeWordList[i].start) {
      while (i + 1 < n && karaokeWordList[i + 1].start <= pos) i++;
      return i;
    }
    var lo = 0, hi = n - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (karaokeWordList[mid].start <= pos) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans;
  }

  function lyrTick() {
    if (!lyricsOverlay.classList.contains("open")) return;
    lyrProgress();
    var key = spState.key;
    if (!key) return;
    if (!lyrStore.has(key)) {
      if (!lyrInflight[key]) {
        setLyricsHeader();
        fetchLyrics(spState.title, spState.artist, spState.durationMs);
      }
      return;
    }
    if (lyrRenderedKey !== key) {
      setLyricsHeader();
      renderLyrEntry(key, spState.durationMs);
      lyrRenderedKey = key;
      karaokeToggle.classList.toggle("active", karaokeMode);
      lyricsClassicView.style.display = karaokeMode ? "none" : "";
      lyricsKaraokeView.style.display = karaokeMode ? "flex" : "none";
      return;
    }

    var pos = lyrPos() + OFFSET_MS;
    var entry = lyrStore.get(key);

    if (karaokeMode && karaokeWordList.length > 0) {
      var kidx = findKaraokeIndex(pos, kActiveIdx);
      if (kidx !== kActiveIdx) {
        if (kidx >= 0 && karaokeWordList[kidx]) {
          var word = karaokeWordList[kidx];
          
          // Glitch / pulse effect
          lyricsOverlay.classList.remove("pulse", "glitch");
          void lyricsOverlay.offsetWidth; // trigger reflow
          lyricsOverlay.classList.add("pulse", "glitch");
          setTimeout(function() { lyricsOverlay.classList.remove("glitch"); }, 120);
          
          // Set text and handle shrink
          kwMain.textContent = word.text;
          kwMain.style.animation = "none";
          kwMain.style.transform = "";
          void kwMain.offsetWidth; // trigger reflow to restart animation
          kwMain.style.animation = "";
          var mainW = kwMain.offsetWidth;
          var maxW = window.innerWidth * 0.9;
          if (mainW > maxW) {
            kwMain.style.transform = "scale(" + (maxW / mainW) + ")";
          }
          
          // Next word stacking
          var nextWord = karaokeWordList[kidx + 1];
          if (nextWord && nextWord.lineIdx === word.lineIdx && (nextWord.start - word.end) <= 250) {
            kwNext.textContent = nextWord.text;
          } else {
            kwNext.textContent = "";
          }
          
          // Dots for gap > 4s
          if (nextWord && (nextWord.start - word.end) > 4000) {
            setTimeout(function() {
              if (kActiveIdx === kidx && karaokeMode) kwDots.classList.add("show");
            }, 1000); // show dots 1s after word ends
          } else {
            kwDots.classList.remove("show");
          }
        } else {
          kwMain.textContent = "";
          kwNext.textContent = "";
          kwDots.classList.remove("show");
        }
        kActiveIdx = kidx;
      }
    } else if (!karaokeMode && entry.lines) {
      var lines = entry.lines;
      var idx = findLyricIndex(lines, pos, lyrActiveIdx);
      if (idx !== lyrActiveIdx) {
        var kids = lyricsLines.children;
        var scrollTarget = null;
        if (idx >= 0 && kids[idx] && Date.now() - lyrUserScrollAt > 3000) {
          var _el = kids[idx];
          scrollTarget = _el.offsetTop + _el.offsetHeight / 2 - lyricsLines.clientHeight / 2;
        }
        if (lyrActiveIdx >= 0 && kids[lyrActiveIdx]) kids[lyrActiveIdx].className = "lyr-line past";
        if (idx >= 0 && kids[idx]) {
          kids[idx].className = "lyr-line active";
          if (scrollTarget !== null)
            lyricsLines.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" });
        }
        lyrActiveIdx = idx;
      }
      if (idx >= 0 && lyricsLines.children[idx]) {
        var line = lines[idx];
        if (line.hasWords) {
          var wordEls = lyricsLines.children[idx].querySelectorAll(".w");
          var wt = line.words || [];
          var _nl = lines[idx + 1];
          var _lineEnd = _nl ? _nl.time : (line.time + 8000);
          for (var j = 0; j < wordEls.length; j++) {
            var wStart = wt[j] || 0;
            var wEnd = j + 1 < wt.length ? wt[j + 1] : _lineEnd;
            if (!(wEnd > wStart)) wEnd = wStart + 1;
            var chEls = wordEls[j].querySelectorAll(".ch");
            var _n = chEls.length;
            for (var k = 0; k < _n; k++) {
              var _on = pos >= wStart + (wEnd - wStart) * (k / _n);
              var _el = chEls[k];
              if (_el.classList.contains("lit") !== _on) _el.classList.toggle("lit", _on);
            }
          }
        }
      }
    }
  }

  function lyrLoop() {
    lyrRaf = 0;
    if (!lyricsOverlay.classList.contains("open")) return;
    lyrTick();
    lyrRaf = requestAnimationFrame(lyrLoop);
  }
  function openLyrics() {
    if (!spState.title) return;
    setLyricsHeader();
    lyricsOverlay.classList.add("open");
    lyricsOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    lyrRenderedKey = null;
    if (!lyrRaf) lyrRaf = requestAnimationFrame(lyrLoop);
  }
  function closeLyrics() {
    lyricsOverlay.classList.remove("open");
    lyricsOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lyrRaf) { cancelAnimationFrame(lyrRaf); lyrRaf = 0; }
  }
  lyricsBtn.addEventListener("click", openLyrics);
  document.getElementById("lyricsClose").addEventListener("click", closeLyrics);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && lyricsOverlay.classList.contains("open")) closeLyrics();
    if ((e.key === "k" || e.key === "K") && lyricsOverlay.classList.contains("open")) toggleKaraokeMode();
  });
  lyricsLines.addEventListener("wheel", function () { lyrUserScrollAt = Date.now(); }, { passive: true });
  lyricsLines.addEventListener("touchmove", function () { lyrUserScrollAt = Date.now(); }, { passive: true });
  window.addEventListener("resize", function () {
    if (lyricsOverlay.classList.contains("open") && spState.key && lyrStore.get(spState.key) && lyrStore.get(spState.key).lines) {
      setLyricsPadding();
    }
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

    /* ambient constellation particles (interactive depth) */
    var ambientNodes = [];
    var NODE_COUNT = finePointer ? 36 : 16;
    for (var ni = 0; ni < NODE_COUNT; ni++) {
      ambientNodes.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: 1.2 + Math.random() * 1.6
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

      /* render ambient constellation mesh */
      var isDark = root.getAttribute("data-theme") === "dark";
      bgx.fillStyle = isDark ? "rgba(255, 255, 255, 0.22)" : "rgba(0, 0, 0, 0.14)";
      ambientNodes.forEach(function (n) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0) n.x = W; else if (n.x > W) n.x = 0;
        if (n.y < 0) n.y = H; else if (n.y > H) n.y = 0;
        bgx.beginPath();
        bgx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        bgx.fill();
      });

      /* render subtle connector filaments between nearby ambient nodes */
      bgx.lineWidth = 0.5;
      for (var a = 0; a < ambientNodes.length; a++) {
        for (var b = a + 1; b < ambientNodes.length; b++) {
          var dx = ambientNodes[a].x - ambientNodes[b].x;
          var dy = ambientNodes[a].y - ambientNodes[b].y;
          var dist = Math.hypot(dx, dy);
          if (dist < 90) {
            var alpha = (1 - dist / 90) * (isDark ? 0.08 : 0.04);
            bgx.strokeStyle = isDark ? "rgba(255, 255, 255, " + alpha + ")" : "rgba(0, 0, 0, " + alpha + ")";
            bgx.beginPath();
            bgx.moveTo(ambientNodes[a].x, ambientNodes[a].y);
            bgx.lineTo(ambientNodes[b].x, ambientNodes[b].y);
            bgx.stroke();
          }
        }
      }

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
  /* ---------- 14. card spotlight coordinates ---------- */
  if (finePointer) {
    document.querySelectorAll(".card, .hero-id").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });
  }

  /* ---------- 15. floating project preview on hover ---------- */
  (function initProjectPreviews() {
    var preview = document.getElementById("projPreview");
    var ppTitle = document.getElementById("ppTitle");
    var ppDesc = document.getElementById("ppDesc");
    var ppTag = document.getElementById("ppTag");
    var ppChips = document.getElementById("ppChips");
    if (!preview || !ppTitle || !finePointer) return;

    var targetX = 0, targetY = 0, curX = 0, curY = 0;
    var previewActive = false;

    var meta = {
      "sportsphere": { tag: "web platform", desc: "sports venue & program booking platform with razorpay & mongodb sync", chips: ["node.js", "express", "mongodb", "razorpay"] },
      "val": { tag: "riot api web app", desc: "live valorant shop rotation, night market and match tracker", chips: ["next.js", "typescript", "riot api", "express"] },
      "attenly": { tag: "automation tool", desc: "college erp attendance auto-fetcher with safe-bunk calculator", chips: ["next.js", "mongodb", "next-auth", "tailwind"] },
      "spotlight launcher": { tag: "android apk", desc: "super-fast android launcher opening straight into instant search", chips: ["kotlin", "android sdk", "native"] },
      "play": { tag: "music web app", desc: "audio player with real search, synced lyrics and saved playlists", chips: ["node.js", "express", "mongodb", "vanilla js"] },
      "engagement predictor": { tag: "in-browser ml", desc: "browser-trained random forest predicting social post metrics", chips: ["machine learning", "javascript", "chart.js"] }
    };

    function animPreview() {
      if (!previewActive && Math.abs(targetX - curX) < 0.5 && Math.abs(targetY - curY) < 0.5) return;
      curX += (targetX - curX) * 0.16;
      curY += (targetY - curY) * 0.16;
      preview.style.transform = "translate3d(" + (curX + 22) + "px, " + (curY + 14) + "px, 0)";
      if (previewActive) requestAnimationFrame(animPreview);
    }

    document.querySelectorAll(".row").forEach(function (row) {
      var nameEl = row.querySelector(".row-name");
      if (!nameEl) return;
      var rawName = nameEl.childNodes[0].textContent.trim().toLowerCase();

      row.addEventListener("mouseenter", function (e) {
        if (!motionOK()) return;
        var info = meta[rawName] || { tag: "project", desc: "built and shipped by yoshik", chips: ["code", "live"] };
        ppTitle.textContent = rawName;
        ppDesc.textContent = info.desc;
        ppTag.textContent = info.tag;
        ppChips.innerHTML = "";
        info.chips.forEach(function (c) {
          var sp = document.createElement("span");
          sp.textContent = c;
          ppChips.appendChild(sp);
        });
        targetX = e.clientX; targetY = e.clientY;
        curX = e.clientX; curY = e.clientY;
        preview.style.transform = "translate3d(" + (curX + 22) + "px, " + (curY + 14) + "px, 0)";
        preview.classList.add("active");
        previewActive = true;
        requestAnimationFrame(animPreview);
      });

      row.addEventListener("mousemove", function (e) {
        targetX = e.clientX; targetY = e.clientY;
      });

      row.addEventListener("mouseleave", function () {
        preview.classList.remove("active");
        previewActive = false;
      });
    });
  })();

  /* ---------- 16. command palette (cmd+k / ctrl+k) ---------- */
  (function initCmdk() {
    var backdrop = document.getElementById("cmdkBackdrop");
    var input = document.getElementById("cmdkInput");
    var list = document.getElementById("cmdkList");
    var trigger = document.getElementById("cmdBtn");
    if (!backdrop || !input || !list) return;

    var selectedIndex = 0;
    var filteredItems = [];

    var commands = [
      { id: "proj-sportsphere", title: "sportsphere", cat: "projects", hint: "open project", action: function () { window.open("https://yoshik.xyz/sportsphere", "_blank"); } },
      { id: "proj-val", title: "val (valorant tracker)", cat: "projects", hint: "open project", action: function () { window.open("https://yoshik.xyz/val", "_blank"); } },
      { id: "proj-attenly", title: "attenly (erp auto-sync)", cat: "projects", hint: "open project", action: function () { window.open("https://yoshik.xyz/attenly", "_blank"); } },
      { id: "proj-play", title: "play (music player)", cat: "projects", hint: "open project", action: function () { window.open("https://yoshik.xyz/play", "_blank"); } },
      { id: "proj-spotlight", title: "spotlight launcher apk", cat: "projects", hint: "download", action: function () { window.location.href = "https://raw.githubusercontent.com/yoshik08/personal/main/assets/spotlight-debug.apk"; } },
      { id: "nav-about", title: "about yoshik", cat: "navigation", hint: "jump", action: function () { location.hash = "#about"; } },
      { id: "nav-stack", title: "tech stack & skills", cat: "navigation", hint: "jump", action: function () { location.hash = "#stack"; } },
      { id: "nav-live", title: "right now (spotify & discord)", cat: "navigation", hint: "jump", action: function () { location.hash = "#live"; } },
      { id: "nav-contact", title: "contact & email", cat: "navigation", hint: "jump", action: function () { location.hash = "#contact"; } },
      { id: "act-theme", title: "toggle light / dark theme", cat: "actions", hint: "switch", action: function () { document.getElementById("themeBtn").click(); } },
      { id: "act-motion", title: "toggle reduced motion", cat: "actions", hint: "switch", action: function () { document.getElementById("motionBtn").click(); } },
      { id: "act-copy-email", title: "copy email (me@yoshik.xyz)", cat: "actions", hint: "copy", action: function () { document.getElementById("mailCopy").click(); } },
      { id: "soc-github", title: "github profile", cat: "social", hint: "↗", action: function () { window.open("https://github.com/yoshik08", "_blank"); } },
      { id: "soc-x", title: "x / twitter profile", cat: "social", hint: "↗", action: function () { window.open("https://x.com/yoshik767", "_blank"); } }
    ];

    function openCmdk() {
      backdrop.classList.add("open");
      backdrop.setAttribute("aria-hidden", "false");
      input.value = "";
      selectedIndex = 0;
      renderCmdk("");
      setTimeout(function () { input.focus(); }, 40);
    }

    function closeCmdk() {
      backdrop.classList.remove("open");
      backdrop.setAttribute("aria-hidden", "true");
      input.blur();
    }

    function renderCmdk(query) {
      list.innerHTML = "";
      var q = query.trim().toLowerCase();
      filteredItems = commands.filter(function (cmd) {
        return !q || cmd.title.toLowerCase().indexOf(q) !== -1 || cmd.cat.toLowerCase().indexOf(q) !== -1;
      });

      if (!filteredItems.length) {
        var empty = document.createElement("div");
        empty.className = "cmdk-group-title";
        empty.textContent = "no matching results";
        list.appendChild(empty);
        return;
      }

      if (selectedIndex >= filteredItems.length) selectedIndex = 0;

      var currentCat = null;
      filteredItems.forEach(function (cmd, idx) {
        if (cmd.cat !== currentCat) {
          currentCat = cmd.cat;
          var grp = document.createElement("div");
          grp.className = "cmdk-group-title";
          grp.textContent = currentCat;
          list.appendChild(grp);
        }

        var item = document.createElement("div");
        item.className = "cmdk-item" + (idx === selectedIndex ? " selected" : "");
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");

        var left = document.createElement("div");
        left.className = "cmdk-item-left";
        var ico = document.createElement("span");
        ico.className = "cmdk-item-icon";
        ico.textContent = cmd.cat === "projects" ? "⚡" : cmd.cat === "actions" ? "⚙" : cmd.cat === "social" ? "↗" : "→";
        var title = document.createElement("span");
        title.textContent = cmd.title;
        left.appendChild(ico);
        left.appendChild(title);

        var badge = document.createElement("span");
        badge.className = "cmdk-item-badge";
        badge.textContent = cmd.hint;

        item.appendChild(left);
        item.appendChild(badge);

        item.addEventListener("mouseenter", function () {
          selectedIndex = idx;
          updateSelection();
        });

        item.addEventListener("click", function () {
          closeCmdk();
          cmd.action();
        });

        list.appendChild(item);
      });
    }

    function updateSelection() {
      var domItems = list.querySelectorAll(".cmdk-item");
      domItems.forEach(function (el, i) {
        var isSel = i === selectedIndex;
        el.classList.toggle("selected", isSel);
        el.setAttribute("aria-selected", isSel ? "true" : "false");
        if (isSel) el.scrollIntoView({ block: "nearest" });
      });
    }

    if (trigger) trigger.addEventListener("click", openCmdk);

    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        if (backdrop.classList.contains("open")) closeCmdk();
        else openCmdk();
      } else if (e.key === "Escape" && backdrop.classList.contains("open")) {
        e.preventDefault();
        closeCmdk();
      }
    });

    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop) closeCmdk();
    });

    input.addEventListener("input", function () {
      selectedIndex = 0;
      renderCmdk(input.value);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (filteredItems.length) {
          selectedIndex = (selectedIndex + 1) % filteredItems.length;
          updateSelection();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (filteredItems.length) {
          selectedIndex = (selectedIndex - 1 + filteredItems.length) % filteredItems.length;
          updateSelection();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          var action = filteredItems[selectedIndex].action;
          closeCmdk();
          action();
        }
      }
    });
  })();

})();
