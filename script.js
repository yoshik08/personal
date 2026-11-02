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

  /* ---------- 1-8. boot / cursor / typing / magnetic / tilt / accordion / reveals / progress ----------
     rebuilt on anime.js in motion.js. the stubs below keep the rAF-loop watchdog at the bottom happy. */
  var startCursorLoop = function () {};
  var startMagLoop = function () {};

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
    if (window.ykMotionChanged) window.ykMotionChanged();
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
/* core math, pasted into script.js section 10b (ES5) */
var SYNC = { POLL_MS: 3500, OPEN_POLL_MS: 2000,
             SNAP_MS: 120, IGNORE_MS: 15, SLEW_MS: 150, WINDOW: 4 };
function createPlaybackClock(nowFn) {
  nowFn = nowFn || function () { return performance.now(); };
  var baseMs = 0, basePerf = 0, playing = false, corrMs = 0, corrStart = 0;
  function get(now) {
    var pos = baseMs + (playing ? now - basePerf : 0);
    if (corrMs) { var e = now - corrStart; if (e >= SYNC.SLEW_MS) corrMs = 0; else pos += corrMs * (1 - e / SYNC.SLEW_MS); }
    return pos;
  }
  return {
    getProgressMs: function () { return get(nowFn()); },
    isPlaying: function () { return playing; },
    hardSet: function (posMs, atPerf, isPlaying) {
      var now = nowFn(); playing = !!isPlaying;
      baseMs = posMs + (playing ? now - atPerf : 0); basePerf = now; corrMs = 0;
    },
    correct: function (targetNowMs) {           /* target already projected to nowFn() */
      var now = nowFn(), shown = get(now), drift = targetNowMs - shown, ad = Math.abs(drift);
      if (ad < SYNC.IGNORE_MS) return "ignore";
      baseMs = targetNowMs; basePerf = now;
      if (ad > SYNC.SNAP_MS) { corrMs = 0; return "snap"; }
      corrMs = shown - targetNowMs; corrStart = now; return "slew";
    }
  };
}
/* one now-playing response -> position estimate at arrival time */
function sampleFrom(d, tSend, tArrive) {
  var rtt = tArrive - tSend, hasT = d.spotifyRtt != null && d.serverHold != null;
  var net = hasT ? Math.max(0, rtt - d.serverHold) / 2 : rtt / 2;
  var age = hasT ? d.spotifyRtt / 2 + d.msSinceSpotifyResponse + net : rtt / 2;
  return { pos: (d.progressMs || 0) + (d.playing ? age : 0), at: tArrive, rtt: rtt,
           unc: hasT ? d.spotifyRtt / 2 + net : rtt / 2, d: d };
}
/* freshest-sample envelope: Spotify's progress_ms is only ever stale (late), never early,
   so among recent good samples the one projecting furthest is the least stale */
