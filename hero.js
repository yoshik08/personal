/* ============================================================
   hero.js — the wordmark is ~4,000 square pixels.
   they start as dust, an anime.js timeline releases them left-to-right,
   springs pull each one home, and the pointer pushes them around
   (repulsion + swirl; a click sends a shockwave). touch gets a slow
   ghost cursor so the wordmark is alive without a mouse.
   - reduced motion / data-motion=off: drawn once, assembled, no loop
   - paused when off-screen or the tab is hidden
   - the real <h1> stays in the DOM (visually hidden once the canvas works)
   ============================================================ */
(function () {
  "use strict";
  var root = document.documentElement;
  var A = window.anime;
  var hero = document.getElementById("hero");
  var canvas = document.getElementById("heroCanvas");
  var coordsEl = document.getElementById("coords");
  if (!hero || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d");
  var motionOK = function () { return root.getAttribute("data-motion") !== "off"; };
  var fine = matchMedia("(pointer: fine)").matches;

  var W = 0, H = 0, dpr = 1, N = 0, step = 8, size = 6, fs = 200;
  var X, Y, VX, VY, TX, TY, DL;                    // typed arrays, one slot per pixel
  var ink = "#f0eee8", hot = "#d2ff3a";
  var assemble = { t: 0 };                         // 0 -> ~1.3, released by anime.js
  var ptr = { x: -9999, y: -9999, vx: 0, vy: 0, seen: 0 };
  var shocks = [];
  var visible = true, raf = 0, lastT = 0, built = false, bornAt = 0, coordsDirty = false;

  function readColors() {
    var cs = getComputedStyle(root);
    ink = cs.getPropertyValue("--ink").trim() || ink;
    hot = cs.getPropertyValue("--accent").trim() || hot;
  }

  function build() {
    var r = hero.getBoundingClientRect();
    W = Math.max(320, Math.round(r.width)); H = Math.max(360, Math.round(r.height));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* rasterise the word with the real font, then sample it on a grid */
    var off = document.createElement("canvas");
    off.width = W; off.height = H;
    var o = off.getContext("2d", { willReadFrequently: true });
    var fam = '"Bricolage Grotesque", system-ui, sans-serif', text = "yoshik";
    o.font = "800 200px " + fam;
    var tw = o.measureText(text).width || 600;
    fs = Math.min(200 * (W * 0.9 / tw), H * 0.5);
    o.font = "800 " + fs + "px " + fam;
    o.textAlign = "center"; o.textBaseline = "alphabetic"; o.fillStyle = "#000";
    var baseY = H * 0.46 + fs * 0.3;
    o.fillText(text, W / 2, baseY);
    var data = o.getImageData(0, 0, W, H).data;

    step = Math.max(4, Math.round(fs / 52));
    size = Math.max(2.4, step * 0.74);
    var xs = [], ys = [];
    for (var y = 0; y < H; y += step) {
      for (var x = 0; x < W; x += step) {
        if (data[((y + (step >> 1)) * W + x + (step >> 1)) * 4 + 3] > 120) { xs.push(x + step / 2); ys.push(y + step / 2); }
      }
    }
    N = xs.length;
    X = new Float32Array(N); Y = new Float32Array(N); VX = new Float32Array(N); VY = new Float32Array(N);
    TX = new Float32Array(N); TY = new Float32Array(N); DL = new Float32Array(N);
    for (var i = 0; i < N; i++) {
      TX[i] = xs[i]; TY[i] = ys[i];
      DL[i] = (xs[i] / W) * 0.8 + Math.random() * 0.35;
      /* dust: spread over the whole field */
      X[i] = Math.random() * W; Y[i] = Math.random() * H; VX[i] = VY[i] = 0;
    }
    built = true;
    readColors();
    root.classList.add("hero-canvas");
  }

  function settleAll() { for (var i = 0; i < N; i++) { X[i] = TX[i]; Y[i] = TY[i]; VX[i] = VY[i] = 0; } }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var s = size, h = s / 2, i, moving = 0;
    /* pass 1: resting pixels in ink; pass 2: fast ones in the accent */
    ctx.fillStyle = ink; ctx.globalAlpha = 1;
    ctx.beginPath();
    for (i = 0; i < N; i++) {
      var sp = VX[i] * VX[i] + VY[i] * VY[i];
      if (sp > 1.4) { moving++; continue; }
      ctx.rect(X[i] - h, Y[i] - h, s, s);
    }
    ctx.fill();
    if (moving) {
      ctx.fillStyle = hot;
      ctx.beginPath();
      for (i = 0; i < N; i++) {
        if (VX[i] * VX[i] + VY[i] * VY[i] > 1.4) ctx.rect(X[i] - h, Y[i] - h, s, s);
      }
      ctx.fill();
    }
  }

  function frame(now) {
    raf = 0;
    if (!built || !visible || document.hidden || !motionOK()) return;
    var dt = Math.min(now - (lastT || now), 50); lastT = now;
    var k = dt / 16.67, t = now / 1000;
    var released = assemble.t, i;

    /* idle ghost cursor so touch screens (and idle desktops) still get motion */
    var gx = -9999, gy = -9999;
    if (now - ptr.seen > 2600) {
      gx = (Math.sin(t * 0.33) * 0.5 + 0.5) * W; gy = H * 0.46 + Math.sin(t * 0.8) * fs * 0.22;
    }
    var R = Math.max(70, fs * 0.36), R2 = R * R, F = 1.15;
    var pvx = ptr.vx, pvy = ptr.vy;
    ptr.vx *= 0.85; ptr.vy *= 0.85;

    for (i = 0; i < N; i++) {
      var x = X[i], y = Y[i], ax = 0, ay = 0;
      if (released >= DL[i]) {
        ax = (TX[i] - x) * 0.085; ay = (TY[i] - y) * 0.085;
        /* breathing */
        ay += Math.sin(t * 1.4 + TX[i] * 0.018) * 0.012;
      } else {
        ax = Math.sin(t * 0.9 + i) * 0.03; ay = Math.cos(t * 0.8 + i * 1.3) * 0.03;
      }
      /* pointer: push away + drag along its velocity */
      var dx = x - ptr.x, dy = y - ptr.y, d2 = dx * dx + dy * dy;
      if (d2 < R2) {
        var d = Math.sqrt(d2) || 1, f = (1 - d / R);
        f = f * f * F * 3.2;
        ax += dx / d * f; ay += dy / d * f;
        ax += pvx * f * 0.05; ay += pvy * f * 0.05;
      }
      if (gx > -9000) {
        dx = x - gx; dy = y - gy; d2 = dx * dx + dy * dy;
        if (d2 < R2) { var gd = Math.sqrt(d2) || 1, gf = (1 - gd / R); ax += dx / gd * gf * gf * 1.6; ay += dy / gd * gf * gf * 1.6; }
      }
      /* shockwaves: a ring that shoves whatever it passes */
      for (var s = 0; s < shocks.length; s++) {
        var sw = shocks[s]; dx = x - sw.x; dy = y - sw.y;
        var dd = Math.sqrt(dx * dx + dy * dy) || 1, band = Math.abs(dd - sw.r);
        if (band < 46) { var sf = (1 - band / 46) * sw.life * 5.5; ax += dx / dd * sf; ay += dy / dd * sf; }
      }
      VX[i] = (VX[i] + ax * k) * 0.84; VY[i] = (VY[i] + ay * k) * 0.84;
      X[i] = x + VX[i] * k; Y[i] = y + VY[i] * k;
    }
    for (var q = shocks.length - 1; q >= 0; q--) { shocks[q].r += 15 * k; shocks[q].life -= 0.022 * k; if (shocks[q].life <= 0) shocks.splice(q, 1); }

    draw(t);
    if (coordsDirty && coordsEl) {
      coordsDirty = false;
      coordsEl.textContent = "x " + String(Math.max(0, Math.round(ptr.x))).padStart(4, "0") + " · y " + String(Math.max(0, Math.round(ptr.y))).padStart(4, "0");
    }
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && built && visible && !document.hidden && motionOK()) { lastT = 0; raf = requestAnimationFrame(frame); } }

  /* ---------- pointer ---------- */
  hero.addEventListener("pointermove", function (e) {
    var r = hero.getBoundingClientRect(), nx = e.clientX - r.left, ny = e.clientY - r.top;
    ptr.vx = (nx - ptr.x) * 0.9; ptr.vy = (ny - ptr.y) * 0.9;
    if (ptr.x < -9000) { ptr.vx = ptr.vy = 0; }
    ptr.x = nx; ptr.y = ny; ptr.seen = performance.now(); coordsDirty = true;
    kick();
  }, { passive: true });
  hero.addEventListener("pointerleave", function () { ptr.x = ptr.y = -9999; ptr.seen = 0; });
  hero.addEventListener("pointerdown", function (e) {
    if (!motionOK()) return;
    var r = hero.getBoundingClientRect();
    shocks.push({ x: e.clientX - r.left, y: e.clientY - r.top, r: 0, life: 1 });
    kick();
  }, { passive: true });

  /* ---------- lifecycle ---------- */
  function start() {
    build();
    if (!motionOK() || !A) { settleAll(); draw(0); return; }
    var arriving = root.classList.contains("arrive");
    assemble.t = 0;
    setTimeout(function () {
      A.animate(assemble, { t: [0, 1.4], duration: 2600, ease: "inOutSine" });
      kick();
    }, arriving ? 420 : 80);
    kick();
  }
  function rebuild() {
    if (!built) return;
    var wasT = assemble.t;
    build();
    if (!motionOK()) { settleAll(); draw(0); return; }
    /* a resize should not replay the intro: everything snaps home, then spring-settles */
    assemble.t = Math.max(wasT, 1.5);
    for (var i = 0; i < N; i++) { X[i] = TX[i]; Y[i] = TY[i]; }
    kick();
  }
  var rzT = 0;
  window.addEventListener("resize", function () { clearTimeout(rzT); rzT = setTimeout(rebuild, 160); });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }).observe(hero);
  }
  document.addEventListener("visibilitychange", kick);
  /* theme flips recolour the pixels */
  new MutationObserver(function () { readColors(); if (!raf && built) draw(0); }).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  /* motion toggle */
  window.ykHeroMotion = function () {
    if (!built) return;
    if (motionOK()) { assemble.t = Math.max(assemble.t, 1.5); kick(); }
    else { settleAll(); draw(0); }
  };

  /* wait for the display font so the sampled shape is the real one */
  var go = function () { try { start(); } catch (e) { root.classList.remove("hero-canvas"); } };
  if (document.fonts && document.fonts.load) {
    var done = false, fin = function () { if (!done) { done = true; go(); } };
    document.fonts.load('800 120px "Bricolage Grotesque"', "yoshik").then(fin, fin);
    setTimeout(fin, 2500);
  } else go();
})();
