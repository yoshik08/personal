/* type — 15s monkeytype-style test */
(function () {
  "use strict";

  var TIME = 15;
  var NAME_KEY = "yoshik-type-name";
  var LB_KEY = "yoshik-type-lb";

  var WORDS = ("the be to of and a in that have i it for not on with he as you do at " +
    "this but his by from they we say her she or an will my one all would there their " +
    "what so up out if about who get which go me when make can like time no just him know " +
    "take people into year your good some could them see other than then now look only come " +
    "its over think also back after use two how our work first well way even new want because " +
    "any these give day most us is are was were been has had were said each make world still " +
    "learn should through before move right too mean same tell does set three under while " +
    "where much might down side been much own found house ever never always night light " +
    "think great small large big little young old long high low").split(" ");

  var wordsInner = document.getElementById("wordsInner");
  var wordsWrap = document.getElementById("wordsWrap");
  var caret = document.getElementById("caret");
  var timerEl = document.getElementById("timer");
  var liveWpmEl = document.getElementById("liveWpm");
  var hiddenInput = document.getElementById("hiddenInput");
  var nameOverlay = document.getElementById("nameOverlay");
  var nameInput = document.getElementById("nameInput");
  var resultEl = document.getElementById("result");
  var rWpm = document.getElementById("rWpm");
  var rAcc = document.getElementById("rAcc");
  var lbOverlay = document.getElementById("lbOverlay");
  var lbRows = document.getElementById("lbRows");

  var playerName = "";
  try { playerName = localStorage.getItem(NAME_KEY) || ""; } catch (e) {}

  var words = [], wordIndex = 0, typedWords = [];
  var correctChars = 0, correctKeys = 0, totalKeys = 0;
  var started = false, finished = false;
  var timerId = null, startTime = 0;

  function esc(ch) {
    return ch.replace(/&/g, "&amp;").replace(/</g, "&lt;")
             .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function randWords(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
    return out;
  }
  function focusInput() {
    if (nameOverlay.classList.contains("hidden") && lbOverlay.classList.contains("hidden")) {
      hiddenInput.focus({ preventScroll: true });
    }
  }

  /* ---------- render ---------- */
  /* build the word dom once per test; letters are only repainted after */
  function buildWords() {
    var html = "";
    for (var i = 0; i < words.length; i++) {
      html += '<span class="word">';
      for (var j = 0; j < words[i].length; j++) {
        html += '<span class="letter">' + words[i][j] + "</span>";
      }
      html += "</span>";
    }
    wordsInner.innerHTML = html;
    wordsInner.style.transform = "translateY(0)";
    currentShift = 0;
  }

  /* repaint a single word's letters in place — no dom rebuild per keystroke,
     so the caret glides smoothly across stable letter positions */
  function paintWord(i) {
    var wordEl = wordsInner.children[i];
    if (!wordEl) return;
    var w = words[i], t = typedWords[i] || "";
    while (wordEl.children.length > w.length) {
      wordEl.removeChild(wordEl.lastChild);
    }
    for (var j = 0; j < w.length; j++) {
      var l = wordEl.children[j];
      var cls = "letter" + (j < t.length ? (t[j] === w[j] ? " correct" : " incorrect") : "");
      if (l.className !== cls) l.className = cls;
    }
    for (var k = w.length; k < t.length; k++) {
      var s = document.createElement("span");
      s.className = "letter extra";
      s.textContent = t[k];
      wordEl.appendChild(s);
    }
  }

  function refresh() {
    paintWord(wordIndex);
    updateCaret();
    updateLine();
    paintLiveWpm();
  }

  function updateCaret() {
    var wordEl = wordsInner.children[wordIndex];
    if (!wordEl) return;
    var t = typedWords[wordIndex] || "";
    var letters = wordEl.children;
    if (!letters.length) return;
    var target = letters[Math.min(t.length, letters.length - 1)];
    /* layout coords (immune to the scroll transform + its transition),
       relative to wordsWrap which is the caret's offset parent */
    var x = target.offsetLeft;
    if (t.length >= letters.length) x += target.offsetWidth;
    var y = target.offsetTop - currentShift;
    caret.style.transform = "translate(" + x + "px," + y + "px)";
    caret.style.height = target.offsetHeight + "px";
  }

  var currentShift = 0;
  function updateLine() {
    var wordEl = wordsInner.children[wordIndex];
    if (!wordEl) return;
    var lineH = wordEl.offsetHeight + 14;
    currentShift = Math.max(0, wordEl.offsetTop - lineH);
    wordsInner.style.transform = "translateY(" + (-currentShift) + "px)";
  }

  /* ---------- game flow ---------- */
  function reset() {
    words = randWords(70);
    typedWords = [];
    wordIndex = 0;
    correctChars = 0; correctKeys = 0; totalKeys = 0;
    started = false; finished = false;
    clearInterval(timerId);
    hiddenInput.value = "";
    resultEl.classList.add("hidden");
    wordsWrap.classList.remove("hidden");
    document.getElementById("iconRestart").classList.remove("hidden");
    timerEl.textContent = TIME;
    liveWpmEl.textContent = "";
    clearTimeout(blinkT);
    caret.classList.remove("typing");
    wordsInner.classList.remove("flash");
    void wordsInner.offsetWidth; /* restart the fade animation */
    wordsInner.classList.add("flash");
    buildWords();
    refresh();
    focusInput();
  }

  function liveWpm() {
    if (!started || finished) return 0;
    var mins = (performance.now() - startTime) / 60000;
    if (mins < 0.02) return 0;
    return Math.round((correctChars / 5) / mins);
  }
  function paintLiveWpm() {
    liveWpmEl.textContent = started && !finished ? liveWpm() : "";
  }

  function startTimer() {
    started = true;
    startTime = performance.now();
    timerId = setInterval(function () {
      var remain = Math.ceil(TIME - (performance.now() - startTime) / 1000);
      if (remain <= 0) { finish(); return; }
      timerEl.textContent = remain;
      paintLiveWpm();
    }, 100);
  }

  /* monkeytype-style count-up for result numbers */
  function countUp(el, target, suffix) {
    var start = performance.now(), dur = 900;
    function tick(now) {
      var p = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + (suffix || "");
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(timerId);
    timerEl.textContent = "0";
    liveWpmEl.textContent = "";
    hiddenInput.blur();
    var wpm = Math.round((correctChars / 5) / (TIME / 60));
    var acc = totalKeys ? Math.round((correctKeys / totalKeys) * 100) : 100;
    saveScore(wpm, acc);
    wordsWrap.classList.add("hidden");
    document.getElementById("iconRestart").classList.add("hidden");
    resultEl.classList.remove("hidden");
    countUp(rWpm, wpm);
    countUp(rAcc, acc, "%");
  }

  /* keep the caret solid while typing; let it blink only when idle */
  var blinkT = null;
  function solidCaret() {
    caret.classList.add("typing");
    clearTimeout(blinkT);
    blinkT = setTimeout(function () { caret.classList.remove("typing"); }, 1200);
  }

  /* ---------- input ---------- */
  hiddenInput.addEventListener("input", function () {
    if (finished) return;
    if (!started) startTimer();
    solidCaret();
    var val = hiddenInput.value;
    var prev = typedWords[wordIndex] || "";
    var word = words[wordIndex];

    if (val.charAt(val.length - 1) === " ") {
      /* word submitted */
      var typed = val.slice(0, -1);
      typedWords[wordIndex] = typed;
      totalKeys++; /* the space press */
      for (var m = typed.length; m < word.length; m++) totalKeys++; /* skipped letters */
      if (typed === word) { correctKeys++; correctChars++; } /* the space */
      var submitted = wordIndex;
      wordIndex++;
      hiddenInput.value = "";
      if (wordIndex >= words.length - 10) {
        words = words.concat(randWords(30));
        buildWords();
        for (var q = 0; q <= wordIndex; q++) paintWord(q);
      } else {
        paintWord(submitted);
      }
      refresh();
      return;
    }

    if (val.length > prev.length) {
      var added = val.slice(prev.length);
      for (var k = 0; k < added.length; k++) {
        var ch = added[k], pos = prev.length + k;
        totalKeys++;
        if (pos < word.length && ch === word[pos]) { correctKeys++; correctChars++; }
      }
      typedWords[wordIndex] = val;
    } else {
      typedWords[wordIndex] = val;
    }
    refresh();
  });

  hiddenInput.addEventListener("keydown", function (e) {
    if (e.key === "Backspace" && hiddenInput.value === "" && wordIndex > 0 && !finished) {
      /* jump back to previous word, monkeytype style */
      e.preventDefault();
      wordIndex--;
      var t = typedWords[wordIndex] || "";
      hiddenInput.value = t;
      refresh();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Tab" && nameOverlay.classList.contains("hidden")) { e.preventDefault(); reset(); }
  });
  document.addEventListener("click", function (e) {
    if (e.target.closest(".overlay") || e.target.closest("button") || e.target.closest("a") || e.target.closest("input")) return;
    focusInput();
  });
  document.getElementById("restartBtn").addEventListener("click", reset);
  document.getElementById("iconRestart").addEventListener("click", function (e) {
    e.stopPropagation();
    reset();
  });

  /* ---------- name ---------- */
  function askName() {
    nameOverlay.classList.remove("hidden");
    setTimeout(function () { nameInput.focus(); }, 50);
  }
  nameInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var v = nameInput.value.trim().toLowerCase().slice(0, 16);
      if (!v) return;
      playerName = v;
      try { localStorage.setItem(NAME_KEY, v); } catch (err) {}
      nameOverlay.classList.add("hidden");
      reset();
    }
  });

  /* ---------- leaderboard ---------- */
  function getLB() {
    try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveScore(wpm, acc) {
    var lb = getLB();
    lb.push({ name: playerName || "anon", wpm: wpm, acc: acc, ts: Date.now() });
    lb.sort(function (a, b) { return b.wpm - a.wpm; });
    try { localStorage.setItem(LB_KEY, JSON.stringify(lb.slice(0, 50))); } catch (e) {}
    /* persist to the global leaderboard — fire and forget */
    try {
      fetch("/api/type-leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: playerName || "anon", wpm: wpm, acc: acc })
      }).catch(function () {});
    } catch (e) {}
  }
  function paintLB(lb) {
    if (!lb.length) {
      lbRows.innerHTML = '<p class="lb-empty">no scores yet. go type.</p>';
      return;
    }
    lbRows.innerHTML = lb.map(function (s, i) {
      return '<div class="lb-row' + (i === 0 ? " first" : "") + '">' +
        '<span class="lb-rank">' + (i + 1) + "</span>" +
        '<span class="lb-name">' + esc(s.name) + "</span>" +
        '<span class="lb-wpm">' + s.wpm + "</span>" +
        '<span class="lb-acc">' + s.acc + "%</span></div>";
    }).join("");
  }
  function renderLB() {
    lbRows.innerHTML = '<p class="lb-empty">loading…</p>';
    fetch("/api/type-leaderboard", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        /* global board; fall back to this browser's scores if unreachable */
        paintLB(((d && d.scores && d.scores.length) ? d.scores : getLB()).slice(0, 10));
      })
      .catch(function () { paintLB(getLB().slice(0, 10)); });
  }
  document.getElementById("lbBtn").addEventListener("click", function (e) {
    e.stopPropagation();
    renderLB();
    lbOverlay.classList.remove("hidden");
  });
  document.getElementById("lbClose").addEventListener("click", function () {
    lbOverlay.classList.add("hidden");
    focusInput();
  });
  lbOverlay.addEventListener("click", function (e) {
    if (e.target === lbOverlay) { lbOverlay.classList.add("hidden"); focusInput(); }
  });

  /* ---------- boot ---------- */
  if (playerName) {
    nameOverlay.classList.add("hidden");
    reset();
  } else {
    askName();
  }
})();