function envelopeTarget(win, now) {
  var minUnc = Infinity, best = -Infinity, i;
  for (i = 0; i < win.length; i++) minUnc = Math.min(minUnc, win[i].unc);
  for (i = 0; i < win.length; i++) {
    if (win[i].unc > 2 * minUnc + 20) continue;
    best = Math.max(best, win[i].pos + (now - win[i].at));
  }
  return best;
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
      lyricsBtn = document.getElementById("lyricsBtn");
  var spState = { key: null, title: null, artist: "", artists: [], trackUrl: null, image: null, playing: false, progressMs: null, durationMs: null };
  var playbackClock = createPlaybackClock();
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
      spState = { key: null, title: null, artist: "", artists: [], trackUrl: null, image: null, playing: false, progressMs: null, durationMs: null, deviceId: null, deviceType: null };
      playbackClock.hardSet(0, performance.now(), false);
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
    var isNewTrack = spState.key !== key;
    spState.key = key;
    spState.title = title;
    spState.artist = artist;
    spState.artists = d.artists || [];
    spState.trackUrl = d.url || null;
    spState.image = d.image || null;
    spState.playing = live;
    spState.progressMs = d.progressMs;
    spState.durationMs = d.durationMs;
    spState.isrc = d.isrc || null;

    if (d && d.deviceId && d.deviceId !== spState.deviceId) {
      spState.deviceId = d.deviceId;
      spState.deviceType = d.deviceType || "Device";
    } else if (d && !d.deviceId) {
      spState.deviceId = null;
      spState.deviceType = null;
    }

    if (isNewTrack || (d && d.deviceId && d.deviceId !== spState.deviceId)) {
      try {
        var savedLyr = lsInt("lLead:" + key, null);
        lTrackHasCustomLead = savedLyr !== null;
        lyrLeadMs = lTrackHasCustomLead ? savedLyr : 0;
        var savedK = lsInt("kLead:" + key, null);
        kTrackHasCustomLead = savedK !== null;
        kLeadMs = kTrackHasCustomLead ? savedK : autoKLead(key);
      } catch (e) {}
      if (typeof updateSyncLabel !== "undefined") updateSyncLabel();
    }

    if (document.getElementById("lyricsOverlay") && document.getElementById("lyricsOverlay").classList.contains("open")) {
      setLyricsHeader();
      if (isNewTrack) {
        kSnapNext = true;
        
        lyrActiveIdx = -1;
        kActiveIdx = -1;
        lyrRenderedKey = null;
        if (lyrStore.has(key)) {
          renderLyrEntry(key, d.durationMs);
        } else if (!lyrInflight[key]) {
          fetchLyrics(title, artist, d.durationMs);
        }
      }
    }

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
  }

  var spPollTimer = null, spInflight = false, spWin = [], spEpoch = null, spClockKey = null;
  var spLastActivity = 0;
  function scheduleNext(ms) {
    if (spPollTimer) clearTimeout(spPollTimer);
    if (document.hidden) return;
    var delay = ms != null ? ms : ((lyricsOverlay && lyricsOverlay.classList.contains("open")) ? SYNC.OPEN_POLL_MS : SYNC.POLL_MS);
    var now = performance.now();
    if (now - spLastActivity < 4000) delay = 700;
    else if (spState.playing && spState.durationMs && playbackClock.getProgressMs() >= spState.durationMs - 3000) delay = 500;
    spPollTimer = setTimeout(function() { pollSpotify(false); }, delay);
  }
  function pollSpotify(hardSync, doneCb) {
    if (spInflight) {
      if (doneCb) doneCb();
      return;
    }
    spInflight = true;
    if (spPollTimer) { clearTimeout(spPollTimer); spPollTimer = null; }
    var tSend = performance.now();
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var abortTimer = ctrl ? setTimeout(function() { ctrl.abort(); }, 6000) : null;
    fetch("/api/now-playing", { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (abortTimer) clearTimeout(abortTimer);
        var tArr = performance.now();
        return r.json().then(function(d) { return {d: d, tSend: tSend, tArr: tArr}; });
      })
      .then(function (res) {
        spInflight = false;
        handleSample(res.d, res.tSend, res.tArr, hardSync);
        if (doneCb) doneCb();
      })
      .catch(function () {
        if (abortTimer) clearTimeout(abortTimer);
        spInflight = false;
        scheduleNext();
        if (doneCb) doneCb();
      });
  }
  function applySample(s, hard) {
    if (!s.d || !s.d.title) {
      playbackClock.hardSet(0, performance.now(), false);
      spClockKey = null;
      spWin = [];
      return "stop";
    }
    var key = s.d.trackId || (s.d.title + " :: " + s.d.artist);
    /* spotify's `timestamp` is the moment of the last playback state change (play, pause, skip,
       scrub). it stays fixed during normal playback (measured on this account: one value across 60s),
       so when it moves, every older sample describes a timeline that no longer exists. dropping them
       is what makes a short backward scrub land: before, a < 2s scrub back was not seen as a seek and
       the newest-sample envelope kept lyrics running ahead by the scrub for ~6s. */
    var epoch = key + "|" + !!s.d.playing + "|" + (s.d.spotifyTs || "");
    var newTrack = key !== spClockKey;
    var stateChanged = spEpoch !== null && epoch !== spEpoch;
    spClockKey = key;
    if (hard || newTrack || stateChanged || !s.d.playing || !playbackClock.isPlaying()) {
      playbackClock.hardSet(s.pos, s.at, !!s.d.playing);
      spWin = s.d.playing ? [s] : [];
      spEpoch = epoch;
      return newTrack ? "newtrack" : stateChanged ? "state" : "reset";
    }
    spWin.push(s);
    if (spWin.length > SYNC.WINDOW) spWin.shift();
    var now = performance.now();
    return playbackClock.correct(envelopeTarget(spWin, now));
  }
  function handleSample(d, tSend, tArr, hardSync) {
    if (!d) { scheduleNext(); return; }
    if (d.rateLimited) { scheduleNext(Math.max(6000, (d.retryAfter || 6) * 1000)); return; }
    if (d.transient) { scheduleNext(4000); return; } /* keep the current track + lyrics on screen */
    var s = sampleFrom(d, tSend, tArr);
    var key = d.trackId || (d.title ? (d.title + " :: " + d.artist) : null);
    var isNewTrack = key !== spClockKey;
    var curPos = playbackClock.getProgressMs();
    var seeked = Math.abs(s.pos - curPos) > 2000;
    var _hard = !!(hardSync || isNewTrack || seeked);
    if (_hard) spLastActivity = performance.now();
    renderSpotify(d);
    /* after a state change during playback (scrub, resume), poll quickly for a few seconds so the
       sample window refills fast; not while paused, and not for ordinary corrections */
    var applied = applySample(s, _hard);
    if (!_hard && applied === "state" && d.playing) spLastActivity = performance.now();
    scheduleNext();
  }
  /* coming back to the tab is a normal (soft) poll: a pause/skip/scrub made while away arrives as
     a new spotify timestamp and resets the clock by itself. the old hard reset threw away the
     sample history and made the lyrics step back ~100ms on every alt-tab. long absences still
     start clean (buffering stalls while away don't always move the timestamp). */
  var spHiddenAt = 0;
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) { spHiddenAt = performance.now(); return; }
    pollSpotify(performance.now() - spHiddenAt > 30000);
  });
  window.addEventListener("focus", function() {
    if (!document.hidden) {
      pollSpotify(false);
    }
  });
  pollSpotify(true);

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
      kTopCover = document.getElementById("kTopCover"),
      kTopTitle = document.getElementById("kTopTitle"),
      kTopArtist = document.getElementById("kTopArtist"),
      kTopProg = document.getElementById("kTopProg"),
      karaokeStage = document.getElementById("karaokeStage"),
      kTapeCol = document.getElementById("kTapeCol");

  var EMOJI_MAP = {
  yeah:"🔥",yea:"🔥",yuh:"🔥",ayy:"🙌",ay:"🙌",aye:"🙌",woo:"🥳",skrrt:"🏎️",skrt:"🏎️",brr:"🥶",bet:"🤝",facts:"💯",fax:"💯",
  deadass:"💯",forreal:"💯",hundred:"💯",perfect:"💯",fire:"🔥",lit:"🔥",flame:"🔥",flames:"🔥",burn:"🔥",blaze:"🔥",hot:"🥵",
  heat:"🥵",sauce:"🥫",spicy:"🌶️",pepper:"🌶️",gas:"⛽",fuel:"⛽",valid:"✅",slay:"💅",slaps:"🔊",banger:"🔊",bop:"🎶",vibe:"🌈",
  vibes:"🌈",mood:"🌈",energy:"⚡",aura:"✨",rizz:"😏",swag:"😎",swagger:"😎",drip:"💧",drippy:"💧",wet:"💦",splash:"💦",
  flex:"💪",flexin:"💪",stunt:"😎",stuntin:"😎",style:"🕶️",fly:"🕊️",fresh:"🆕",clean:"🧼",icy:"🧊",ice:"🧊",frozen:"🧊",
  freeze:"🧊",cold:"🥶",chill:"🧊",cool:"😎",shades:"🕶️",glasses:"🕶️",sunglasses:"🕶️",money:"💸",cash:"💵",bands:"💵",
  band:"💵",racks:"💰",rack:"💰",stack:"💰",stacks:"💰",bread:"🍞",cheese:"🧀",cheddar:"🧀",paper:"📄",guap:"💰",bag:"💰",
  bags:"💰",bankroll:"💰",bank:"🏦",vault:"🏦",safe:"🔐",rich:"🤑",wealthy:"🤑",millionaire:"🤑",billionaire:"🤑",million:"🤑",
  millions:"🤑",billion:"🤑",ticket:"🎟️",dollar:"💲",dollars:"💲",dime:"🪙",penny:"🪙",coin:"🪙",coins:"🪙",crypto:"🪙",
  bitcoin:"🪙",paid:"💰",check:"💳",cheque:"💳",debt:"📉",broke:"📉",poor:"📉",profit:"📈",stocks:"📈",invest:"📈",hustle:"💼",
  grind:"⚙️",grindin:"⚙️",work:"💼",job:"💼",business:"💼",deal:"🤝",boss:"😎",ceo:"👔",suit:"👔",shop:"🛍️",shopping:"🛍️",
  mall:"🛍️",spend:"💸",spent:"💸",blow:"💸",tip:"💵",price:"🏷️",cost:"🏷️",expensive:"💎",cheap:"🏷️",luxury:"💎",
  designer:"👜",gucci:"👜",prada:"👜",louis:"👜",fendi:"👜",dior:"👜",chanel:"👜",versace:"👜",balenciaga:"👟",purse:"👜",
  wallet:"👛",diamond:"💎",diamonds:"💎",gem:"💎",jewel:"💎",jewelry:"💎",bling:"💎",chain:"⛓️",chains:"⛓️",necklace:"📿",
  pendant:"📿",rings:"💍",rolex:"⌚",watch:"⌚",wrist:"⌚",patek:"⌚",gold:"🥇",golden:"🥇",silver:"🥈",platinum:"💿",
  plaque:"💿",grammy:"🏆",award:"🏆",trophy:"🏆",medal:"🏅",crown:"👑",throne:"👑",king:"👑",kings:"👑",queen:"👸",prince:"🤴",
  princess:"👸",royal:"👑",goat:"🐐",legend:"🏆",legendary:"🏆",icon:"⭐",star:"⭐",superstar:"🌟",famous:"🌟",fame:"🌟",
  celebrity:"🌟",spotlight:"🔦",camera:"📸",cameras:"📸",paparazzi:"📸",photo:"📸",pic:"📸",selfie:"🤳",picture:"🖼️",
  frame:"🖼️",win:"🏆",winning:"🏆",winner:"🏆",won:"🏆",champion:"🏆",champ:"🏆",best:"🥇",greatest:"🐐",loser:"📉",player:"🎮",
  mvp:"🏆",goal:"🥅",aim:"🎯",target:"🎯",car:"🏎️",cars:"🚘",whip:"🏎️",ride:"🚗",drive:"🚗",drivin:"🚗",driver:"🚗",wheel:"🛞",
  wheels:"🛞",tires:"🛞",engine:"🏁",motor:"🏁",race:"🏁",racing:"🏁",speed:"💨",fast:"💨",faster:"💨",zoom:"💨",vroom:"🏎️",
  lambo:"🏎️",lamborghini:"🏎️",ferrari:"🏎️",porsche:"🏎️",benz:"🚘",mercedes:"🚘",bentley:"🚘",rolls:"🚘",bugatti:"🏎️",
  maybach:"🚘",tesla:"🚘",truck:"🛻",coupe:"🏎️",foreign:"🏎️",garage:"🏠",parking:"🅿️",road:"🛣️",roads:"🛣️",highway:"🛣️",
  freeway:"🛣️",street:"🛣️",streets:"🛣️",hood:"🏘️",city:"🏙️",town:"🏘️",downtown:"🌆",uptown:"🌆",corner:"🏘️",traffic:"🚦",
  plane:"✈️",planes:"✈️",jet:"🛩️",private:"🛩️",flight:"✈️",flights:"✈️",airport:"🛫",pilot:"✈️",boat:"🛥️",yacht:"🛥️",
  ship:"🚢",train:"🚆",bike:"🚲",bus:"🚌",taxi:"🚕",uber:"🚕",rocket:"🚀",launch:"🚀",space:"🚀",moonwalk:"🌕",travel:"🧳",
  passport:"🛂",vacation:"🏝️",trip:"🧳",world:"🌍",global:"🌍",earth:"🌎",map:"🗺️",paris:"🗼",london:"💂",tokyo:"🗼",
  miami:"🌴",vegas:"🎰",york:"🗽",atlanta:"🍑",houston:"🚀",chicago:"🌆",toronto:"🍁",cali:"🌴",california:"🌴",texas:"🤠",
  brazil:"🇧🇷",mexico:"🌮",love:"❤️",lovin:"❤️",lover:"💕",lovers:"💕",loved:"❤️",heart:"💖",hearts:"💖",heartbeat:"💓",
  heartbreak:"💔",heartbroken:"💔",broken:"💔",break:"💔",kiss:"💋",kisses:"💋",kissin:"💋",lips:"💋",hug:"🫂",hugs:"🫂",
  cuddle:"🫂",crush:"😍",cute:"🥺",pretty:"🌸",beautiful:"🌸",gorgeous:"😍",sexy:"😏",hottie:"🥵",baby:"👶",babe:"😘",bae:"😘",
  boo:"👻",shawty:"💅",darling:"🥰",honey:"🍯",sweetie:"🍬",sweet:"🍬",sugar:"🍬",candy:"🍭",lollipop:"🍭",chocolate:"🍫",
  cake:"🎂",cookie:"🍪",cherry:"🍒",cherries:"🍒",peach:"🍑",strawberry:"🍓",lemon:"🍋",lemonade:"🍋",apple:"🍎",banana:"🍌",
  grape:"🍇",watermelon:"🍉",pineapple:"🍍",mango:"🥭",coconut:"🥥",honeymoon:"🌙",dates:"🌹",valentine:"💘",cupid:"💘",
  forever:"♾️",always:"♾️",eternity:"♾️",infinity:"♾️",soulmate:"💞",wifey:"💍",wife:"💍",husband:"💍",marry:"💒",
  married:"💒",wedding:"💒",bride:"👰",propose:"💍",together:"💑",couple:"💑",relationship:"💑",exes:"🙅",lonely:"🥀",
  alone:"🥀",miss:"🥺",missin:"🥺",jealous:"😒",toxic:"☠️",cheat:"🐍",cheater:"🐍",cheated:"🐍",liar:"🤥",lie:"🤥",lies:"🤥",
  lyin:"🤥",fake:"🤡",clown:"🤡",snake:"🐍",snakes:"🐍",trust:"🤝",loyal:"🤞",loyalty:"🤞",promise:"🤞",swear:"🤞",secret:"🤫",
  secrets:"🤫",whisper:"🤫",quiet:"🤫",silence:"🤫",shh:"🤫",cry:"😭",cryin:"😭",crying:"😭",cried:"😭",tears:"😢",tear:"😢",
  sad:"😔",sadness:"😔",blue:"💙",hurt:"🤕",pain:"🩹",scar:"🩹",scars:"🩹",wound:"🩹",bleed:"🩸",bleeding:"🩸",blood:"🩸",
  sorry:"🙏",apologize:"🙏",regret:"😞",depressed:"😞",anxiety:"😰",stress:"😩",stressed:"😩",tired:"😴",sleepy:"😴",sleep:"😴",
  nap:"😴",bed:"🛏️",pillow:"🛏️",dream:"💭",dreams:"💭",dreamin:"💭",nightmare:"😱",wake:"⏰",awake:"👁️",insomnia:"🌃",
  happy:"😊",happiness:"😊",smile:"😁",smilin:"😁",laugh:"😂",laughin:"😂",lol:"😂",haha:"😂",joke:"😂",funny:"😂",fun:"🥳",
  joy:"😊",glad:"😊",excited:"🤩",amazing:"🤩",wow:"🤩",crazy:"🤪",insane:"🤯",brain:"🧠",smart:"🧠",genius:"🧠",thinkin:"🤔",
  thoughts:"💭",wonder:"🤔",wild:"🐆",savage:"😈",mad:"😤",angry:"😠",anger:"😠",rage:"😡",hate:"😤",hater:"😒",haters:"😒",
  enemy:"😤",enemies:"😤",opps:"👀",beef:"🥩",scared:"😱",scary:"😱",afraid:"😱",fear:"😱",nervous:"😬",shy:"🙈",shock:"😳",
  shook:"😳",confused:"😵",dizzy:"😵",search:"🔎",hope:"🤞",faith:"🙏",wish:"🌠",wishes:"🌠",luck:"🍀",lucky:"🍀",blessed:"🙌",
  bless:"🙌",blessing:"🙌",grateful:"🙏",thankful:"🙏",thank:"🙏",thanks:"🙏",pray:"🙏",prayer:"🙏",prayin:"🙏",god:"🙏",
  lord:"🙏",jesus:"✝️",church:"⛪",heaven:"☁️",angel:"😇",angels:"😇",halo:"😇",holy:"😇",saint:"😇",good:"😇",devil:"😈",
  demon:"👹",demons:"👹",evil:"👿",bad:"😈",sin:"😈",sins:"😈",hell:"🔥",soul:"🫀",spirit:"👻",ghost:"👻",ghosts:"👻",
  haunted:"👻",dead:"💀",death:"💀",die:"💀",dying:"💀",skull:"💀",bones:"🦴",grave:"🪦",rip:"🪦",heavenly:"☁️",karma:"☯️",
  peace:"☮️",zen:"🧘",calm:"😌",relax:"😌",breathe:"💨",party:"🎉",parties:"🎉",partyin:"🎉",celebrate:"🎊",turnt:"🎉",
  dance:"💃",dancin:"💃",dancer:"💃",twerk:"🍑",club:"🪩",clubs:"🪩",disco:"🪩",dj:"🎧",floor:"🪩",stage:"🎤",crowd:"🙌",
  concert:"🎤",tour:"🚌",festival:"🎡",rave:"🪩",night:"🌙",nights:"🌙",tonight:"🌃",midnight:"🌃",drink:"🍹",drinks:"🍹",
  drinkin:"🍹",cup:"🥤",cups:"🥤",sip:"🥤",shot:"🥃",shots:"🥃",liquor:"🥃",whiskey:"🥃",tequila:"🥃",vodka:"🍸",wine:"🍷",
  champagne:"🍾",bottle:"🍾",bottles:"🍾",toast:"🥂",cheers:"🥂",beer:"🍺",drunk:"🥴",tipsy:"🥴",smoke:"💨",smokin:"💨",
  high:"🌿",cloud:"☁️",clouds:"☁️",hookah:"💨",lighter:"🔥",ash:"🚬",food:"🍔",hungry:"🍔",eat:"🍽️",eatin:"🍽️",dinner:"🍽️",
  lunch:"🥪",breakfast:"🥞",pizza:"🍕",burger:"🍔",fries:"🍟",chicken:"🍗",wings:"🪽",steak:"🥩",sushi:"🍣",tacos:"🌮",taco:"🌮",
  noodles:"🍜",ramen:"🍜",rice:"🍚",icecream:"🍦",cream:"🍦",milk:"🥛",coffee:"☕",tea:"🍵",juice:"🧃",water:"💧",soda:"🥤",
  popcorn:"🍿",snack:"🍿",kitchen:"🍳",cook:"🍳",cookin:"🍳",chef:"🍳",recipe:"📜",phone:"📱",phones:"📱",iphone:"📱",call:"📞",
  calls:"📞",callin:"📞",text:"💬",texts:"💬",textin:"💬",message:"💌",dm:"📩",dms:"📩",inbox:"📥",email:"📧",letter:"💌",
  facetime:"🤳",insta:"📸",instagram:"📸",tiktok:"🎵",twitter:"🐦",online:"🌐",internet:"🌐",viral:"🦠",followers:"👥",
  likes:"👍",views:"👀",stream:"🎧",streams:"🎧",spotify:"🎧",radio:"📻",tv:"📺",movie:"🎬",movies:"🎬",film:"🎬",scene:"🎬",
  hollywood:"🎬",computer:"💻",laptop:"💻",code:"💻",robot:"🤖",alien:"👽",ufo:"🛸",matrix:"🕶️",glitch:"👾",video:"📹",
  records:"💿",album:"💿",mixtape:"📼",tape:"📼",studio:"🎙️",mic:"🎤",microphone:"🎤",sing:"🎤",singin:"🎤",singer:"🎤",
  song:"🎵",songs:"🎵",music:"🎶",melody:"🎶",rhythm:"🥁",beat:"🥁",beats:"🥁",drum:"🥁",drums:"🥁",bass:"🔊",loud:"🔊",
  volume:"🔊",speaker:"🔊",headphones:"🎧",guitar:"🎸",piano:"🎹",violin:"🎻",trumpet:"🎺",saxophone:"🎷",rap:"🎤",rapper:"🎤",
  verse:"📝",bars:"📝",pen:"🖊️",write:"✍️",wrote:"✍️",book:"📖",books:"📚",school:"🏫",class:"🏫",teacher:"🏫",college:"🎓",
  graduate:"🎓",degree:"🎓",plan:"📝",plans:"📝",list:"📝",notes:"🗒️",history:"📜",story:"📖",stories:"📖",chapter:"📖",
  time:"⏳",clock:"⏰",hour:"⏰",hours:"⏰",minute:"⏱️",minutes:"⏱️",seconds:"⏱️",today:"📅",tomorrow:"🌅",yesterday:"🕰️",
  morning:"🌅",sunrise:"🌅",sunset:"🌇",evening:"🌆",weekend:"🎉",monday:"😩",friday:"🎉",saturday:"🎉",sunday:"☀️",
  summer:"🏖️",winter:"❄️",spring:"🌷",autumn:"🍂",christmas:"🎄",halloween:"🎃",birthday:"🎂",year:"📅",years:"📅",new:"🆕",
  young:"🧒",old:"👴",future:"🔮",memories:"🧠",memory:"🧠",remember:"🧠",forget:"🫥",forgot:"🫥",moment:"⏱️",repeat:"🔁",
  replay:"🔁",rewind:"⏪",pause:"⏸️",run:"🏃",runnin:"🏃",runaway:"🏃",chase:"🏃",jump:"🦘",walk:"🚶",walkin:"🚶",climb:"🧗",
  flyin:"🕊️",float:"🎈",balloon:"🎈",swim:"🏊",surf:"🏄",sink:"⚓",drown:"🌊",moon:"🌙",moonlight:"🌙",sun:"☀️",sunshine:"🌞",
  sunny:"☀️",stars:"✨",starry:"✨",shine:"✨",shinin:"✨",glow:"✨",glitter:"✨",sparkle:"✨",galaxy:"🌌",universe:"🌌",
  planet:"🪐",mars:"🪐",sky:"🌌",skies:"🌌",rain:"🌧️",rainy:"🌧️",rainbow:"🌈",storm:"⛈️",thunder:"⚡",lightning:"⚡",
  wind:"🌬️",tornado:"🌪️",hurricane:"🌀",snow:"❄️",snowflake:"❄️",ocean:"🌊",sea:"🌊",wave:"🌊",waves:"🌊",tide:"🌊",
  beach:"🏝️",island:"🏝️",sand:"🏖️",river:"🏞️",lake:"🏞️",hills:"⛰️",hill:"⛰️",mountain:"🏔️",mountains:"🏔️",valley:"🏞️",
  desert:"🏜️",jungle:"🌴",forest:"🌲",tree:"🌳",trees:"🌳",palm:"🌴",leaf:"🍃",leaves:"🍂",flower:"🌸",flowers:"🌸",rose:"🌹",
  roses:"🌹",petal:"🌸",garden:"🌷",sunflower:"🌻",tulip:"🌷",lily:"🪷",grass:"🌱",seed:"🌱",grow:"🌱",growin:"🌱",
  earthquake:"🫨",volcano:"🌋",fireworks:"🎆",dark:"🌑",darkness:"🌑",shadow:"👤",shadows:"👤",black:"🖤",white:"🤍",red:"❤️",
  pink:"🩷",purple:"💜",green:"💚",yellow:"💛",orange:"🧡",colors:"🌈",eyes:"👀",eye:"👁️",look:"👀",lookin:"👀",stare:"👀",
  face:"😶",tongue:"👅",mouth:"👄",teeth:"🦷",hand:"✋",hands:"👐",finger:"☝️",fingers:"🤞",nails:"💅",hair:"💇",body:"💃",
  legs:"🦵",feet:"🦶",shoes:"👟",sneakers:"👟",kicks:"👟",jordans:"👟",nikes:"👟",boots:"👢",heels:"👠",dress:"👗",jeans:"👖",
  shirt:"👕",hoodie:"🧥",jacket:"🧥",coat:"🧥",hat:"🧢",cap:"🧢",mask:"🎭",makeup:"💄",lipstick:"💄",perfume:"🧴",mirror:"🪞",
  muscle:"💪",strong:"💪",strength:"💪",power:"⚡",powerful:"⚡",clap:"👏",hello:"👋",bye:"👋",goodbye:"👋",pinky:"🤙",
  handshake:"🤝",fist:"✊",punch:"👊",fight:"🥊",fightin:"🥊",boxing:"🥊",knockout:"🥊",war:"⚔️",battle:"⚔️",sword:"⚔️",
  shield:"🛡️",armor:"🛡️",army:"🪖",soldier:"🪖",gun:"💥",guns:"💥",shoot:"💥",shootin:"💥",bang:"💥",boom:"💥",bomb:"💣",
  blast:"💥",explode:"💥",police:"🚓",cops:"🚓",sirens:"🚨",jail:"⛓️",prison:"⛓️",freedom:"🕊️",judge:"⚖️",court:"⚖️",
  lawyer:"⚖️",crime:"🚨",danger:"⚠️",dangerous:"⚠️",risk:"🎲",dice:"🎲",casino:"🎰",gamble:"🎰",cards:"🃏",poker:"🃏",
  chess:"♟️",trap:"🪤",key:"🔑",keys:"🔑",lock:"🔒",door:"🚪",doors:"🚪",window:"🪟",house:"🏡",home:"🏠",mansion:"🏰",
  castle:"🏰",palace:"🏰",pool:"🏊",penthouse:"🏙️",roof:"🏠",room:"🚪",couch:"🛋️",tub:"🛁",shower:"🚿",girl:"💅",girls:"💅",
  woman:"👩",women:"👩",lady:"💃",ladies:"💃",boy:"🧢",boys:"🧢",man:"🧔",men:"🧔",guy:"🧔",dude:"🧔",bro:"🤜",brother:"🤜",
  brothers:"🤜",sister:"👭",sisters:"👭",friend:"🤝",friends:"🤝",homie:"🤝",homies:"🤝",dawg:"🐶",fam:"🏡",family:"🏡",
  mama:"👩",mom:"👩",mother:"👩",dad:"👨",daddy:"👨",father:"👨",son:"👦",daughter:"👧",kid:"🧒",kids:"🧒",child:"🧒",
  children:"🧒",crew:"👯",squad:"👯",team:"🤝",gang:"🤝",clique:"👯",everybody:"🙌",everyone:"🙌",people:"👥",stranger:"🕵️",
  neighbor:"🏘️",baddie:"💅",diva:"💅",bestie:"👯",dog:"🐶",dogs:"🐶",puppy:"🐶",cat:"🐱",kitty:"🐱",lion:"🦁",tiger:"🐯",
  wolf:"🐺",wolves:"🐺",bear:"🐻",fox:"🦊",bunny:"🐰",rabbit:"🐰",horse:"🐎",pony:"🐴",bird:"🐦",birds:"🐦",eagle:"🦅",dove:"🕊️",
  owl:"🦉",butterfly:"🦋",butterflies:"🦋",bee:"🐝",bees:"🐝",spider:"🕷️",shark:"🦈",fish:"🐟",whale:"🐋",dolphin:"🐬",
  monkey:"🐒",ape:"🦍",gorilla:"🦍",panda:"🐼",unicorn:"🦄",dragon:"🐉",dinosaur:"🦖",frog:"🐸",rat:"🐀",cow:"🐄",pig:"🐷",
  duck:"🦆",bull:"🐂",panther:"🐆",cheetah:"🐆",leopard:"🐆",zebra:"🦓",monster:"👾",beast:"🦍",magic:"🪄",wizard:"🧙",
  witch:"🧙",spell:"✨",potion:"🧪",crystal:"🔮",fortune:"🔮",destiny:"🔮",fate:"🔮",mystery:"🕵️",gift:"🎁",gifts:"🎁",
  surprise:"🎁",candle:"🕯️",balloons:"🎈",confetti:"🎊",ribbon:"🎀",bow:"🎀",doll:"🪆",teddy:"🧸",toy:"🧸",fairy:"🧚",
  fairytale:"🧚",hero:"🦸",superhero:"🦸",villain:"🦹",ninja:"🥷",pirate:"☠️",cowboy:"🤠",zombie:"🧟",vampire:"🧛",
  medicine:"💊",pill:"💊",pills:"💊",doctor:"🩺",hospital:"🏥",sick:"🤒",fever:"🤒",poison:"☠️",bitter:"🍋",sour:"🍋",
  salty:"🧂",fireproof:"🧯",alarm:"🚨",bell:"🔔",tick:"⏱️",
  you:"👉",u:"👉",ya:"👉",yall:"👥","y'all":"👥",your:"👉",yours:"👉",yourself:"👉",
  bruh:"😑",opp:"🎯",ops:"🎯",dripping:"💧",iced:"🧊",goated:"🐐",rollie:"⌚",psycho:"🤪",
  lunatic:"🤪",lowkey:"🤫",highkey:"📢",lmao:"😂",nocap:"🚫🧢",fr:"💯",real:"💯",sus:"🤨",
  thick:"🍑",booty:"🍑",shorty:"💃",ex:"💔",ghosted:"👻",pop:"💥",popping:"💥",poppin:"💥",
  lean:"🥤",drank:"🥤",turn:"🔄",ig:"📸",gram:"📸",pull:"🧲",slide:"🛝",glock:"🔫",
  trigger:"🔫",damn:"😳",woah:"😮",whoa:"😮",oops:"🙊",
  // --- taste-based additions (mined from library lyrics) ---
  // money / luxury / brands
  thousand:"💵",mil:"🤑",miles:"🛣️",hunnid:"💯",commas:"💰",dough:"💰",bill:"💵",card:"💳",buy:"🛒",count:"🧮",
  pocket:"👖",tiffany:"💎",birkin:"👜",mink:"🧥",nike:"👟",vip:"🥂",plug:"🔌",
  // cars / rides
  rari:"🏎️",corvette:"🏎️",wraith:"🚘",phantom:"👻",rover:"🚙",backseat:"🚘",seat:"💺",ridin:"🚗",riding:"🚗",driving:"🚗",
  metro:"🚇",
  // drugs / drinks / smoke
  drug:"💊",molly:"💊",ecstasy:"💊",percocet:"💊",needle:"💉",codeine:"🥤",wock:"🥤",syrup:"🥤",pint:"🥤",sippin:"🥤",
  sipping:"🥤",pour:"🫗",henny:"🥃",hennessy:"🥃",weed:"🌿",kush:"🍃",blunt:"🍃",hotbox:"💨",smoking:"💨",cigarette:"🚬",
  cocaine:"❄️",wasted:"🥴",faded:"🥴",geeked:"🤪",trippin:"🤪",tripping:"🤪",
  // guns / street
  pistol:"🔫",strapped:"🔫",uzi:"🔫",chopper:"🚁",choppa:"🚁",draco:"🐉",knife:"🔪",kill:"🔪",block:"🧱",stop:"🛑",
  // body / flirt
  ass:"🍑",dick:"🍆",sex:"🔞",naked:"🫣",bite:"🫦",lick:"👅",taste:"👅",nose:"👃",knees:"🧎",arms:"💪",breath:"😮💨",
  sweat:"💦",freak:"😜",freaky:"😜",
  // love / feels
  ring:"💍",ringing:"📞",girlfriend:"💞",boyfriend:"💞",true:"💯",mind:"🧠",lost:"🧭",hide:"🙈",scream:"😱",lame:"🥱",
  drama:"🎭",lying:"🤥",loving:"❤️",save:"🛟",free:"🕊️",
  // places / home
  crib:"🏠",hotel:"🏨",motel:"🏩",bedroom:"🛏️",sheets:"🛏️",booth:"🎙️",paradise:"🏝️",
  // party / music / play
  dancing:"💃",shake:"🫨",rock:"🤘",rockstar:"🤘",play:"🎮",game:"🎮",ball:"🏀",swimming:"🏊",running:"🏃",top:"🔝",
  crash:"💥",mustard:"🌭",
  // light / vibes / fun
  light:"💡",shining:"✨",woke:"⏰",chick:"🐥",
  // romanized hindi / punjabi
  dil:"❤️",yaar:"🤝",pyaar:"💕",pyar:"💕",jaan:"💖",raat:"🌙",taare:"✨",badal:"☁️",duniya:"🌍",aankhon:"👀",saath:"🫂",
  // spanish (normalizer only trims edge accents: bebé -> beb; inner accents stay: corazón)
  mami:"💃",noche:"🌙",amor:"❤️",fiesta:"🎉",baila:"💃",bailando:"💃",loco:"🤪",loca:"🤪",beb:"👶",bebe:"👶",
  fuego:"🔥",dinero:"💸",corazon:"❤️","corazón":"❤️"
};
  var EMOJI_STOP = {"a":1,"the":1,"i":1,"me":1,"it":1,"oh":1,"la":1,"na":1};
  function emojiFor(word) {
    var w = word.toLowerCase().replace(/[’‘]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "").replace(/^'+|'+$/g, "");
    if (!w || EMOJI_STOP[w]) return null;
    var tries = [w, w.replace(/'s$/, ""), w.replace(/in'?$/, "ing"), w.replace(/in'?$/, ""), w.replace(/ing$/, ""),
                 w.replace(/ies$/, "y"), w.replace(/es$/, ""), w.replace(/s$/, ""), w.replace(/ed$/, "")];
    for (var i = 0; i < tries.length; i++) if (tries[i] && EMOJI_MAP[tries[i]]) return EMOJI_MAP[tries[i]];
    return null;
  }

  /* ---------- apple (iOS) emojis ---------- */
  var APPLE_EMOJI_BASE = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/";
  var EMOJI_REGEX;
  try {
    /* real emoji only: emoji-presentation chars, or pictographs explicitly followed by VS16.
       plain text symbols (↗ ⌘ ◐ ♪ ✦) must stay text — they have no apple image and each one
       used to trigger a failing image request + a flash of broken fallback. */
    EMOJI_REGEX = new RegExp("(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F)(?:\\uFE0F|\\u200D(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F?)|\\p{Emoji_Modifier})*", "gu");
  } catch (e) {
    EMOJI_REGEX = null;
  }

  var appleEmojiCache = (typeof Map !== "undefined") ? new Map() : {
    _d: {},
    get: function (k) { return this._d[k]; },
    set: function (k, v) { this._d[k] = v; },
    has: function (k) { return Object.prototype.hasOwnProperty.call(this._d, k); }
  };

  function getEmojiVariants(str) {
    var codes = [];
    if (Array.from) {
      var chars = Array.from(str);
      for (var i = 0; i < chars.length; i++) {
        codes.push(chars[i].codePointAt(0).toString(16).toLowerCase());
      }
    } else {
      for (var j = 0; j < str.length;) {
        var cp = str.codePointAt(j);
        codes.push(cp.toString(16).toLowerCase());
        j += cp > 0xffff ? 2 : 1;
      }
    }
    var raw = codes.join("-");
    var list = [raw];

    // 2. retry with every "-fe0f" removed
    var noFe0f = raw.replace(/-fe0f/g, "");
    if (noFe0f !== raw && list.indexOf(noFe0f) === -1) {
      list.push(noFe0f);
    }

    // 3. retry with "-fe0f" appended to the first codepoint
    var parts = raw.split("-");
    if (parts.length > 0 && parts[0].indexOf("fe0f") === -1) {
      var withFe0f = (parts.length > 1 && parts[1] === "fe0f")
        ? raw
        : (parts[0] + "-fe0f" + (parts.length > 1 ? "-" + parts.slice(1).join("-") : ""));
      if (withFe0f !== raw && list.indexOf(withFe0f) === -1) {
        list.push(withFe0f);
      }
    }
    return list;
  }

  function toAppleEmoji(char) {
    if (appleEmojiCache.has(char)) {
      var cached = appleEmojiCache.get(char);
      if (!cached) {
        return document.createTextNode(char);
      }
      var imgCached = document.createElement("img");
      imgCached.className = "ios-emo";
      imgCached.alt = char;
      imgCached.draggable = false;
      imgCached.decoding = "async";
      imgCached.src = APPLE_EMOJI_BASE + cached + ".png";
      imgCached.onerror = function () {
        if (imgCached.parentNode) {
          imgCached.parentNode.replaceChild(document.createTextNode(char), imgCached);
        }
      };
      return imgCached;
    }

    var variants = getEmojiVariants(char);
    var img = document.createElement("img");
    img.className = "ios-emo";
    img.alt = char;
    img.draggable = false;
    img.decoding = "async";

    var step = 0;
    img.onerror = function () {
      step++;
      if (step < variants.length) {
        img.src = APPLE_EMOJI_BASE + variants[step] + ".png";
      } else {
        appleEmojiCache.set(char, null);
        if (img.parentNode) {
          img.parentNode.replaceChild(document.createTextNode(char), img);
        }
      }
    };
    img.onload = function () {
      appleEmojiCache.set(char, variants[step]);
    };
    img.src = APPLE_EMOJI_BASE + variants[0] + ".png";
    return img;
  }

  function preloadEmoji(char) {
    if (appleEmojiCache.has(char)) {
      var cached = appleEmojiCache.get(char);
      if (cached) {
        var p = new Image();
        p.src = APPLE_EMOJI_BASE + cached + ".png";
      }
      return;
    }
    var variants = getEmojiVariants(char);
    var pImg = new Image();
    var step = 0;
    pImg.onload = function () {
      appleEmojiCache.set(char, variants[step]);
    };
    pImg.onerror = function () {
      step++;
      if (step < variants.length) {
        pImg.src = APPLE_EMOJI_BASE + variants[step] + ".png";
      } else {
        appleEmojiCache.set(char, null);
      }
    };
    pImg.src = APPLE_EMOJI_BASE + variants[0] + ".png";
  }

  function replaceEmojisInTree(rootEl) {
    if (!rootEl || !EMOJI_REGEX) return;
    try {
      var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          if (!n || !n.nodeValue) return NodeFilter.FILTER_REJECT;
          var p = n.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          var tag = p.nodeName.toUpperCase();
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT") {
            return NodeFilter.FILTER_REJECT;
          }
          EMOJI_REGEX.lastIndex = 0;
          return EMOJI_REGEX.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }, false);

      var nodes = [];
      while (walker.nextNode()) {
        nodes.push(walker.currentNode);
      }

      for (var i = 0; i < nodes.length; i++) {
        var textNode = nodes[i];
        var text = textNode.nodeValue;
        EMOJI_REGEX.lastIndex = 0;
        var match;
        var lastIdx = 0;
        var frag = document.createDocumentFragment();
        var hasMatch = false;

        while ((match = EMOJI_REGEX.exec(text)) !== null) {
          hasMatch = true;
          if (match.index > lastIdx) {
            frag.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
          }
          frag.appendChild(toAppleEmoji(match[0]));
          lastIdx = match.index + match[0].length;
        }

        if (hasMatch) {
          if (lastIdx < text.length) {
            frag.appendChild(document.createTextNode(text.slice(lastIdx)));
          }
          if (textNode.parentNode) {
            textNode.parentNode.replaceChild(frag, textNode);
          }
        }
      }
    } catch (e) {}
  }

  function runEmojiWalker() {
    try {
      if (!EMOJI_REGEX) return;
      var header = document.querySelector("header");
      var main = document.querySelector("main");
      if (header) replaceEmojisInTree(header);
      if (main) replaceEmojisInTree(main);
    } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runEmojiWalker);
  } else {
    runEmojiWalker();
  }
  /* integer from localStorage; 0 is a legitimate saved lead (`|| 150` used to turn it back into 150) */
  function lsInt(key, fallback) {
    try {
      var v = parseInt(localStorage.getItem(key), 10);
      return isNaN(v) ? fallback : v;
    } catch (e) { return fallback; }
  }
  /* lyric leads (ms added to the playback clock before looking up the line/word).
     line view: 0 — the clock is accurate to ~50ms and lrclib lines already sit ~50ms ahead of
     apple's, so the old 400ms default showed every non-apple line half a second early.
     karaoke: per word source (see autoKLead). a track only deviates when you nudge it. */
  var lyrLeadMs = 0;
  var kLeadMs = 150;
  try {
    if (localStorage.getItem("lyrLeadV") !== "4") {
      /* clean slate: scrolling over the sync pill used to shift and save these silently
         (±25-50ms per wheel tick, one trackpad swipe = a second or more), so saved values
         from before this fix cannot be trusted */
      var stale = [];
      for (var li = 0; li < localStorage.length; li++) {
        var lk = localStorage.key(li);
        if (/^(kLead|lLead|lyrLead):/.test(lk) || lk === "kLeadMs" || lk === "lyrLeadMs") stale.push(lk);
      }
      stale.forEach(function (k) { localStorage.removeItem(k); });
      localStorage.setItem("lyrLeadV", "4");
    }
  } catch (e) {}
  var karaokeMode = false;
  try { karaokeMode = localStorage.getItem("karaokeMode") === "true"; } catch(e) {}
  var karaokePref = karaokeMode; /* the user's choice; forced-off for word-less songs doesn't change it */
  /* bluetooth headphones play audio late (codec + radio buffering; spotify reports the app's position,
     not what reaches your ears). this is a manual toggle, OFF by default: -225ms is the value measured
     by ear on yoshik's own headphones, not a universal number. it applies to line and word modes alike. */
  var HEADPHONES_MS = -225;
  var headphonesOn = false;
  try { headphonesOn = localStorage.getItem("ykHeadphones") === "1"; } catch (e) {}
  var lyrStore = new Map();
  var lyrInflight = {};
  var lyrRaf = 0, lyrActiveIdx = -1, lyrUserScrollAt = 0, lyrRenderedKey = null;
  var karaokeWordList = [];
  var kActiveIdx = -1;
  var kIdleTimer = null;
  var kCamY = 0;
  var kSnapNext = true;
  var kLastFrameTime = 0;
  var kLastLyrPos = 0;
  var kTrackHasCustomLead = false;
  var lTrackHasCustomLead = false;

  function resetKIdle() {
    if (kIdleTimer) clearTimeout(kIdleTimer);
    lyricsOverlay.classList.remove("idle");
    if (karaokeMode && lyricsOverlay.classList.contains("open")) {
      kIdleTimer = setTimeout(function() {
        if (karaokeMode && lyricsOverlay.classList.contains("open")) {
          lyricsOverlay.classList.add("idle");
        }
      }, 3000);
    }
  }
  window.addEventListener("mousemove", resetKIdle);
  window.addEventListener("click", resetKIdle);
  window.addEventListener("touchstart", resetKIdle);
  window.addEventListener("resize", function() {
    kSnapNext = true;
  });

  function lyrPos() { return playbackClock.getProgressMs(); }
  function lyrPut(key, val) {
    lyrStore.set(key, val);
    if (lyrStore.size > 24) lyrStore.delete(lyrStore.keys().next().value);
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

  var colorToken = 0;
  function extractDominantColors(imgSrc) {
    var token = ++colorToken;
    var img = new Image();
    img.crossOrigin = "Anonymous";
    img.onerror = function () {};
    img.onload = function() {
      if (token !== colorToken) return; /* a newer track's artwork already won */
      try { paintDominantColors(img); } catch (e) { /* tainted canvas: keep the default backdrop */ }
    };
    img.src = imgSrc;
  }
  function paintDominantColors(img) {
    {
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
        var bgHue = hsl[0];
        var bgSat = Math.max(30, Math.min(hsl[1] * 1.2, 90));
        var bgLum = Math.max(15, Math.min(hsl[2] * 0.8, 25));
        var bgLighter = Math.min(bgLum + 12, 40);
        lyricsBg.style.setProperty("--lyr-bg-gradient", "linear-gradient(135deg, hsla(" + bgHue + ", " + bgSat + "%, " + bgLum + "%, 0.8), hsla(" + ((bgHue+30)%360) + ", " + bgSat + "%, " + Math.max(5, bgLum-5) + "%, 0.9), #000)");
        lyricsOverlay.style.setProperty("--k-inactive", "hsl(" + bgHue + "," + Math.max(10, bgSat - 20) + "%," + Math.min(bgLum + 15, 60) + "%)");
        var accHue = (bgHue + 180) % 360;
        lyricsOverlay.style.setProperty("--k-accent", "hsl(" + accHue + ", 100%, 65%)");
      }
    }
  }

  /* ---------- karaoke engine (karaoke.js) ---------- */
  function emojiNode(key) {
    var frag = document.createDocumentFragment();
    var parts = (EMOJI_REGEX && key.match(EMOJI_REGEX)) || [key];
    for (var i = 0; i < parts.length; i++) frag.appendChild(toAppleEmoji(parts[i]));
    return frag;
  }
  var vk = null;
  (function initVK() {
    if (!window.ykVK || !karaokeStage) return;
    vk = ykVK.create(karaokeStage, {
      reduced: function () { return !motionOK() || window.matchMedia("(prefers-reduced-motion: reduce)").matches; },
      iconKey: function (t) { return emojiFor(t); },
      iconNode: emojiNode
    });
    var DEF = { lyric: "#ffffff", highlight: "#ff3d8b", secondary: "#d6906c" };
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem("vkSettings") || "{}"); } catch (e) {}
    var st = { style: saved.style || "visual", colors: Object.assign({}, DEF, saved.colors) };
    var bar = document.getElementById("vkSettings");
    function paint() {
      vk.setStyle(st.style); vk.setColors(st.colors);
      if (bar) {
        [].forEach.call(bar.querySelectorAll("[data-s]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-s") === st.style ? "true" : "false"); });
        [].forEach.call(bar.querySelectorAll("[data-c]"), function (i) { i.value = st.colors[i.getAttribute("data-c")]; });
      }
      try { localStorage.setItem("vkSettings", JSON.stringify(st)); } catch (e) {}
    }
    window.__vkSetStyle = function (name) { st.style = name; paint(); };
    if (bar) {
      bar.addEventListener("click", function (e) {
        var b = e.target.closest("[data-s]");
        if (b) { st.style = b.getAttribute("data-s"); paint(); }
        if (e.target.closest("#vkReset")) { st = { style: "visual", colors: Object.assign({}, DEF) }; paint(); }
      });
      bar.addEventListener("input", function (e) {
        var c = e.target.getAttribute && e.target.getAttribute("data-c");
        if (c) { st.colors[c] = e.target.value; paint(); }
      });
    }
    paint();
  })();

  var hpToggle = document.getElementById("hpToggle");
  function paintHeadphones() {
    if (!hpToggle) return;
    hpToggle.classList.toggle("active", headphonesOn);
    hpToggle.setAttribute("aria-pressed", headphonesOn ? "true" : "false");
  }
  function toggleHeadphones() {
    headphonesOn = !headphonesOn;
    try { localStorage.setItem("ykHeadphones", headphonesOn ? "1" : "0"); } catch (e) {}
    paintHeadphones();
  }
  if (hpToggle) hpToggle.addEventListener("click", toggleHeadphones);
  paintHeadphones();

  function updateKaraokeToggle(hasWords) {
    if (!hasWords) {
      karaokeToggle.classList.add("disabled");
      toggleKaraokeMode(false);
    } else {
      karaokeToggle.classList.remove("disabled");
      if (karaokePref) toggleKaraokeMode(true);
    }
  }

  function toggleKaraokeMode(force) {
    var isBool = typeof force === "boolean";
    var nextMode = isBool ? force : !karaokeMode;
    if (nextMode && (karaokeToggle.classList.contains("disabled") || !karaokeWordList.length)) {
      nextMode = false;
    }
    karaokeMode = nextMode;
    if (!isBool) { /* only a real toggle (click / K key) is a preference */
      karaokePref = karaokeMode;
      try { localStorage.setItem("karaokeMode", karaokeMode); } catch(e) {}
    }
    kSnapNext = true;
    karaokeToggle.classList.toggle("active", karaokeMode);
    lyricsOverlay.classList.toggle("karaoke-mode", karaokeMode);
    resetKIdle();
    lyricsClassicView.style.display = karaokeMode ? "none" : "";
    lyricsKaraokeView.style.display = karaokeMode ? "flex" : "none";
    if (!karaokeMode) {
      setLyricsPadding();
    } else {
      kActiveIdx = -1;
      if (vk) { vk.resize(); kSnapNext = true; }
    }
    if (typeof updateSyncLabel !== "undefined") updateSyncLabel();
  }
  karaokeToggle.addEventListener("click", toggleKaraokeMode);

  var syncBtn = document.getElementById("syncBtn");
  var syncLabel = document.getElementById("syncLabel");
  function doSync() {
    if (syncBtn.classList.contains("spinning")) return;
    syncBtn.classList.add("spinning");
    spInflight = false;
    pollSpotify(true, function() {
      syncBtn.classList.remove("spinning");
      syncBtn.classList.add("done");
      syncLabel.textContent = "✓";
      setTimeout(function() {
        syncBtn.classList.remove("done");
        syncLabel.textContent = restingSyncLabel();
      }, 900);
    });
  }
  syncBtn.addEventListener("click", doSync);
  /* no wheel handler on purpose: scrolling over this pill used to nudge the offset ±25-50ms per
     tick and save it, so one trackpad swipe could put lyrics a second or more out of sync */
  document.getElementById("syncPlus").addEventListener("click", function() { nudgeSync(50); });
  document.getElementById("syncMinus").addEventListener("click", function() { nudgeSync(-50); });
  
  /* karaoke lead by word source: apple syllable timings are exact; the others carry the
     provider bias this code has always applied. used whenever a track has no custom offset. */
  function autoKLead(key) {
    var entry = lyrStore.get(key || spState.key);
    var p = entry ? entry.calibProvider : null;
    if (p === "netease") return -400;
    if (p === "kugou") return -100;
    if (p === "apple") return 0;
    return 150;
  }
  /* resting label: "Sync" when on auto, the offset itself (tinted) when this track is nudged,
     so a shifted song can never look normal */
  function restingSyncLabel() {
    var custom = karaokeMode ? kTrackHasCustomLead : lTrackHasCustomLead;
    var v = userOffset();
    syncBtn.classList.toggle("custom", custom);
    syncBtn.title = custom ? "Offset for this song (hold to reset)" : "Resync (S)";
    return custom ? (v >= 0 ? "+" : "") + v + "ms" : (karaokeMode ? "K Sync" : "Sync");
  }
  /* what the pill shows: your tweak on top of the automatic lead (+50 means "50ms earlier") */
  function userOffset() { return karaokeMode ? kLeadMs - autoKLead() : lyrLeadMs; }
  var nudgeTimer = null;
  function updateSyncLabel(flash) {
    if (!syncLabel) return;
    if (!flash) { if (nudgeTimer) clearTimeout(nudgeTimer); syncLabel.textContent = restingSyncLabel(); return; }
    var v = userOffset();
    syncLabel.textContent = (karaokeMode ? "K " : "") + (v >= 0 ? "+" : "") + v + "ms";
    syncBtn.classList.toggle("custom", karaokeMode ? kTrackHasCustomLead : lTrackHasCustomLead);
    if (nudgeTimer) clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(function () { syncLabel.textContent = restingSyncLabel(); }, 2500);
  }

  /* +/- adjust THIS song only (saved per track; it no longer leaks into every other song) */
  function nudgeSync(delta) {
    if (!spState.key) return;
    try {
      if (karaokeMode) {
        kLeadMs = Math.max(-1000, Math.min(1000, kLeadMs + (delta > 0 ? 25 : -25)));
        kTrackHasCustomLead = true;
        localStorage.setItem("kLead:" + spState.key, kLeadMs);
      } else {
        lyrLeadMs = Math.max(-2000, Math.min(2000, lyrLeadMs + delta));
        lTrackHasCustomLead = true;
        localStorage.setItem("lLead:" + spState.key, lyrLeadMs);
      }
    } catch (e) {}
    updateSyncLabel(true);
  }
  function resetLead() {
    try {
      if (karaokeMode) { localStorage.removeItem("kLead:" + spState.key); kLeadMs = autoKLead(); kTrackHasCustomLead = false; }
      else { localStorage.removeItem("lLead:" + spState.key); lyrLeadMs = 0; lTrackHasCustomLead = false; }
    } catch (e) {}
    updateSyncLabel(true);
  }
  
  var syncPressTimer = null;
  syncBtn.addEventListener("mousedown", function() {
    syncPressTimer = setTimeout(function() { syncPressTimer = null; resetLead(); }, 600);
  });
  syncBtn.addEventListener("mouseup", function() {
    if (syncPressTimer) { clearTimeout(syncPressTimer); syncPressTimer = null; }
  });
  syncBtn.addEventListener("mouseleave", function() {
    if (syncPressTimer) { clearTimeout(syncPressTimer); syncPressTimer = null; }
  });
  syncBtn.addEventListener("touchstart", function() {
    syncPressTimer = setTimeout(function() { syncPressTimer = null; resetLead(); }, 600);
  }, {passive: true});
  syncBtn.addEventListener("touchend", function() {
    if (syncPressTimer) { clearTimeout(syncPressTimer); syncPressTimer = null; }
  });

  function renderSynced(lines, wordLines, durationMs) {
    lyricsHint.textContent = "";
    lyricsLines.innerHTML = "";
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
        var wEnd = (ln.ends && ln.ends.length === ln.words.length) ? ln.ends[j] : ((j + 1 < ln.words.length) ? ln.words[j + 1] : nextLnTime);
        if (wEnd <= wStart) wEnd = wStart + 1;
        karaokeWordList.push({ start: wStart, end: wEnd, text: w, lineIdx: i });
      });
    });

    var seenSongEmojis = {};
    karaokeWordList.forEach(function(kw) {
      var se = emojiFor(kw.text);
      if (se && !seenSongEmojis[se]) {
        seenSongEmojis[se] = true;
        var sMatches = (EMOJI_REGEX && se.match(EMOJI_REGEX)) || [se];
        for (var smi = 0; smi < sMatches.length; smi++) {
          preloadEmoji(sMatches[smi]);
        }
      }
    });
    if (vk) { vk.setWords(karaokeWordList); kSnapNext = true; }

    updateKaraokeToggle(anyHasWords);
    setLyricsPadding();
  }

  function renderPlain(plain) {
    lyricsHint.textContent = "unsynced lyrics";
    lyricsLines.innerHTML = "";
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
  var lyrFailUntil = {}, lyrTries = {};
  function fetchLyrics(title, artist, durationMs, force) {
    var key = spState.key;
    if (!key) return;
    if (!force && (lyrStore.has(key) || lyrInflight[key])) return;
    lyrInflight[key] = true;
    lyrLastQuery = { title: title, artist: artist, durationMs: durationMs, retried: false };
    lyrActiveIdx = -1; kActiveIdx = -1; lyrRenderedKey = null;
    lyricsLines.innerHTML = "";
    if (vk) vk.clear();
    lyricsHint.textContent = "finding lyrics…";
    lyricsHint.style.cursor = "";
    lyricsHint.onclick = null;
    var base = "/api/lyrics?artist=" + encodeURIComponent((artist || "").split(",")[0]) +
      "&title=" + encodeURIComponent(title) +
      "&duration=" + Math.round((durationMs || 0) / 1000) + 
      (spState.isrc ? "&isrc=" + encodeURIComponent(spState.isrc) : "") + "&v=6";
      
    /* never swallow a non-ok response: a 429 must reach the rate-limit path, and a 5xx / network
       failure must NOT be cached as "this song has no lyrics". */
    function getJson(url) {
      return fetch(url).then(function (r) {
        if (r.status === 429) return { rateLimited: true };
        if (!r.ok) return { failed: true };
        return r.json();
      }).catch(function () { return { failed: true }; });
    }
    Promise.all([getJson(base + "&mode=line"), getJson(base + "&mode=word")]).then(function(results) {
      delete lyrInflight[key];
      var dLine = results[0], dWord = results[1];
      if ((dLine && dLine.rateLimited) || (dWord && dWord.rateLimited)) { var e = new Error("rate-limited"); e.rate = true; throw e; }
      if (dLine && dLine.failed && dWord && dWord.failed) throw new Error("lyrics upstream failed");
      if (dLine && dLine.failed) dLine = null;
      var wordFailed = !!(dWord && dWord.failed);
      if (wordFailed) dWord = null;

      var entry = { empty: true, wordFailed: wordFailed };
      if (dLine && dLine.lines && dLine.lines.length) {
        entry.lines = dLine.lines;
        entry.source = dLine.source;
      } else if (dLine && dLine.plain) {
        entry.plain = dLine.plain;
      }
      
      if (dWord && dWord.lines && dWord.lines.length && dWord.wordSync) {
        entry.wordLines = dWord.lines;
        entry.calibProvider = dWord.calib ? dWord.calib.provider : null;
      }
      
      lyrPut(key, entry);
      delete lyrTries[key]; delete lyrFailUntil[key];
      /* the line request worked but the word request blew up: try the word timings once more
         in the background so karaoke can still switch on, instead of staying line-only forever */
      if (entry.wordFailed && entry.lines) {
        setTimeout(function () {
          getJson(base + "&mode=word").then(function (dw) {
            if (dw && dw.lines && dw.lines.length && dw.wordSync) {
              entry.wordLines = dw.lines;
              entry.calibProvider = dw.calib ? dw.calib.provider : null;
              entry.wordFailed = false;
              if (spState.key === key && lyricsOverlay.classList.contains("open")) { lyrRenderedKey = null; }
            }
          });
        }, 4000);
      }

      /* the source is only known now: apply its auto lead (the track-change rule ran before the
         lyrics existed, which is how apple-timed lines ended up shown 400ms early) */
      if (spState.key === key) {
        if (!kTrackHasCustomLead) kLeadMs = autoKLead(key);
        if (!lTrackHasCustomLead) lyrLeadMs = 0;
        if (typeof updateSyncLabel !== "undefined") updateSyncLabel();
      }

      if (spState.key === key && lyricsOverlay.classList.contains("open"))
        renderLyrEntry(key, durationMs);
    }).catch(function (err) {
      delete lyrInflight[key];
      /* cooldown: lyrTick auto-fetches whenever a track has no entry, so without this a failed
         request was re-issued on the very next frame (hammering the api, and "tap to retry"
         could never stay on screen). the retry counter is per track, not per call, so the
         automatic retry really happens once instead of looping every 2.5s forever. */
      var tries = lyrTries[key] || 0;
      if (!err.rate && tries < 1 && lyricsOverlay.classList.contains("open")) {
        lyrTries[key] = tries + 1;
        lyrFailUntil[key] = Date.now() + 3500;
        lyricsHint.textContent = "retrying…";
        setTimeout(function () {
          if (lyricsOverlay.classList.contains("open") && spState.key === key && !lyrStore.has(key))
            fetchLyrics(title, artist, durationMs, true);
        }, 2500);
        return;
      }
      lyrFailUntil[key] = Infinity; /* stay failed until the user taps */
      lyricsLines.innerHTML = "";
      lyricsHint.textContent = err.rate ? "too many requests — tap to retry" : "couldn't load lyrics — tap to retry";
      lyricsHint.style.cursor = "pointer";
      lyricsHint.onclick = function () {
        lyricsHint.style.cursor = "";
        lyricsHint.onclick = null;
        delete lyrFailUntil[key]; delete lyrTries[key];
        fetchLyrics(title, artist, durationMs, true);
      };
    });
  }

  var lastHeaderKey = null;
  function setLyricsHeader() {
    if (lastHeaderKey === spState.key) return;
    lastHeaderKey = spState.key;
    lyricsTitle.textContent = spState.title || "";
    if (spState.trackUrl) {
      lyricsTitle.setAttribute("href", spState.trackUrl);
    } else {
      lyricsTitle.removeAttribute("href");
    }
    lyricsArtist.textContent = "";
    (spState.artists || []).forEach(function (a, i) {
      if (i > 0) {
        lyricsArtist.appendChild(document.createTextNode(", "));
      }
      var link = document.createElement("a");
      link.textContent = a.name;
      if (a.url) { link.href = a.url; link.target = "_blank"; link.rel = "noopener"; }
      lyricsArtist.appendChild(link);
    });
    if (spState.image) {
      lyricsArt.src = spState.image;
      lyricsBg.style.backgroundImage = "url(" + spState.image + ")";
      if (kTopCover) kTopCover.src = spState.image;
      if (kTopTitle) kTopTitle.textContent = spState.title || "";
      if (kTopArtist) kTopArtist.textContent = spState.artist || "";
      extractDominantColors(spState.image);
    }
  }

  function lyrProgress() {
    if (!spState.durationMs) return;
    var pos = Math.min(lyrPos(), spState.durationMs);
    var p = (pos / spState.durationMs * 100) + "%";
    lyricsProg.style.width = p;
    if (kTopProg) kTopProg.style.width = p;
  }

  function setLyricsPadding() {
    var h = lyricsLines.clientHeight / 2;
    lyricsLines.style.paddingTop = h + "px";
    lyricsLines.style.paddingBottom = h + "px";
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
    
    var now = performance.now();
    var dt = Math.max(0, Math.min(now - (kLastFrameTime || now), 100));
    kLastFrameTime = now;
    
    lyrProgress();
    var key = spState.key;
    if (!key) return;
    if (!lyrStore.has(key)) {
      if (!lyrInflight[key] && !(lyrFailUntil[key] > Date.now())) {
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
      lyricsOverlay.classList.toggle("karaoke-mode", karaokeMode);
      lyricsClassicView.style.display = karaokeMode ? "none" : "";
      lyricsKaraokeView.style.display = karaokeMode ? "flex" : "none";
      return;
    }

    var pos = lyrPos() + (karaokeMode ? kLeadMs : lyrLeadMs) + (headphonesOn ? HEADPHONES_MS : 0);
    var entry = lyrStore.get(key);

    if (Math.abs(lyrPos() - kLastLyrPos) > 1500) kSnapNext = true;
    kLastLyrPos = lyrPos();

    if (karaokeMode && karaokeWordList.length > 0) {
      if (entry && entry.calib && !entry._logged) {
        console.info("[karaoke] provider=" + entry.calib.provider + " ref=" + entry.calib.ref + " offset=" + entry.calib.offsetMs + "ms mad=" + entry.calib.mad + " conf=" + entry.calib.confidence + " kLead=" + kLeadMs);
        entry._logged = true;
        var dbg = document.getElementById("kDebugLabel");
        if (!dbg) {
          dbg = document.createElement("div");
          dbg.id = "kDebugLabel";
          dbg.style.cssText = "position:fixed;bottom:10px;right:10px;font-size:10px;color:rgba(255,255,255,0.5);z-index:9999;display:none;pointer-events:none;";
          document.body.appendChild(dbg);
        }
        dbg.textContent = "[karaoke] p=" + entry.calib.provider + " r=" + entry.calib.ref + " off=" + entry.calib.offsetMs + " mad=" + entry.calib.mad + " conf=" + entry.calib.confidence + " lead=" + kLeadMs;
      }
    
      if (vk) { vk.update(pos, dt, kSnapNext); kSnapNext = false; }
      kActiveIdx = findKaraokeIndex(pos, kActiveIdx);
    } else if (karaokeMode && karaokeWordList.length === 0) {
      toggleKaraokeMode(false);
    } else if (!karaokeMode && entry.lines) {
      var lines = entry.lines;
      var idx = findLyricIndex(lines, pos, lyrActiveIdx);
      if (idx !== lyrActiveIdx) {
        var kids = lyricsLines.children;
        if (lyrActiveIdx >= 0 && kids[lyrActiveIdx]) kids[lyrActiveIdx].className = "lyr-line past";
        if (idx >= 0 && kids[idx]) {
          kids[idx].className = "lyr-line active";
          if (Date.now() - lyrUserScrollAt > 3000) {
            var _el = kids[idx];
            var scrollTarget = _el.offsetTop + _el.offsetHeight / 2 - lyricsLines.clientHeight / 2;
            lyricsLines.scrollTo({ top: Math.max(0, scrollTarget), behavior: "smooth" });
          }
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

  /* ---------- 11c. continuous sync loop ---------- */
  function startSyncLoop() {
    bumpLoop("sync");
    var gen = loopGen("sync");
    (function loop() {
      if (loopGen("sync") !== gen) return; /* superseded by a restart */
      loopTick("sync");
      
      if (spState.playing && spState.durationMs) {
        var p = playbackClock.getProgressMs();
        var progPct = Math.min(100, (p / spState.durationMs) * 100);
        spProg.style.width = progPct + "%";
        
        if (p >= spState.durationMs && !spInflight) {
          pollSpotify(true); /* track ended */
        }
      }

      if (lyricsOverlay && lyricsOverlay.classList.contains("open")) {
        lyrTick();
      }

      requestAnimationFrame(loop);
    })();
  }
  startSyncLoop();
  var karaokeFontsLoaded = false;
  function openLyrics() {
    if (!spState.title) return;
    setLyricsHeader();
    lyricsOverlay.classList.add("open");
    lyricsOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    lyrRenderedKey = null;
    karaokeToggle.classList.toggle("active", karaokeMode);
    lyricsOverlay.classList.toggle("karaoke-mode", karaokeMode);
    lyricsClassicView.style.display = karaokeMode ? "none" : "";
    lyricsKaraokeView.style.display = karaokeMode ? "flex" : "none";
    resetKIdle();
    if (spState.key) {
      if (lyrStore.has(spState.key)) renderLyrEntry(spState.key, spState.durationMs);
      else if (!lyrInflight[spState.key]) fetchLyrics(spState.title, spState.artist, spState.durationMs);
    }
    paintHeadphones();
    pollSpotify(false); /* fresh sample, keep the history (a hard reset here cost ~100ms of accuracy) */
  }
  function closeLyrics() {
    if (kIdleTimer) clearTimeout(kIdleTimer);
    lyricsOverlay.classList.remove("open", "idle", "karaoke-mode");
    lyricsOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  lyricsBtn.addEventListener("click", openLyrics);
  document.getElementById("lyricsClose").addEventListener("click", closeLyrics);
  document.addEventListener("keydown", function (e) {
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;
    if (e.key === "Escape" && lyricsOverlay.classList.contains("open")) { closeLyrics(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.key === "k" || e.key === "K") && lyricsOverlay.classList.contains("open")) toggleKaraokeMode();
    if ((e.key === "s" || e.key === "S") && lyricsOverlay.classList.contains("open")) doSync();
    if ((e.key === "h" || e.key === "H") && lyricsOverlay.classList.contains("open")) toggleHeadphones();
    if (karaokeMode && lyricsOverlay.classList.contains("open") && window.ykVK && window.__vkSetStyle && e.key >= "1" && e.key <= "4") window.__vkSetStyle(ykVK.STYLES[+e.key - 1]);
    if ((e.key === "d" || e.key === "D") && lyricsOverlay.classList.contains("open")) {
       var dbg = document.getElementById("kDebugLabel");
       if (dbg) dbg.style.display = dbg.style.display === "none" ? "block" : "none";
    }
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
      navigator.clipboard.writeText(DISCORD_USERNAME).then(function () { done(true); }, function () { done(false); });
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
    var pokeImgs = null;
    var popBalls = [];
    window.ykThemePop = function () {
      if (!motionOK()) return;
      if (!pokeImgs) {
        pokeImgs = pokeIds.map(function (id) {
          var im = new Image();
          im.src = "assets/pokemon/" + id + ".png";
          return im;
        });
      }
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
      if (!motionOK() || (lyricsOverlay && lyricsOverlay.classList.contains("open"))) { requestAnimationFrame(frame); return; }
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
        if (trail.length >= 2) {
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
        }
        var head = trail[trail.length - 1];
        if (head) {
          fgx.globalAlpha = 0.85;
          fgx.fillStyle = col;
          fgx.beginPath(); fgx.arc(head.x, head.y, 2.2, 0, Math.PI * 2); fgx.fill();
          fgx.globalAlpha = 1;
        }
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
    if (dead("sync")) startSyncLoop();
  }, 2000);

  /* ---------- forced revival on tab return ----------
     belt and suspenders next to the watchdog: when the tab becomes
     visible again, hand every loop a fresh generation. gen-guarded,
     so healthy loops just hand off seamlessly. */
  function reviveLoops() {
    if (!motionOK()) return;
    if (finePointer) { startCursorLoop(); startMagLoop(); }
    if (startFxLoop) startFxLoop();
    startSyncLoop();
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