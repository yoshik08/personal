/* page-fx v1 — shared page transitions (anime.js).
   leaving: five accent bars sweep up over the page, then we navigate.
   arriving: the next page starts covered (html.arrive, set by an inline head
   script) and the bars sweep away. same-origin links only; modified clicks,
   new tabs, downloads and hash links are left alone. respects data-motion=off.
   if anything goes wrong the curtain retracts on its own (never traps the user). */
(function () {
  "use strict";
  var html = document.documentElement;
  var A = window.anime;
  var curtain = document.querySelector(".curtain");
  if (!A || !curtain) { html.classList.remove("arrive"); return; }
  var bars = Array.prototype.slice.call(curtain.children);
  var leaving = false;
  var motionOK = function () { return html.getAttribute("data-motion") !== "off"; };

  function setBars(origin, scale) {
    bars.forEach(function (b) { b.style.transformOrigin = origin; b.style.transform = "scaleY(" + scale + ")"; });
  }

  /* arrive: sweep the curtain away (it starts fully covering) */
  function arrive() {
    if (!html.classList.contains("arrive")) return;
    setBars("top", 1);
    A.animate(bars, {
      scaleY: [1, 0], delay: A.stagger(55), duration: 750, ease: "inOutQuart",
      onComplete: function () { html.classList.remove("arrive"); setBars("bottom", 0); }
    });
  }

  /* leave: sweep the curtain up, then go */
  function retract() {
    leaving = false;
    curtain.style.pointerEvents = "";
    setBars("top", 1);
    A.animate(bars, { scaleY: 0, delay: A.stagger(40), duration: 500, ease: "inOutQuart",
      onComplete: function () { setBars("bottom", 0); } });
  }
  function leave(href) {
    if (leaving) return;
    leaving = true;
    curtain.style.pointerEvents = "auto";
    try { sessionStorage.setItem("yk-nav", String(Date.now())); } catch (e) {}
    setBars("bottom", 0);
    var went = false;
    function go() { if (went) return; went = true; window.location.href = href; }
    A.animate(bars, { scaleY: [0, 1], delay: A.stagger(45), duration: 520, ease: "inOutQuart", onComplete: go });
    setTimeout(go, 1100);                 /* failsafe: always navigate */
    setTimeout(function () { if (leaving) retract(); }, 5000); /* nav never happened (download, error) */
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin) return;
    if (u.pathname === location.pathname && u.search === location.search) return; /* hash / same page */
    if (/\.(apk|zip|pdf|png|jpe?g|webp|json)$/i.test(u.pathname)) return;
    if (!motionOK()) return;
    e.preventDefault();
    leave(u.href);
  });

  /* back/forward cache restores the page mid-curtain: clear it */
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) { leaving = false; html.classList.remove("arrive"); curtain.style.pointerEvents = ""; setBars("bottom", 0); }
  });

  window.ykFx = { arrive: arrive, leave: leave };
  arrive();
})();
