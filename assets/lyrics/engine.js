/*!
 * Lyrics V2 — shared lyrics engine.
 *
 * ES5-compatible classic script, zero dependencies.
 * Exposes window.LyricsEngine with:
 *   LyricsEngine.create({ container, clock, mode, motion, onOpenRequest })
 *     -> { setLyrics(data), open(), close(), destroy(), setOffset(ms) }
 *   LyricsEngine.Spring   (spring module, see below)
 *   LyricsEngine.CONFIG    (tuning constants incl. perceptual lead times)
 *
 * Clock interface (provided by the host page):
 *   { now(): ms, playing(): bool, onSeek(cb), onRate(cb) }
 * The engine only *calls* these; it never polls the network itself.
 *
 * Data model:
 *   { source, isrc, level: "word"|"line"|"plain",
 *     lines: [{ start, end, text, words?: [{ text, start, end }],
 *               chorus?: bool, interlude?: bool }] }
 *
 * Design notes:
 * - DOM is built once per track inside setLyrics(). The rAF loop then only
 *   writes transform / opacity / CSS vars. Zero layout reads in steady state.
 * - One rAF loop per engine instance. It sleeps when springs are settled and
 *   the clock is paused, and dies on close()/destroy()/document.hidden.
 * - NEVER animate font-size. Active/inactive sizing is transform scale only.
 */
