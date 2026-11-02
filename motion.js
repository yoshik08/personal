/* ============================================================
   yoshik v5 — motion layer (anime.js 4)
   choreography, in order of appearance:
     intro      topbar drops, wordmark letters rise through masks (stagger),
                avatar springs in, hero lines follow
     scroll     section titles + rules, staggered rows/cards, meter bars +
                counters, word-by-word about text, contact letters
     interact   cursor (animatable), magnetic buttons, card tilt, row nudge,
                nav indicator, accordion, role roller, marquee
   rules: only transform/opacity are tweened (accordion height excepted),
   everything starts after first paint, nothing blocks content, all of it
   stands down for data-motion="off" / prefers-reduced-motion, and if this
   file never boots the head script un-hides the page after 4s.
   ============================================================ */
(function () {
  "use strict";
  var A = window.anime;
  var root = document.documentElement;
  if (!A) return;
  var animate = A.animate, stagger = A.stagger, utils = A.utils, createAnimatable = A.createAnimatable;

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var motionOK = function () { return root.getAttribute("data-motion") !== "off"; };
  var finePointer = window.matchMedia("(pointer: fine)").matches;
  var bootedMo = root.classList.contains("mo");
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  /* ---------- helpers ---------- */
  function splitChars(el) {
    var txt = el.textContent;
    el.setAttribute("aria-label", txt);
    el.textContent = "";
    var out = [];
    Array.from(txt).forEach(function (ch) {
      if (ch === " ") { el.appendChild(document.createTextNode(" ")); return; }
      var s = document.createElement("span");
      s.className = "ch"; s.setAttribute("aria-hidden", "true"); s.textContent = ch;
      el.appendChild(s); out.push(s);
    });
    return out;
  }
  function splitWords(el) {
    var txt = el.textContent.trim();
    el.setAttribute("aria-label", txt);
    el.textContent = "";
    return txt.split(/\s+/).map(function (w, i, arr) {
      var s = document.createElement("span");
      s.className = "w"; s.setAttribute("aria-hidden", "true"); s.textContent = w;
      el.appendChild(s);
      if (i < arr.length - 1) el.appendChild(document.createTextNode(" "));
      return s;
    });
  }
  /* final state, no animation (reduced motion / motion toggled off) */
  function settle(els, props) { if (els.length || els.nodeType) utils.set(els, props); }

  /* ---------- 1. scroll progress ---------- */
  var pfill = $("#progressFill");
  var progTick = false;
  function updateProgress() {
    progTick = false;
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    pfill.style.transform = "scaleX(" + (max > 0 ? clamp(h.scrollTop / max, 0, 1) : 0).toFixed(4) + ")";
  }
  /* ---------- 2. about text: words light up as you scroll past ---------- */
  var proseEl = $("#aboutProse p");
  var proseWords = proseEl ? splitWords(proseEl) : [];
  var proseNear = false;
  function scrubProse() {
    if (!proseEl || !proseNear || !motionOK()) return;
    var r = proseEl.getBoundingClientRect();
    var vh = window.innerHeight;
    var p = clamp((vh * 0.86 - r.top) / (r.height + vh * 0.32), 0, 1);
    var lit = p * proseWords.length;
    for (var i = 0; i < proseWords.length; i++) {
      var o = clamp(lit - i, 0, 1);
      proseWords[i].style.opacity = (0.2 + o * 0.8).toFixed(3);
    }
  }
  function onScroll() {
    if (!progTick) { progTick = true; requestAnimationFrame(function () { updateProgress(); scrubProse(); }); }
  }
  document.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  updateProgress();

  /* ---------- 3. section titles, meters, contact: prepared once ---------- */
  var titles = $$("[data-h2]").map(function (h) {
    return { el: h, rule: $(".sec-rule", h), no: $(".sec-no", h), chars: splitChars($(".sec-title", h)) };
  });
  var contactBig = $("#contactBig");
  var contactLines = contactBig ? $$(".ln", contactBig) : [];
  var contactChars = [];
  contactLines.forEach(function (ln) { contactChars = contactChars.concat(splitChars(ln)); });

  var meters = $$(".meters li").map(function (li) {
    var bar = $(".bar i", li);
    var label = $("span", li);
    var v = parseFloat((bar.getAttribute("style") || "").replace(/.*--v:\s*([\d.]+)%.*/, "$1")) || 0;
    bar.style.setProperty("--s", (v / 100).toFixed(3));
    var pct = document.createElement("em");
    pct.className = "pct"; pct.textContent = v + "%";
    label.appendChild(pct);
    return { bar: bar, pct: pct, v: v };
  });

  /* ---------- 4. reveal engine (one IntersectionObserver for everything) ---------- */
  var handlers = new WeakMap();
  function on(el, fn) { handlers.set(el, fn); }

  $$("[data-reveal]").forEach(function (el) {
    on(el, function () {
      var kids = el.hasAttribute("data-stagger") ? $$(":scope > *", el) : [el];
      if (!motionOK()) { settle(kids, { opacity: 1, y: 0 }); el.classList.add("in"); return; }
      utils.set(kids, { opacity: 0, y: 30 });
      el.classList.add("in");
      animate(kids, { opacity: 1, y: 0, duration: 900, delay: stagger(70), ease: "outExpo" });
    });
  });

  titles.forEach(function (t) {
    on(t.el, function () {
      if (!motionOK()) { settle(t.chars, { y: 0 }); settle(t.rule, { scaleX: 1 }); return; }
      animate(t.rule, { scaleX: [0, 1], duration: 900, ease: "outExpo" });
      animate(t.chars, { y: ["110%", "0%"], duration: 800, delay: stagger(32, { start: 120 }), ease: "outExpo" });
    });
  });

  meters.forEach(function (m) {
    on(m.bar.parentNode, function () {
      m.bar.classList.add("done");
      if (!motionOK()) { settle(m.bar, { scaleX: m.v / 100 }); return; }
      animate(m.bar, { scaleX: [0, m.v / 100], duration: 1400, delay: 150, ease: "outExpo" });
      var o = { n: 0 };
      animate(o, { n: m.v, duration: 1400, delay: 150, ease: "outExpo",
        onUpdate: function () { m.pct.textContent = Math.round(o.n) + "%"; },
        onComplete: function () { m.pct.textContent = m.v + "%"; } });
    });
  });

  if (contactBig) {
    on(contactBig, function () {
      if (!motionOK()) { settle(contactChars, { y: 0 }); return; }
      animate(contactChars, { y: ["110%", "0%"], duration: 1000, delay: stagger(24), ease: "outExpo" });
    });
  }

  if (proseEl) {
    var proseIO = new IntersectionObserver(function (es) { proseNear = es[0].isIntersecting; scrubProse(); },
      { rootMargin: "20% 0px 20% 0px" });
    proseIO.observe(proseEl);
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      var fn = handlers.get(en.target);
      if (fn) fn();
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  $$("[data-reveal]").concat(titles.map(function (t) { return t.el; }), meters.map(function (m) { return m.bar.parentNode; }), contactBig ? [contactBig] : [])
    .forEach(function (el) { io.observe(el); });

  /* ---------- 5. accordion (height + staggered content) ---------- */
  var rows = $$(".row");
  function closeRow(row, instant) {
    var d = $(".row-detail", row), b = $(".row-top", row);
    if (!d.classList.contains("open")) return;
    b.setAttribute("aria-expanded", "false");
    if (instant || !motionOK()) { d.classList.remove("open"); d.style.height = ""; return; }
    var h = d.offsetHeight;
    d.style.height = h + "px";
    animate(d, { height: [h + "px", "0px"], duration: 480, ease: "inOutQuart",
      onComplete: function () { d.classList.remove("open"); d.style.height = ""; } });
  }
  function openRow(row) {
    var d = $(".row-detail", row), b = $(".row-top", row);
    b.setAttribute("aria-expanded", "true");
    d.classList.add("open");
    if (!motionOK()) return;
    d.style.height = "auto";
    var target = d.offsetHeight;
    var kids = $$(".row-detail-in > *", d);
    utils.set(kids, { opacity: 0, y: 14 });
    d.style.height = "0px";
    animate(d, { height: ["0px", target + "px"], duration: 700, ease: "outExpo",
      onComplete: function () { d.style.height = ""; } });
    animate(kids, { opacity: 1, y: 0, duration: 700, delay: stagger(70, { start: 140 }), ease: "outQuart" });
  }
  rows.forEach(function (row) {
    $(".row-top", row).addEventListener("click", function () {
      var isOpen = $(".row-detail", row).classList.contains("open");
      rows.forEach(function (r) { if (r !== row) closeRow(r); });
      if (isOpen) closeRow(row); else openRow(row);
    });
  });

  /* ---------- 6. micro-interactions (fine pointers) ---------- */
  if (finePointer) {
    /* cursor: two animatables with different inertia */
    var dot = $(".cursor-dot"), ring = $(".cursor-ring");
    if (dot && ring) {
      var dotA = createAnimatable(dot, { x: 90, y: 90, ease: "out(2)" });
      var ringA = createAnimatable(ring, { x: 520, y: 520, ease: "out(3)" });
      document.addEventListener("mousemove", function (e) {
        dotA.x(e.clientX).y(e.clientY);
        ringA.x(e.clientX).y(e.clientY);
      }, { passive: true });
      document.addEventListener("mousedown", function () {
        if (!motionOK()) return;
        animate(ring, { scale: [1.5, 1], duration: 500, ease: "outExpo" });
      });
      document.addEventListener("pointerover", function (e) {
        var t = e.target.closest && e.target.closest("a, button, [data-hover], .magnetic");
        document.body.classList.toggle("link-hover", !!t);
      });
      document.addEventListener("mouseleave", function () { document.body.classList.remove("link-hover"); });
    }

    /* magnetic pull + press */
    $$(".socials a, .foot-socials a, .sp-glyph-link, .pill-btn").forEach(function (el) { el.classList.add("magnetic"); });
    $$(".magnetic").forEach(function (el) {
      var R = 90;
      el.addEventListener("pointermove", function (e) {
        if (!motionOK()) return;
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        var f = clamp(1 - Math.hypot(dx, dy) / (R + r.width / 2), 0, 1);
        animate(el, { x: dx * f * 0.35, y: dy * f * 0.35, duration: 320, ease: "out(3)" });
      });
      el.addEventListener("pointerenter", function () { if (motionOK()) animate(el, { scale: 1.07, duration: 400, ease: "outBack(2)" }); });
      el.addEventListener("pointerdown", function () { if (motionOK()) animate(el, { scale: 0.92, duration: 140, ease: "out(2)" }); });
      el.addEventListener("pointerup", function () { if (motionOK()) animate(el, { scale: 1.07, duration: 500, ease: "outElastic(1, .5)" }); });
      el.addEventListener("pointerleave", function () {
        if (motionOK()) animate(el, { x: 0, y: 0, scale: 1, duration: 900, ease: "outElastic(1, .45)" });
        else settle(el, { x: 0, y: 0, scale: 1 });
      });
    });

    /* card tilt */
    $$(".tilt").forEach(function (card) {
      var glare = $(".glare", card);
      card.addEventListener("pointermove", function (e) {
        if (!motionOK()) return;
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        animate(card, { rotateX: (0.5 - py) * 8, rotateY: (px - 0.5) * 10, duration: 260, ease: "out(2)" });
        if (glare) { glare.style.setProperty("--gx", px * 100 + "%"); glare.style.setProperty("--gy", py * 100 + "%"); }
      });
      card.addEventListener("pointerleave", function () {
        animate(card, { rotateX: 0, rotateY: 0, duration: 1000, ease: "outElastic(1, .55)" });
      });
    });

    /* project rows: name nudges with a spring */
    rows.forEach(function (row) {
      var name = $(".row-name", row);
      row.addEventListener("pointerenter", function () { if (motionOK()) animate(name, { x: 16, duration: 700, ease: "outElastic(1, .6)" }); });
      row.addEventListener("pointerleave", function () { animate(name, { x: 0, duration: 600, ease: "outExpo" }); });
    });

    /* wordmark letters: springy hover */
    $$(".wm-ch").forEach(function (ch) {
      ch.addEventListener("pointerenter", function () {
        if (!motionOK() || !root.classList.contains("intro-done")) return;
        animate(ch, { y: ["0%", "-7%", "0%"], rotate: [0, -4, 0], duration: 900, ease: "outElastic(1, .5)" });
      });
    });

    /* contact headline: letter wave */
    if (contactBig) {
      var waving = false;
      contactBig.addEventListener("pointerenter", function () {
        if (waving || !motionOK()) return;
        waving = true;
        contactLines.forEach(function (ln) { ln.style.overflow = "visible"; });
        animate(contactChars, { y: ["0%", "-12%", "0%"], duration: 800, delay: stagger(22), ease: "out(3)",
          onComplete: function () { waving = false; } });
      });
    }
  }

  /* ---------- 7. nav: sliding indicator + scrollspy ---------- */
  var nav = $("#nav"), ind = nav && $(".nav-ind", nav);
  var navLinks = nav ? $$(".nav > a, .nav-drop > a", nav) : [];
  var activeLink = null, indShown = false;
  function moveInd(a, instant) {
    if (!ind) return;
    if (!a) { animate(ind, { opacity: 0, duration: 250, ease: "outQuad" }); indShown = false; return; }
    var nr = nav.getBoundingClientRect(), r = a.getBoundingClientRect();
    var props = { x: r.left - nr.left, width: r.width, opacity: 1 };
    if (instant || !indShown || !motionOK()) { utils.set(ind, props); }
    else animate(ind, Object.assign({ duration: 600, ease: "outExpo" }, props));
    indShown = true;
  }
  navLinks.forEach(function (a) {
    a.addEventListener("pointerenter", function () { moveInd(a); });
  });
  if (nav) nav.addEventListener("pointerleave", function () { moveInd(activeLink); });
  var spy = new IntersectionObserver(function (es) {
    es.forEach(function (en) {
      if (!en.isIntersecting) return;
      var a = navLinks.filter(function (l) { return l.getAttribute("href") === "#" + en.target.id; })[0] || null;
      navLinks.forEach(function (l) { l.classList.toggle("active", l === a); });
      activeLink = a; moveInd(a);
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  $$("main section[id]").forEach(function (s) { spy.observe(s); });
  window.addEventListener("resize", function () { moveInd(activeLink, true); });

  /* ---------- 8. role roller ---------- */
  var roles = ["full-stack developer", "ml engineer", "android developer", "backend engineer"];
  var typed = $("#typed"), ri = 0, rollTimer = null;
  function roll() {
    clearTimeout(rollTimer);
    if (!motionOK() || document.hidden) { rollTimer = setTimeout(roll, 2200); return; }
    animate(typed, { y: ["0%", "-110%"], opacity: [1, 0], duration: 420, ease: "inExpo",
      onComplete: function () {
        ri = (ri + 1) % roles.length;
        typed.textContent = roles[ri];
        animate(typed, { y: ["110%", "0%"], opacity: [0, 1], duration: 700, ease: "outExpo" });
        rollTimer = setTimeout(roll, 2400);
      } });
  }

  /* ---------- 9. marquee ---------- */
  var track = $("#marqueeTrack"), marquee = null;
  if (track) {
    var base = Array.prototype.slice.call(track.children);
    for (var k = 0; k < 2; k++) base.forEach(function (n) { track.appendChild(n.cloneNode(true)); }); /* 3 sets: -33.333% loops seamlessly */
    marquee = animate(track, { x: ["0%", "-33.3333%"], duration: 42000, ease: "linear", loop: true, autoplay: false });
    var mio = new IntersectionObserver(function (es) {
      if (!motionOK()) { marquee.pause(); return; }
      es[0].isIntersecting ? marquee.play() : marquee.pause();
    });
    mio.observe(track.parentNode);
    track.parentNode.addEventListener("pointerenter", function () { marquee.speed = 0.25; });
    track.parentNode.addEventListener("pointerleave", function () { marquee.speed = 1; });
  }

  /* ---------- 10. live clock (hyderabad) ---------- */
  var clock = $("#clock");
  if (clock && window.Intl) {
    var fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
    var tickClock = function () { clock.textContent = fmt.format(new Date()) + " ist"; };
    tickClock(); setInterval(tickClock, 20000);
  }

  /* ---------- 11. intro ---------- */
  var topbar = $(".topbar");
  var chars = $$(".wm-ch");
  var avatar = $(".avatar");
  var introEls = $$("[data-intro]");
  function finishIntro() {
    root.classList.add("intro-done");
    rollTimer = setTimeout(roll, 1800);
  }
  function intro() {
    if (!bootedMo || !motionOK()) { root.classList.add("ready", "intro-done"); finishIntro(); return; }
    utils.set(introEls, { opacity: 0, y: 20 });
    utils.set(topbar, { opacity: 0, y: -28 });
    utils.set(chars, { y: "118%", rotate: 7, opacity: 0 });
    utils.set(avatar, { opacity: 0, scale: 0.4, rotate: -40 });
    root.classList.add("ready");
    var tl = A.createTimeline({ defaults: { ease: "outExpo" }, onComplete: finishIntro });
    tl.add(topbar, { opacity: 1, y: 0, duration: 800 }, 0)
      .add(chars, { y: "0%", rotate: 0, opacity: 1, duration: 1250, delay: stagger(70) }, 120)
      .add(avatar, { opacity: 1, scale: 1, rotate: 0, duration: 1100, ease: "outBack(2.4)" }, 650)
      .add(introEls, { opacity: 1, y: 0, duration: 900, delay: stagger(85), ease: "outQuart" }, 700);
  }
  /* start after first paint; if we arrived through the page curtain wait for it to lift */
  var arriving = root.classList.contains("arrive");
  requestAnimationFrame(function () { setTimeout(intro, arriving ? 380 : 40); });

  /* ---------- 12. motion toggle (called from script.js) ---------- */
  window.ykMotionChanged = function () {
    if (!motionOK()) {
      root.classList.remove("mo", "arrive");
      proseWords.forEach(function (w) { w.style.opacity = ""; });
      if (marquee) marquee.pause();
      clearTimeout(rollTimer);
      typed.textContent = roles[0]; settle(typed, { y: "0%", opacity: 1 });
    } else {
      if (bootedMo) root.classList.add("mo");
      if (marquee) marquee.play();
      rollTimer = setTimeout(roll, 1200);
      scrubProse();
    }
  };

  /* booted */
  if (bootedMo) window.__moReady = true;
})();
