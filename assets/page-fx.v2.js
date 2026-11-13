/* page-fx v2 — shared page transitions (anime.js).
   leaving: five accent bars sweep up over the page, then we navigate.
   arriving: the next page starts covered (html.arrive, set by an inline head
   script) and the bars sweep away. same-origin links only; modified clicks,
   new tabs, downloads and hash links are left alone. respects data-motion=off.

   v2: the curtain can never become an invisible click-eater.
   - it only takes pointer events while a leave is actually in flight
     (arriving no longer blocks: the bars are already sweeping away)
   - every "we're back" signal (pageshow, tab visible again, window focus)
     resets it unless a navigation is genuinely in progress
   - a pointerdown that lands on the curtain when nothing is in flight clears it */
(function () {
  "use strict";
  var html = document.documentElement;
  var A = window.anime;
  var curtain = document.querySelector(".curtain");
  if (!curtain) { html.classList.remove("arrive"); return; }
  if (!A) { html.classList.remove("arrive"); curtain.style.pointerEvents = "none"; return; }
  var bars = Array.prototype.slice.call(curtain.children);
  var leaving = 0;            /* timestamp of the leave in flight, 0 = none */
  var motionOK = function () { return html.getAttribute("data-motion") !== "off"; };

  function setBars(origin, scale) {
    bars.forEach(function (b) { b.style.transformOrigin = origin; b.style.transform = "scaleY(" + scale + ")"; });
  }
  /* hard reset: no animation, no blocking, nothing covering */
  function clear() {
    leaving = 0;
    A.utils.remove(bars);
    html.classList.remove("arrive");
    curtain.style.pointerEvents = "none";
    setBars("bottom", 0);
  }

  /* arrive: sweep the curtain away (it starts fully covering) */
  function arrive() {
    curtain.style.pointerEvents = "none";
    if (!html.classList.contains("arrive")) return;
    setBars("top", 1);
    A.animate(bars, {
      scaleY: [1, 0], delay: A.stagger(55), duration: 750, ease: "inOutQuart",
      onComplete: function () { if (!leaving) clear(); }
    });
    setTimeout(function () { if (!leaving && html.classList.contains("arrive")) clear(); }, 1600);
  }

  /* leave: sweep the curtain up, then go */
  function retract() {
    leaving = 0;
    curtain.style.pointerEvents = "none";
    A.utils.remove(bars);
    setBars("top", 1);
    A.animate(bars, { scaleY: 0, delay: A.stagger(40), duration: 500, ease: "inOutQuart",
      onComplete: function () { if (!leaving) setBars("bottom", 0); } });
  }
  function leave(href) {
    if (leaving) return;
    var me = leaving = Date.now();
    curtain.style.pointerEvents = "auto";
    try { sessionStorage.setItem("yk-nav", String(Date.now())); } catch (e) {}
    A.utils.remove(bars);
    setBars("bottom", 0);
    var went = false;
    function go() { if (went) return; went = true; window.location.href = href; }
    A.animate(bars, { scaleY: [0, 1], delay: A.stagger(45), duration: 520, ease: "inOutQuart", onComplete: go });
    setTimeout(go, 1100);                                              /* failsafe: always navigate */
    setTimeout(function () { if (leaving === me) retract(); }, 4000); /* nav never happened (download, error, cancelled) */
  }

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
    var u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin) return;
    if (u.pathname === location.pathname && u.search === location.search) return; /* hash / same page */
    if (/\.(apk|exe|zip|pdf|png|jpe?g|webp|json)$/i.test(u.pathname)) return;
    if (!motionOK()) return;
    e.preventDefault();
    leave(u.href);
  });

  /* a click that hits the curtain while nothing is in flight: it is stale, drop it */
  curtain.addEventListener("pointerdown", function () { if (!leaving) clear(); });

  /* back/forward cache, tab switches, window refocus: if we are still here, uncover */
  function backHere() { if (!leaving || Date.now() - leaving > 1500) { if (leaving) retract(); else if (!html.classList.contains("arrive")) clear(); } }
  window.addEventListener("pageshow", function (e) { if (e.persisted) clear(); else backHere(); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) backHere(); });
  window.addEventListener("focus", backHere);

  window.ykFx = { arrive: arrive, leave: leave, clear: clear };
  arrive();
})();