(function (global) {
'use strict';

/* ------------------------------------------------------------------ */
/* CONFIG                                                             */
/* ------------------------------------------------------------------ */
var CONFIG = {
  SUBSTEP: 1 / 120,          // spring integrator fixed substep (seconds)
  MAX_DT: 0.1,               // clamp per-frame dt so tab-switch can't spiral
  SETTLE_POS_EPS: 0.05,      // px — spring sleeps under this distance-to-target
  SETTLE_VEL_EPS: 0.05,      // px/s — and under this velocity

  HIGHLIGHT_LEAD_MS: 40,     // perceptual lead: highlights start 40ms early
  SCROLL_LEAD_MS: 250,       // perceptual lead: scroll retargets 250ms early

  STAGGER_MS: 35,            // per-line ripple stagger outward from active line
  RIPPLE_PX: 14,             // per-line ripple kick amplitude
  RIPPLE_HOLD_MS: 140,       // how long a line holds the kick before settling

  REDUCED_FADE_MS: 120,      // reduced-motion active-line opacity crossfade

  EMPHASIS_MIN_MS: 1000,     // word duration >= this => emphasis candidate
  EMPHASIS_MIN_CHARS: 2,     // emphasis word char bounds (2..7)
  EMPHASIS_MAX_CHARS: 7,

  OPACITY_NEAR: 0.42,        // opacity by distance from active line
  OPACITY_FAR: 0.30,
  BLUR_MAX_PX: 3,            // blur 0/1/2/3px, capped at |d| <= 3

  WATCHDOG_MS: 400,          // wakes the rAF loop when play resumes
  SMALL_SCREEN_PX: 640       // at/below this width blur is disabled
};

/* ------------------------------------------------------------------ */
/* Spring module                                                      */
/* ------------------------------------------------------------------ */
/* Semi-implicit Euler integrator (velocity updated before position,    */
/* which keeps it stable at our stiffnesses). Fixed 1/120s substeps,   */
/* retargetable — setTarget() keeps the current velocity so motion      */
/* stays continuous when the target moves mid-flight. The spring marks  */
/* itself settled (and snaps exactly to target) once it is within       */
/* epsilon on both position and velocity, so the rAF loop can sleep.   */
var Spring = {
  create: function (opts) {
    var mass = opts.mass;
    var stiffness = opts.stiffness;
    var damping = opts.damping;
    var x = 0;        // position
    var v = 0;        // velocity
    var target = 0;
    var settled = true;

    function settleCheck() {
      if (Math.abs(x - target) < CONFIG.SETTLE_POS_EPS &&
          Math.abs(v) < CONFIG.SETTLE_VEL_EPS) {
        x = target;
        v = 0;
        settled = true;
      }
    }

    return {
      /* Retarget without killing velocity — motion stays continuous. */
      setTarget: function (t) {
        target = t;
        if (x !== t || v !== 0) { settled = false; }
      },
      /* Hard jump, no animation (seeks, reduced-motion scroll jumps). */
      snap: function (t) {
        x = t; v = 0; target = t; settled = true;
      },
      get: function () { return x; },
      velocity: function () { return v; },
      isSettled: function () { return settled; },
      /* Advance the simulation by dt seconds (clamped internally). */
      step: function (dt) {
        if (settled) { return x; }
        var remaining = Math.min(Math.max(dt, 0), CONFIG.MAX_DT);
        while (remaining > 0) {
          var h = Math.min(CONFIG.SUBSTEP, remaining);
          var accel = (-stiffness * (x - target) - damping * v) / mass;
          v += accel * h;  // semi-implicit: velocity first...
          x += v * h;      // ...then position
          remaining -= h;
        }
        settleCheck();
        return x;
      }
    };
  },

  presets: {
    lineScroll: { mass: 0.9, stiffness: 100, damping: 16 }, // lines container Y
    emphasis:   { mass: 0.6, stiffness: 170, damping: 14 }  // per-line ripple
  }
};

/* ------------------------------------------------------------------ */
/* tiny helpers                                                       */
/* ------------------------------------------------------------------ */
function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }

/* linear 0..1 -> "0%".."100%" for the --p CSS var */
function pct(x) {
  x = clamp(x, 0, 1);
  return (Math.round(x * 1000) / 10) + '%';
}

function addClass(el, c) { if (el.classList) { el.classList.add(c); } }
function removeClass(el, c) { if (el.classList) { el.classList.remove(c); } }
function toggleClass(el, c, on) {
  if (!el.classList) { return; }
  if (on) { el.classList.add(c); } else { el.classList.remove(c); }
}

function raf(cb) { return global.requestAnimationFrame(cb); }
function caf(id) { global.cancelAnimationFrame(id); }

/* ------------------------------------------------------------------ */
/* LyricsEngine.create                                                */
/* ------------------------------------------------------------------ */
function create(options) {
  options = options || {};
  var container = options.container;
  var clock = options.clock;
  var mode = options.mode === 'card' ? 'card' : 'full';
  var motion = options.motion !== false;
  var onOpenRequest = options.onOpenRequest;

  if (!container) { throw new Error('LyricsEngine.create: container is required'); }
  if (!clock) { throw new Error('LyricsEngine.create: clock is required'); }

  var isCard = (mode === 'card');

  /* ---- static DOM (built once here; lines are rebuilt per track) ---- */
  var root = document.createElement('div');
  root.className = 'lyrics-engine';
  root.setAttribute('data-mode', mode);
  root.setAttribute('data-motion', motion ? 'true' : 'false');
  root.setAttribute('data-blur', 'on');

  var bg = document.createElement('div');
  bg.className = 'lyrics-bg';          // P1 owns this (palette/WebGL); static for now

  var linesEl = document.createElement('div');
  linesEl.className = 'lyrics-lines';  // spring-driven translateY lives here

  root.appendChild(bg);
  root.appendChild(linesEl);
  container.appendChild(root);

  /* ---- instance state ---- */
  var lines = [];            // per-line records (cached node refs, measured metrics)
  var activeIndex = -1;      // line driving highlight/styling (HIGHLIGHT_LEAD applied)
  var scrollIndex = -1;      // line driving scroll target (SCROLL_LEAD applied)
  var offsetMs = 0;          // user sync offset from setOffset()
  var plain = false;         // level === "plain": static render, no rAF highlights
  var isOpen = false;
  var destroyed = false;
  var blurOn = true;         // false when motion=false or small screen

  var scrollSpring = Spring.create(Spring.presets.lineScroll);
  var rippleTimers = [];     // stagger timeouts; cleared => ripple is interruptible

  var rafId = 0;
  var lastT = 0;
  var running = false;
  var viewH = 0;

  /* ---------------- DOM build (once per track) ---------------- */
  function buildWord(w) {
    var span = document.createElement('span');
    span.className = 'lyrics-word';
    var dur = w.end - w.start;
    var rec = { el: span, start: w.start, end: w.end, letters: null };

    // Emphasis words (duration >= 1000ms AND 2-7 chars) get letter spans.
    // Letters wipe with per-letter stagger du/2.5/n (see setWordP).
    if (dur >= CONFIG.EMPHASIS_MIN_MS &&
        w.text.length >= CONFIG.EMPHASIS_MIN_CHARS &&
        w.text.length <= CONFIG.EMPHASIS_MAX_CHARS) {
      addClass(span, 'emphasis-word');
      var n = w.text.length;
      var stagger = dur / 2.5 / n;
      var subDur = dur - (n - 1) * stagger; // each letter's own wipe window
      var letters = [];
      for (var i = 0; i < n; i++) {
        var l = document.createElement('span');
        l.className = 'lyrics-letter';
        l.textContent = w.text.charAt(i);
        span.appendChild(l);
        letters.push({
          el: l,
          start: w.start + i * stagger,
          end: w.start + i * stagger + subDur
        });
      }
      rec.letters = letters;
    } else {
      span.textContent = w.text;
    }
    span.appendChild(document.createTextNode(' ')); // keep word spacing/wrapping
    return rec;
  }

  function buildLine(line, idx) {
    var lineEl = document.createElement('div');
    lineEl.className = 'lyrics-line';
    lineEl.setAttribute('data-i', String(idx));

    var yEl = document.createElement('div'); // per-line ripple translateY (spring)
    yEl.className = 'lyrics-line-y';
    lineEl.appendChild(yEl);

    var rec = {
      el: lineEl,
      yEl: yEl,
      ySpring: Spring.create(Spring.presets.emphasis),
      yLive: false,
      start: line.start,
      end: line.end,
      top: 0,      // measured in measure()
      height: 0,
      words: [],
      dots: null,  // interlude markers
      interlude: !!line.interlude
    };

    if (line.interlude) {
      addClass(lineEl, 'interlude-line');
      var dots = document.createElement('span');
      dots.className = 'lyrics-dots';
      var dotEls = [];
      for (var d = 0; d < 3; d++) {
        var dot = document.createElement('i');
        dots.appendChild(dot);
        dotEls.push(dot);
      }
      yEl.appendChild(dots);
      rec.dots = dotEls;
    } else if (plain) {
      yEl.textContent = line.text || '';
    } else {
      if (line.chorus) { addClass(lineEl, 'chorus'); } // P2 adds the bloom
      var words = line.words || [];
      for (var j = 0; j < words.length; j++) {
        var wrec = buildWord(words[j]);
        yEl.appendChild(wrec.el);
        rec.words.push(wrec);
      }
      // word-level timing missing but line has text: one static span, no wipe
      if (!rec.words.length && line.text) {
        var t = document.createElement('span');
        t.className = 'lyrics-word lyrics-word-static';
        t.textContent = line.text;
        yEl.appendChild(t);
      }
    }

    linesEl.appendChild(lineEl);
    return rec;
  }

  function setLyrics(data) {
    clearRipple();
    while (linesEl.firstChild) { linesEl.removeChild(linesEl.firstChild); }
    lines = [];
    activeIndex = -1;
    scrollIndex = -1;
    plain = !!(data && data.level === 'plain');
    toggleClass(root, 'is-plain', plain);

    if (data && data.lines && data.lines.length) {
      for (var i = 0; i < data.lines.length; i++) {
        lines.push(buildLine(data.lines[i], i));
      }
    }

    scrollSpring.snap(0);
    linesEl.style.transform = '';
    measure();
    updateBlurAttr();
    if (!plain && isOpen) { wake(); }
  }

  /* ---------------- measurement (never in the rAF loop) ---------------- */
  function measure() {
    // layout reads happen here only: build, resize, open, fonts.ready.
    viewH = root.clientHeight;
    for (var i = 0; i < lines.length; i++) {
      lines[i].top = lines[i].el.offsetTop; // offsetParent is .lyrics-lines (relative)
      lines[i].height = lines[i].el.offsetHeight;
    }
  }

  function updateBlurAttr() {
    // skip blur entirely when motion=false or on small screens
    blurOn = motion && global.innerWidth > CONFIG.SMALL_SCREEN_PX;
    root.setAttribute('data-blur', blurOn ? 'on' : 'off');
  }

  /* ---------------- active line ---------------- */
  // last line whose start <= t (binary search over cached starts)
  function findActive(t) {
    var lo = 0, hi = lines.length - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (lines[mid].start <= t) { ans = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }
    return ans;
  }

  function setWordP(w, t) {
    // linear-in-time wipe driven by clamp((t - start) / (end - start))
    if (w.letters) {
      for (var i = 0; i < w.letters.length; i++) {
        var lr = w.letters[i];
        lr.el.style.setProperty('--p', pct((t - lr.start) / (lr.end - lr.start)));
      }
    } else {
      w.el.style.setProperty('--p', pct((t - w.start) / (w.end - w.start)));
    }
  }

  function resetWord(w, past) {
    var v = past ? '100%' : '0%';
    if (w.letters) {
      for (var i = 0; i < w.letters.length; i++) {
        w.letters[i].el.style.setProperty('--p', v);
      }
    } else {
      w.el.style.setProperty('--p', v);
    }
    removeClass(w.el, 'is-past');
    removeClass(w.el, 'is-now');
  }

  function updateDots(rec, t) {
    // three dots fill in sequence across the interlude window via --p
    var p = clamp((t - rec.start) / (rec.end - rec.start), 0, 1);
    for (var i = 0; i < rec.dots.length; i++) {
      rec.dots[i].style.setProperty('--p', pct(p * 3 - i));
    }
  }

  function setActive(idx) {
    var prev = activeIndex;
    activeIndex = idx;
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      var on = (i === idx);
      var d = Math.abs(i - idx);
      if (on) { addClass(L.el, 'is-active'); }
      else { removeClass(L.el, 'is-active'); }

      if (!isCard) {
        // opacity by distance: 1.0 / 0.42 / 0.30 (motion path; reduced uses CSS)
        if (motion) { L.el.style.opacity = on ? '1' : (d === 1 ? String(CONFIG.OPACITY_NEAR) : String(CONFIG.OPACITY_FAR)); }
        // blur 0/1/2/3px capped at |d|<=3; skipped when data-blur="off"
        if (blurOn) { L.el.style.filter = on ? 'blur(0px)' : 'blur(' + Math.min(d, CONFIG.BLUR_MAX_PX) + 'px)'; }
        else { L.el.style.filter = ''; }
      }

      // reset wipe state for lines that aren't active (past => 100%, future => 0%)
      if (!on) {
        var past = i < idx;
        for (var j = 0; j < L.words.length; j++) { resetWord(L.words[j], past); }
        if (L.interlude && L.dots) {
          for (var k = 0; k < L.dots.length; k++) {
            L.dots[k].style.setProperty('--p', past ? '100%' : '0%');
          }
        }
      }
    }
    if (motion && !isCard && idx !== prev && idx >= 0) { ripple(idx, prev); }
  }

  /* ---------------- scroll ---------------- */
  function scrollTargetFor(idx) {
    if (idx < 0 || idx >= lines.length) { return 0; }
    var L = lines[idx];
    return -(L.top - viewH / 2 + L.height / 2);
  }

  /* ---------------- per-line ripple ---------------- */
  // Outward stagger from the active line: each line kicks RIPPLE_PX in the
  // scroll direction, then settles back to 0, delayed 35ms * distance.
  // Clearing rippleTimers mid-flight makes it fully interruptible.
  function clearRipple() {
    for (var i = 0; i < rippleTimers.length; i++) { global.clearTimeout(rippleTimers[i]); }
    rippleTimers = [];
    for (var j = 0; j < lines.length; j++) {
      lines[j].ySpring.snap(0);
      if (lines[j].yLive) { lines[j].yEl.style.transform = ''; lines[j].yLive = false; }
    }
  }

  function ripple(idx, prev) {
    clearRipple();
    var dir = (prev >= 0 && idx < prev) ? -1 : 1; // -1 = scrolling down/backwards
    var kick = dir * CONFIG.RIPPLE_PX;
    for (var i = 0; i < lines.length; i++) {
      scheduleRippleLine(lines[i], Math.abs(i - idx) * CONFIG.STAGGER_MS, kick);
    }
  }

  function scheduleRippleLine(L, delay, kick) {
    rippleTimers.push(global.setTimeout(function () {
      if (destroyed) { return; }
      L.ySpring.setTarget(kick);
    }, delay));
    rippleTimers.push(global.setTimeout(function () {
      if (destroyed) { return; }
      L.ySpring.setTarget(0);
    }, delay + CONFIG.RIPPLE_HOLD_MS));
  }

  /* ---------------- per-frame word updates ---------------- */
  function updateWords(t) {
    if (activeIndex < 0 || activeIndex >= lines.length) { return; }
    var L = lines[activeIndex];
    for (var j = 0; j < L.words.length; j++) {
      var w = L.words[j];
      if (motion) {
        setWordP(w, t);                       // --p wipe, linear in time
      } else {
        // reduced motion: discrete per-word color change (word data still used)
        toggleClass(w.el, 'is-past', t >= w.end);
        toggleClass(w.el, 'is-now', t >= w.start && t < w.end);
      }
    }
    if (L.interlude && L.dots) { updateDots(L, t); }
  }

  /* ---------------- the one rAF loop ---------------- */
  function tick(now) {
    rafId = 0;
    if (destroyed || !isOpen || document.hidden) { running = false; return; }

    var dt = Math.min(Math.max((now - lastT) / 1000, 0), CONFIG.MAX_DT);
    lastT = now;

    var t = clock.now() + offsetMs;
    var hT = t + CONFIG.HIGHLIGHT_LEAD_MS;   // highlight 40ms early
    var sT = t + CONFIG.SCROLL_LEAD_MS;      // scroll retargets 250ms early

    var hi = findActive(hT);
    if (hi !== activeIndex) { setActive(hi); }

    var live = false;

    if (!isCard && !plain) {
      var si = findActive(sT);
      if (si !== scrollIndex) {
        scrollIndex = si;
        if (motion) { scrollSpring.setTarget(scrollTargetFor(si)); }
        else { scrollSpring.snap(scrollTargetFor(si)); }  // reduced: scroll jumps
      }
      var sy = scrollSpring.step(dt);  // writes: transform only
      linesEl.style.transform = 'translate3d(0,' + sy.toFixed(2) + 'px,0)';
      if (!scrollSpring.isSettled()) { live = true; }

      for (var i = 0; i < lines.length; i++) {  // cached refs; no queries in loop
        var L = lines[i];
        var s = L.ySpring;
        if (s.isSettled()) {
          if (L.yLive) { L.yEl.style.transform = ''; L.yLive = false; }
          continue;
        }
        var y = s.step(dt);
        L.yEl.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
        L.yLive = true;
        live = true;
      }
    }

    updateWords(hT);  // writes: --p vars / discrete classes only

    // sleep when springs are settled AND the clock is paused
    if (live || clock.playing()) {
      rafId = raf(tick);
    } else {
      running = false;
    }
  }

  function allSettled() {
    if (!scrollSpring.isSettled()) { return false; }
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].ySpring.isSettled()) { return false; }
    }
    return true;
  }

  function wake() {
    if (destroyed || !isOpen || running || plain) { return; }
    if (typeof document !== 'undefined' && document.hidden) { return; }
    running = true;
    lastT = global.performance.now();
    rafId = raf(tick);
  }

  function kill() {
    if (rafId) { caf(rafId); }
    rafId = 0;
    running = false;
  }

  /* ---------------- clock events ---------------- */
  function onSeekEvent() {
    if (destroyed) { return; }
    clearRipple();
    var t = clock.now() + offsetMs;
    setActive(findActive(t + CONFIG.HIGHLIGHT_LEAD_MS));
    scrollIndex = findActive(t + CONFIG.SCROLL_LEAD_MS);
    scrollSpring.snap(scrollTargetFor(scrollIndex)); // seeks jump; velocity preserved otherwise
    linesEl.style.transform = 'translate3d(0,' + scrollSpring.get().toFixed(2) + 'px,0)';
    wake();
  }

  var unsubSeek = null;
  var unsubRate = null;
  if (clock.onSeek) {
    try { unsubSeek = clock.onSeek(onSeekEvent); } catch (e) { /* host may throw */ }
  }
  if (clock.onRate) {
    try { unsubRate = clock.onRate(function () { wake(); }); } catch (e) { /* host may throw */ }
  }

  /* ---------------- watchdog: wake when playback resumes ---------------- */
  // The clock has no onPlay callback, so a cheap interval re-arms the loop.
  var watchdog = global.setInterval(function () {
    if (destroyed || !isOpen || running || plain) { return; }
    if (typeof document !== 'undefined' && document.hidden) { return; }
    if (clock.playing() || !allSettled()) { wake(); }
  }, CONFIG.WATCHDOG_MS);

  /* ---------------- host events ---------------- */
  function onVisibility() {
    if (document.hidden) { kill(); }   // loop dies on hide...
    else { wake(); }                   // ...watchdog or this re-arms it
  }
  function onResize() {
    if (destroyed) { return; }
    measure();
    updateBlurAttr();
    if (!isCard && !plain) {
      // keep the scroll target glued to the active line after reflow
      if (motion) { scrollSpring.setTarget(scrollTargetFor(scrollIndex)); }
      else { scrollSpring.snap(scrollTargetFor(scrollIndex)); }
    }
  }
  function onFontsReady() {
    if (!destroyed) { measure(); }
  }

  document.addEventListener('visibilitychange', onVisibility);
  global.addEventListener('resize', onResize);
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(onFontsReady);
  }

  if (isCard) {
    // card mode: tap opens fullscreen via the host-provided callback
    root.addEventListener('click', function () {
      if (typeof onOpenRequest === 'function') { onOpenRequest(); }
    });
  }

  /* ---------------- public API ---------------- */
  return {
    setLyrics: setLyrics,

    open: function () {
      if (destroyed || isOpen) { return; }
      isOpen = true;
      addClass(root, 'is-open');
      measure();
      updateBlurAttr();
      if (!plain) { wake(); }
    },

    close: function () {
      if (!isOpen) { return; }
      isOpen = false;
      removeClass(root, 'is-open');
      clearRipple();
      kill();
    },

    destroy: function () {
      if (destroyed) { return; }
      destroyed = true;
      clearRipple();
      kill();
      global.clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onVisibility);
      global.removeEventListener('resize', onResize);
      if (typeof unsubSeek === 'function') { try { unsubSeek(); } catch (e) {} }
      if (typeof unsubRate === 'function') { try { unsubRate(); } catch (e) {} }
      if (root.parentNode) { root.parentNode.removeChild(root); }
      lines = [];
    },

    setOffset: function (ms) {
      offsetMs = Number(ms) || 0;
      wake();
    }
  };
}

/* ------------------------------------------------------------------ */
global.LyricsEngine = {
  create: create,
  Spring: Spring,
  CONFIG: CONFIG,
  VERSION: '0.1.0'
};

})(typeof window !== 'undefined' ? window : this);
