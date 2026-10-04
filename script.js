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
  var spState = { key: null, title: null, artist: "", artists: [], trackUrl: null, image: null, playing: false, progressMs: null, durationMs: null, lastUpdate: 0 };
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
      spState = { key: null, title: null, artist: "", artists: [], trackUrl: null, image: null, playing: false, progressMs: null, durationMs: null, lastUpdate: 0 };
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
    if (d.image) { spArt.style.backgroundImage = "url(" + d.image + ")"; spArt.textContent = ""; }
    lyricsBtn.style.display = "";
    spState.key = title + " :: " + artist;
    spState.title = title;
    spState.artist = artist;
    spState.artists = d.artists || [];
    spState.trackUrl = d.url || null;
    spState.image = d.image || null;
    spState.playing = live;
    spState.progressMs = d.progressMs;
    spState.durationMs = d.durationMs;
    spState.lastUpdate = Date.now();
    if (spTimer) { clearInterval(spTimer); spTimer = null; }
    if (live && d.progressMs != null && d.durationMs) {
      var p = d.progressMs;
      var draw = function () {
        p += 1000;
        spState.progressMs = p;
        spState.lastUpdate = Date.now();
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
  setInterval(pollSpotify, 5000);

  /* ---------- 11b. synced lyrics overlay (verci-style) ---------- */
  var lyricsOverlay = document.getElementById("lyricsOverlay"),
      lyricsBg = document.getElementById("lyricsBg"),
      lyricsLines = document.getElementById("lyricsLines"),
      lyricsHint = document.getElementById("lyricsHint"),
      lyricsTitle = document.getElementById("lyricsTitle"),
      lyricsArtist = document.getElementById("lyricsArtist"),
      lyricsArt = document.getElementById("lyricsArt");
  var lyrCache = { id: null, lines: null, loading: false };
  var lyrTimer = null, lyrActiveIdx = -1, lyrUserScrollAt = 0;
  function lyrPos() {
    var p = spState.progressMs || 0;
    if (spState.playing) p += Date.now() - spState.lastUpdate;
    return p;
  }
  function parseLRC(lrc) {
    var lines = [];
    lrc.split("\n").forEach(function (raw) {
      var times = [], m, re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
      while ((m = re.exec(raw))) {
        var frac = m[3] || "0";
        var mult = frac.length === 3 ? 1 : frac.length === 2 ? 10 : 100;
        times.push((+m[1]) * 60000 + (+m[2]) * 1000 + (+frac) * mult);
      }
      var text = raw.replace(/\[.*?\]/g, "").replace(/<[^>]*>/g, "").trim();
      if (!text || !times.length) return;
      times.forEach(function (t) { lines.push({ time: t, text: text }); });
    });
    lines.sort(function (a, b) { return a.time - b.time; });
    return lines.filter(function (l, i) { return i === 0 || l.time !== lines[i - 1].time; });
  }
  function showSynced(lines, durationMs) {
    lyrCache.lines = lines;
    lyricsHint.textContent = "";
    lyricsLines.innerHTML = "";
    var frag = document.createDocumentFragment();
    lines.forEach(function (ln) {
      var div = document.createElement("div");
      div.className = "lyr-line";
      div.textContent = ln.text;
      frag.appendChild(div);
    });
    lyricsLines.appendChild(frag);
    lyrActiveIdx = -1;
    lyrTick();
  }
  function showPlain(plain) {
    lyrCache.lines = null;
    lyricsHint.textContent = "unsynced lyrics";
    lyricsLines.innerHTML = "";
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
  }
  function noLyrics() {
    lyrCache.lines = null;
    lyricsLines.innerHTML = "";
    lyricsHint.textContent = "no lyrics found for this one";
  }
  function fetchLyrics(title, artist, durationMs) {
    var key = title + " :: " + artist;
    if (lyrCache.id === key || lyrCache.loading) return;
    lyrCache = { id: key, lines: null, loading: true };
    lyrActiveIdx = -1;
    lyricsLines.innerHTML = "";
    lyricsHint.textContent = "finding lyrics…";
    var q = encodeURIComponent(title + " " + (artist || "").split(",")[0]);
    fetch("https://lrclib.net/api/search?q=" + q)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (res) {
        lyrCache.loading = false;
        if (!res || !res.length) { noLyrics(); return; }
        var dur = (durationMs || 0) / 1000, best = null, bestScore = Infinity;
        res.forEach(function (r) {
          var score = Math.abs((r.duration || 0) - dur) + (r.syncedLyrics ? 0 : 1e9);
          if (score < bestScore) { bestScore = score; best = r; }
        });
        if (best && best.syncedLyrics) {
          var lines = parseLRC(best.syncedLyrics);
          if (lines.length) { showSynced(lines, durationMs); return; }
        }
        if (best && best.plainLyrics) { showPlain(best.plainLyrics); return; }
        noLyrics();
      })
      .catch(function () { lyrCache.loading = false; noLyrics(); });
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
  function lyrTick() {
    if (!lyricsOverlay.classList.contains("open")) return;
    /* track changed while open — swap lyrics */
    if (spState.key && spState.key !== lyrCache.id && !lyrCache.loading) {
      setLyricsHeader();
      fetchLyrics(spState.title, spState.artist, spState.durationMs);
      return;
    }
    var lines = lyrCache.lines;
    if (!lines || !lines.length) return;
    var pos = lyrPos(), idx = -1, i;
    for (i = 0; i < lines.length; i++) if (lines[i].time <= pos) idx = i;
    if (idx !== lyrActiveIdx) {
      var kids = lyricsLines.children;
      if (lyrActiveIdx >= 0 && kids[lyrActiveIdx]) kids[lyrActiveIdx].className = "lyr-line past";
      if (idx >= 0 && kids[idx]) {
        kids[idx].className = "lyr-line active";
        if (Date.now() - lyrUserScrollAt > 3000) {
          /* pin the active line to the exact vertical middle */
          var cRect = lyricsLines.getBoundingClientRect();
          var lRect = kids[idx].getBoundingClientRect();
          var target = lyricsLines.scrollTop + (lRect.top + lRect.height / 2) - (cRect.top + cRect.height / 2);
          lyricsLines.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
        }
      }
      lyrActiveIdx = idx;
    }
  }
  function openLyrics() {
    if (!spState.title) return;
    setLyricsHeader();
    lyricsOverlay.classList.add("open");
    lyricsOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (lyrCache.id !== spState.key) fetchLyrics(spState.title, spState.artist, spState.durationMs);
    else { lyrActiveIdx = -1; lyrTick(); }
    if (lyrTimer) clearInterval(lyrTimer);
    lyrTimer = setInterval(lyrTick, 200);
  }
  function closeLyrics() {
    lyricsOverlay.classList.remove("open");
    lyricsOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lyrTimer) { clearInterval(lyrTimer); lyrTimer = null; }
  }
  lyricsBtn.addEventListener("click", openLyrics);
  document.getElementById("lyricsClose").addEventListener("click", closeLyrics);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && lyricsOverlay.classList.contains("open")) closeLyrics();
  });
  lyricsLines.addEventListener("wheel", function () { lyrUserScrollAt = Date.now(); }, { passive: true });
  lyricsLines.addEventListener("touchmove", function () { lyrUserScrollAt = Date.now(); }, { passive: true });

  /* ---------- 12. discord ---------- */
  var dcStatus = document.getElementById("dcStatus"),
      dcName = document.getElementById("dcName"),
      dcAva = document.getElementById("dcAva"),
      dcDot = document.getElementById("dcDot");
  var statusWord = { online: "online", idle: "idle", dnd: "do not disturb", offline: "offline" };
  function pollDiscord() {
    if (!DISCORD_ID || DISCORD_ID.indexOf("YOUR_") === 0) return;
    fetch("https://api.lanyard.rest/v1/users/" + DISCORD_ID, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || !j.success) return;
        var u = j.data.discord_user, s = j.data.discord_status;
        dcName.textContent = (u.global_name || u.username || DISCORD_USERNAME);
        dcStatus.textContent = statusWord[s] || s || "offline";
        dcDot.classList.toggle("on", s === "online" || s === "idle" || s === "dnd");
        if (u.avatar) {
          var ext = u.avatar.indexOf("a_") === 0 ? "gif" : "png";
          dcAva.style.backgroundImage = "url(https://cdn.discordapp.com/avatars/" + DISCORD_ID + "/" + u.avatar + "." + ext + "?size=128)";
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
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    for (var i = 0; i < 14; i++) {
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
