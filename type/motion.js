/* /type motion layer (anime.js). purely additive: it never touches the typing
   logic, only animates elements when script.js shows/hides them. stands down
   for prefers-reduced-motion. */
(function () {
  "use strict";
  var A = window.anime;
  var root = document.documentElement;
  if (!A || root.getAttribute("data-motion") === "off") return;
  var animate = A.animate, stagger = A.stagger, utils = A.utils;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* entrance: waits a beat if we arrived through the curtain */
  var arriving = root.classList.contains("arrive");
  function intro() {
    var items = [$(".topbar"), $(".hud"), $("#wordsWrap"), $("#iconRestart")].filter(Boolean);
    utils.set(items, { opacity: 0, y: 18 });
    animate(items, { opacity: 1, y: 0, duration: 900, delay: stagger(90), ease: "outExpo" });
    var letters = $$("#wordsInner .letter");
    if (letters.length) {
      /* first line of letters fades up like a typewriter warming up */
      var first = letters.slice(0, 60);
      utils.set(first, { opacity: 0 });
      animate(first, { opacity: 1, duration: 500, delay: stagger(8, { start: 250 }), ease: "outQuad",
        onComplete: function () { first.forEach(function (l) { l.style.opacity = ""; }); } });
    }
  }
  requestAnimationFrame(function () { setTimeout(intro, arriving ? 420 : 30); });

  /* watch class / content changes made by script.js */
  function watch(el, opts, fn) { if (el) new MutationObserver(fn).observe(el, opts); }

  var wasHidden = {};
  function overlayWatcher(id, selector) {
    var el = document.getElementById(id);
    if (!el) return;
    wasHidden[id] = el.classList.contains("hidden");
    watch(el, { attributes: true, attributeFilter: ["class"] }, function () {
      var hidden = el.classList.contains("hidden");
      if (wasHidden[id] && !hidden) {
        var box = el.querySelector(selector);
        utils.set(el, { opacity: 0 });
        utils.set(box, { scale: 0.94, y: 16 });
        animate(el, { opacity: 1, duration: 260, ease: "outQuad" });
        animate(box, { scale: 1, y: 0, duration: 650, ease: "outExpo" });
      }
      wasHidden[id] = hidden;
    });
  }
  overlayWatcher("lbOverlay", ".lb-box");
  overlayWatcher("nameOverlay", ".prompt-box");

  /* leaderboard rows stagger in whenever they are (re)rendered */
  watch($("#lbRows"), { childList: true }, function () {
    var rows = $$("#lbRows > *");
    if (!rows.length) return;
    utils.set(rows, { opacity: 0, x: -14 });
    animate(rows, { opacity: 1, x: 0, duration: 600, delay: stagger(45), ease: "outExpo" });
  });

  /* result screen: stat blocks + button spring in (count-up is script.js's) */
  var res = $("#result"), resWasHidden = res && res.classList.contains("hidden");
  watch(res, { attributes: true, attributeFilter: ["class"] }, function () {
    var hidden = res.classList.contains("hidden");
    if (resWasHidden && !hidden) {
      var parts = $$("#result .result-stats > div, #result .restart-btn, #result .hint");
      utils.set(parts, { opacity: 0, y: 22, scale: 0.94 });
      animate(parts, { opacity: 1, y: 0, scale: 1, duration: 800, delay: stagger(110), ease: "outBack(1.6)" });
    }
    resWasHidden = hidden;
  });

  /* restart icon: a proper spin */
  var ir = $("#iconRestart");
  if (ir) ir.addEventListener("click", function () { animate(ir, { rotate: "+=360", duration: 600, ease: "outExpo" }); });
})();
