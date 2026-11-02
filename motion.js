/* ============================================================
   yoshik v6 — motion layer (anime.js 4). the particle hero is hero.js.
     intro      brand + dock + viewfinder corners settle in after first paint
     scroll     section rules draw, titles rise, rows/cards stagger, about text
                lights word by word, dot plots slide + count, contact letters rise
     interact   cursor, magnetic buttons, project names breathe on their
                variable-font axes, a generative cover trails the pointer over
                the work list, dock pill follows hover + scroll, accordion,
                role roller, two marquees
   rules: transform/opacity (plus font axes + one accordion height),
   nothing blocks content, everything stands down for data-motion="off",
   and the head script un-hides the page if this file never boots.
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
  function settle(els, props) { if (els && (els.length || els.nodeType)) utils.set(els, props); }

  /* ---------- 1. scroll: progress bar + about text scrub ---------- */
  var pfill = $("#progressFill");
  var lead = $("#aboutProse .lead");
  var leadWords = lead ? splitWords(lead) : [];
  var leadNear = false, ticking = false;
  function scrubLead() {
    if (!lead || !leadNear || !motionOK()) return;
    var r = lead.getBoundingClientRect(), vh = window.innerHeight;
    var p = clamp((vh * 0.88 - r.top) / (r.height + vh * 0.3), 0, 1);
    var lit = p * leadWords.length;
    for (var i = 0; i < leadWords.length; i++) leadWords[i].style.opacity = (0.16 + clamp(lit - i, 0, 1) * 0.84).toFixed(3);
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var h = document.documentElement, max = h.scrollHeight - h.clientHeight;
      pfill.style.transform = "scaleX(" + (max > 0 ? clamp(h.scrollTop / max, 0, 1) : 0).toFixed(4) + ")";
      scrubLead();
    });
  }
  document.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();
  if (lead) new IntersectionObserver(function (es) { leadNear = es[0].isIntersecting; scrubLead(); }, { rootMargin: "25% 0px 25% 0px" }).observe(lead);

  /* ---------- 2. prepare the things that reveal ---------- */
  var heads = $$("[data-h2]").map(function (h) {
    var line = document.createElement("i"); line.className = "sec-line"; line.setAttribute("aria-hidden", "true"); h.appendChild(line);
    return { el: h, line: line, chars: splitChars($(".sec-title", h)) };
  });
  var contactBig = $("#contactBig");
  var contactLines = contactBig ? $$(".ln", contactBig) : [];
  var contactChars = [];
  contactLines.forEach(function (ln) { contactChars = contactChars.concat(splitChars(ln)); });
  var meters = $$(".meters li").map(function (li) {
    var bar = $(".bar i", li), label = $("span", li);
    var v = parseFloat((bar.getAttribute("style") || "").replace(/.*--v:\s*([\d.]+)%.*/, "$1")) || 0;
    var pct = document.createElement("em"); pct.className = "pct"; pct.textContent = v + "%"; label.appendChild(pct);
    return { li: li, bar: bar, pct: pct, v: v };
  });

  /* ---------- 3. reveal engine (one observer) ---------- */
  var handlers = new WeakMap();
  var on = function (el, fn) { handlers.set(el, fn); };

  $$("[data-reveal]").forEach(function (el) {
    on(el, function () {
      var kids = el.hasAttribute("data-stagger") ? $$(":scope > *", el) : [el];
      if (!motionOK()) { settle(kids, { opacity: 1, y: 0 }); el.classList.add("in"); return; }
      utils.set(kids, { opacity: 0, y: 40 });
      el.classList.add("in");
      animate(kids, { opacity: 1, y: 0, duration: 1000, delay: stagger(65), ease: "outExpo" });
    });
  });
  heads.forEach(function (h) {
    on(h.el, function () {
      if (!motionOK()) { settle(h.chars, { y: "0%" }); settle(h.line, { scaleX: 1 }); return; }
      animate(h.line, { scaleX: [0, 1], duration: 1300, ease: "inOutExpo" });
      animate(h.chars, { y: ["110%", "0%"], duration: 900, delay: stagger(28, { start: 180 }), ease: "outExpo" });
    });
  });
  meters.forEach(function (m) {
    on(m.li, function () {
      m.bar.classList.add("done");
      if (!motionOK()) { m.bar.style.width = m.v + "%"; return; }
      var delay = 120 + meters.indexOf(m) % 5 * 70;
      animate(m.bar, { width: ["0%", m.v + "%"], duration: 1500, delay: delay, ease: "outExpo" });
      var o = { n: 0 };
      animate(o, { n: m.v, duration: 1500, delay: delay, ease: "outExpo",
        onUpdate: function () { m.pct.textContent = Math.round(o.n) + "%"; },
        onComplete: function () { m.pct.textContent = m.v + "%"; } });
    });
  });
  if (contactBig) on(contactBig, function () {
    if (!motionOK()) { settle(contactChars, { y: "0%" }); return; }
    animate(contactChars, { y: ["110%", "0%"], duration: 1100, delay: stagger(22), ease: "outExpo" });
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      var fn = handlers.get(en.target); if (fn) fn();
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  $$("[data-reveal]").concat(heads.map(function (h) { return h.el; }), meters.map(function (m) { return m.li; }), contactBig ? [contactBig] : [])
    .forEach(function (el) { io.observe(el); });

  /* ---------- 4. accordion ---------- */
  var rows = $$(".row");
  rows.forEach(function (r) { if ($(".row-detail", r).classList.contains("open")) r.classList.add("is-open"); });
  function closeRow(row) {
    var d = $(".row-detail", row);
    if (!d.classList.contains("open")) return;
    $(".row-top", row).setAttribute("aria-expanded", "false");
    row.classList.remove("is-open");
    if (!motionOK()) { d.classList.remove("open"); d.style.height = ""; return; }
    var h = d.offsetHeight;
    d.style.height = h + "px";
    animate(d, { height: [h + "px", "0px"], duration: 520, ease: "inOutQuart",
      onComplete: function () { d.classList.remove("open"); d.style.height = ""; } });
  }
  function openRow(row) {
    var d = $(".row-detail", row);
    $(".row-top", row).setAttribute("aria-expanded", "true");
    row.classList.add("is-open");
    d.classList.add("open");
    if (!motionOK()) return;
    d.style.height = "auto";
    var target = d.offsetHeight, kids = $$(".row-detail-in > *", d);
    utils.set(kids, { opacity: 0, y: 18 });
    d.style.height = "0px";
    animate(d, { height: ["0px", target + "px"], duration: 800, ease: "outExpo", onComplete: function () { d.style.height = ""; } });
    animate(kids, { opacity: 1, y: 0, duration: 800, delay: stagger(70, { start: 160 }), ease: "outQuart" });
  }
  rows.forEach(function (row) {
    $(".row-top", row).addEventListener("click", function () {
      var isOpen = $(".row-detail", row).classList.contains("open");
      rows.forEach(function (r) { if (r !== row) closeRow(r); });
      if (isOpen) closeRow(row); else openRow(row);
    });
  });

  /* ---------- 5. generative project covers ---------- */
  function drawCover(c, hue, idx) {
    var w = c.width, h = c.height, x = c.getContext("2d");
    var dark = root.getAttribute("data-theme") !== "light";
    var bg = "hsl(" + hue + "," + (dark ? 60 : 70) + "%," + (dark ? 11 : 88) + "%)";
    var fg = "hsl(" + hue + ",95%," + (dark ? 62 : 46) + "%)";
    var fg2 = "hsl(" + ((hue + 40) % 360) + ",90%," + (dark ? 72 : 32) + "%)";
    x.save(); x.fillStyle = bg; x.fillRect(0, 0, w, h);
    var k = idx % 4, i, j;
    if (k === 0) {                         /* off-centre rings: moiré */
      x.lineWidth = 3; x.strokeStyle = fg;
      for (i = 0; i < 46; i++) { x.beginPath(); x.arc(w * 0.62, h * 0.38, 12 + i * 14, 0, Math.PI * 2); x.stroke(); }
      x.strokeStyle = fg2; x.globalAlpha = .6;
      for (i = 0; i < 46; i++) { x.beginPath(); x.arc(w * 0.38, h * 0.62, 12 + i * 14, 0, Math.PI * 2); x.stroke(); }
    } else if (k === 1) {                  /* dot field, sized by a sine field */
      x.fillStyle = fg;
      for (i = 0; i < 14; i++) for (j = 0; j < 18; j++) {
        var px = (i + .5) * w / 14, py = (j + .5) * h / 18;
        var r = (Math.sin(i * .55 + idx) + Math.cos(j * .42 - idx * .7) + 2) * 4.6;
        x.beginPath(); x.arc(px, py, Math.max(1, r), 0, Math.PI * 2); x.fill();
      }
    } else if (k === 2) {                  /* bands */
      x.translate(w / 2, h / 2); x.rotate(-0.5);
      for (i = -24; i < 24; i++) { x.fillStyle = i % 3 === 0 ? fg2 : fg; x.globalAlpha = .25 + (Math.sin(i * .7 + idx) + 1) * .35; x.fillRect(-w, i * 26, w * 2, 13 + (i % 4) * 3); }
    } else {                               /* stacked waves */
      x.lineWidth = 3;
      for (i = 0; i < 34; i++) {
        x.strokeStyle = i % 5 === 0 ? fg2 : fg; x.globalAlpha = .35 + (i / 34) * .65;
        x.beginPath();
        for (j = 0; j <= w; j += 8) {
          var yy = 40 + i * 19 + Math.sin(j * .018 + i * .35 + idx) * 22 * Math.sin(i * .2 + 1);
          j === 0 ? x.moveTo(j, yy) : x.lineTo(j, yy);
        }
        x.stroke();
      }
    }
    x.restore();
    /* film grain so it doesn't look like a vector clip-art */
    x.globalAlpha = dark ? .07 : .05; x.fillStyle = dark ? "#fff" : "#000";
    for (i = 0; i < 900; i++) x.fillRect(Math.random() * w, Math.random() * h, 1.4, 1.4);
    x.globalAlpha = 1;
    var g = x.createLinearGradient(0, h * .55, 0, h); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.55)");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }

  /* ---------- 6. pointer interactions (fine pointers only) ---------- */
  if (finePointer) {
    /* cursor */
    var dot = $(".cursor-dot"), ring = $(".cursor-ring");
    if (dot && ring) {
      var dotA = createAnimatable(dot, { x: 70, y: 70, ease: "out(2)" });
      var ringA = createAnimatable(ring, { x: 480, y: 480, ease: "out(3)" });
      document.addEventListener("mousemove", function (e) { dotA.x(e.clientX).y(e.clientY); ringA.x(e.clientX).y(e.clientY); }, { passive: true });
      document.addEventListener("mousedown", function () { if (motionOK()) animate(ring, { scale: [1.6, 1], duration: 550, ease: "outExpo" }); });
      document.addEventListener("pointerover", function (e) {
        var t = e.target.closest && e.target.closest("a, button, [data-hover], .magnetic, input");
        document.body.classList.toggle("link-hover", !!t);
      });
    }

    /* magnetic pull + press */
    $$(".socials a, .foot-socials a, .pill-btn, .ctl, .lyrics-btn").forEach(function (el) { el.classList.add("magnetic"); });
    $$(".magnetic").forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        if (!motionOK()) return;
        var r = el.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        animate(el, { x: dx * 0.3, y: dy * 0.3, duration: 320, ease: "out(3)" });
      });
      el.addEventListener("pointerdown", function () { if (motionOK()) animate(el, { scale: 0.9, duration: 140, ease: "out(2)" }); });
      el.addEventListener("pointerup", function () { if (motionOK()) animate(el, { scale: 1, duration: 600, ease: "outElastic(1, .5)" }); });
      el.addEventListener("pointerleave", function () {
        if (motionOK()) animate(el, { x: 0, y: 0, scale: 1, duration: 900, ease: "outElastic(1, .45)" });
        else settle(el, { x: 0, y: 0, scale: 1 });
      });
    });

    /* project names breathe on the variable font axes; a cover trails the pointer */
    var cover = $("#workCover"), coverCanvas = $("#coverCanvas"), coverTag = $("#coverTag"), coverName = $("#coverName");
    var coverA = cover ? createAnimatable(cover, { x: 520, y: 520, rotate: 700, ease: "out(3)" }) : null;
    var lastX = 0, coverOn = false;
    rows.forEach(function (row, i) {
      var name = $(".row-name", row);
      row.addEventListener("pointerenter", function (e) {
        if (!motionOK()) return;
        animate(name, { "--wd": 100, "--wt": 800, duration: 700, ease: "outExpo" });
        if (!cover) return;
        drawCover(coverCanvas, +row.getAttribute("data-hue") || 0, i);
        coverTag.textContent = row.getAttribute("data-tag") || "project";
        coverName.textContent = name.childNodes[0].textContent.trim();
        if (!coverOn) {
          coverOn = true; lastX = e.clientX;
          coverA.x(e.clientX + 28, 0).y(e.clientY - cover.offsetHeight / 2, 0);
          animate(cover, { opacity: [0, 1], scale: [0.7, 1], duration: 600, ease: "outExpo" });
        } else {
          animate(cover, { scale: [0.94, 1], duration: 500, ease: "outBack(2)" });
        }
      });
      row.addEventListener("pointerleave", function () {
        animate(name, { "--wd": 80, "--wt": 700, duration: 600, ease: "outExpo" });
      });
    });
    var rowsWrap = $(".rows");
    if (rowsWrap && cover) {
      rowsWrap.addEventListener("pointermove", function (e) {
        if (!coverOn) return;
        var vx = e.clientX - lastX; lastX = e.clientX;
        /* sit on whichever side of the pointer has room */
        var side = e.clientX > window.innerWidth - 340 ? -cover.offsetWidth - 28 : 28;
        coverA.x(e.clientX + side).y(e.clientY - cover.offsetHeight / 2).rotate(clamp(vx * 0.6, -12, 12));
      });
      rowsWrap.addEventListener("pointerleave", function () {
        coverOn = false;
        animate(cover, { opacity: 0, scale: 0.8, duration: 350, ease: "outQuad" });
      });
      /* hide it when a row is clicked open (the detail is the focus now) */
      rowsWrap.addEventListener("click", function () { if (coverOn) animate(cover, { opacity: 0.0, duration: 200 }); coverOn = false; });
    }

    /* live cards: slight tilt */
    $$(".np, .dc").forEach(function (card) {
      card.style.transformStyle = "preserve-3d";
      card.addEventListener("pointermove", function (e) {
        if (!motionOK()) return;
        var r = card.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        animate(card, { rotateX: (0.5 - py) * 5, rotateY: (px - 0.5) * 7, duration: 300, ease: "out(2)" });
      });
      card.addEventListener("pointerleave", function () { animate(card, { rotateX: 0, rotateY: 0, duration: 1000, ease: "outElastic(1, .55)" }); });
    });

    /* contact headline: a letter wave on hover */
    if (contactBig) {
      var waving = false;
      contactBig.addEventListener("pointerenter", function () {
        if (waving || !motionOK()) return;
        waving = true;
        contactLines.forEach(function (ln) { ln.style.overflow = "visible"; });
        animate(contactChars, { y: ["0%", "-14%", "0%"], duration: 800, delay: stagger(20), ease: "out(3)", onComplete: function () { waving = false; } });
      });
    }
  }

  /* ---------- 7. dock: sliding pill follows hover, scroll decides when idle ---------- */
  var dockIn = $(".dock-in"), ind = dockIn && $(".dock-ind", dockIn);
  var dockLinks = dockIn ? $$(".dock-in > a, .nav-drop > a", dockIn) : [];
  var activeLink = null, indShown = false;
  function moveInd(a, instant) {
    if (!ind) return;
    dockLinks.forEach(function (l) { l.classList.toggle("active", l === a); });
    if (!a) { animate(ind, { opacity: 0, duration: 250 }); indShown = false; return; }
    var nr = dockIn.getBoundingClientRect(), r = a.getBoundingClientRect();
    var props = { x: r.left - nr.left, width: r.width, opacity: 1 };
    /* utils.set does not cancel a running tween (e.g. an earlier fade-out), which would then win: remove first */
    if (instant || !indShown || !motionOK()) { utils.remove(ind); utils.set(ind, props); }
    else animate(ind, Object.assign({ duration: 650, ease: "outExpo" }, props));
    indShown = true;
  }
  dockLinks.forEach(function (a) { a.addEventListener("pointerenter", function () { moveInd(a); }); });
  if (dockIn) dockIn.addEventListener("pointerleave", function () { moveInd(activeLink); });
  var spy = new IntersectionObserver(function (es) {
    es.forEach(function (en) {
      if (!en.isIntersecting) return;
      var id = en.target.id === "hero" ? "top" : en.target.id;
      var a = dockLinks.filter(function (l) { return l.getAttribute("href") === "#" + id; })[0] || null;
      activeLink = a; moveInd(a);
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("#hero, main section[id]").forEach(function (s) { spy.observe(s); });
  window.addEventListener("resize", function () { moveInd(activeLink, true); });

  /* ---------- 8. role roller ---------- */
  var roles = ["full-stack developer", "ml engineer", "android developer", "backend engineer"];
  var typed = $("#typed"), ri = 0, rollTimer = null;
  function roll() {
    clearTimeout(rollTimer);
    if (!motionOK() || document.hidden) { rollTimer = setTimeout(roll, 2200); return; }
    animate(typed, { y: ["0%", "-110%"], opacity: [1, 0], duration: 420, ease: "inExpo",
      onComplete: function () {
        ri = (ri + 1) % roles.length; typed.textContent = roles[ri];
        animate(typed, { y: ["110%", "0%"], opacity: [0, 1], duration: 700, ease: "outExpo" });
        rollTimer = setTimeout(roll, 2600);
      } });
  }

  /* ---------- 9. marquees ---------- */
  function marqueeOf(track, ms, reverse) {
    if (!track) return null;
    var base = Array.prototype.slice.call(track.children);
    for (var k = 0; k < 2; k++) base.forEach(function (n) { track.appendChild(n.cloneNode(true)); });
    var anim = animate(track, { x: reverse ? ["-33.3333%", "0%"] : ["0%", "-33.3333%"], duration: ms, ease: "linear", loop: true, autoplay: false });
    new IntersectionObserver(function (es) {
      if (!motionOK()) { anim.pause(); return; }
      es[0].isIntersecting ? anim.play() : anim.pause();
    }).observe(track.parentNode);
    track.parentNode.addEventListener("pointerenter", function () { anim.speed = 0.3; });
    track.parentNode.addEventListener("pointerleave", function () { anim.speed = 1; });
    return anim;
  }
  var marquees = [marqueeOf($("#marqueeTrack"), 44000), marqueeOf($("#mantraTrack"), 30000, true)].filter(Boolean);

  /* ---------- 10. clock (hyderabad) ---------- */
  var clock = $("#clock");
  if (clock && window.Intl) {
    var fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
    var tickClock = function () { clock.textContent = fmt.format(new Date()) + " ist"; };
    tickClock(); setInterval(tickClock, 20000);
  }

  /* ---------- 11. intro (the particle wordmark assembles itself in hero.js) ---------- */
  function intro() {
    var hud = $$(".hero [data-intro]"), corners = $$(".cm"), dock = $(".dock"), brand = $(".brand");
    if (!bootedMo || !motionOK()) { root.classList.add("ready"); rollTimer = setTimeout(roll, 1800); return; }
    utils.set(hud, { opacity: 0, y: 14 });
    utils.set(corners, { opacity: 0, scale: 2.2 });
    utils.set(dock, { opacity: 0, y: 40 });
    utils.set(brand, { opacity: 0, y: -16 });
    root.classList.add("ready");
    A.createTimeline({ defaults: { ease: "outExpo" }, onComplete: function () { rollTimer = setTimeout(roll, 1400); } })
      .add(corners, { opacity: 1, scale: 1, duration: 1100, delay: stagger(70) }, 200)
      .add(brand, { opacity: 1, y: 0, duration: 900 }, 500)
      .add(hud, { opacity: 1, y: 0, duration: 1000, delay: stagger(90) }, 1300)
      .add(dock, { opacity: 1, y: 0, duration: 1100, ease: "outBack(1.4)" }, 1700);
  }
  var arriving = root.classList.contains("arrive");
  requestAnimationFrame(function () { setTimeout(intro, arriving ? 380 : 40); });

  /* ---------- 12. motion toggle (called from script.js) ---------- */
  window.ykMotionChanged = function () {
    if (!motionOK()) {
      root.classList.remove("mo", "arrive");
      leadWords.forEach(function (w) { w.style.opacity = ""; });
      marquees.forEach(function (m) { m.pause(); });
      clearTimeout(rollTimer);
      typed.textContent = roles[0]; settle(typed, { y: "0%", opacity: 1 });
    } else {
      if (bootedMo) root.classList.add("mo");
      marquees.forEach(function (m) { m.play(); });
      rollTimer = setTimeout(roll, 1200);
      scrubLead();
    }
    if (window.ykHeroMotion) window.ykHeroMotion();
  };

  if (bootedMo) window.__moReady = true;
})();
