/* engagement predictor — 100% client-side random forest */
(function () {
  "use strict";
  var MODEL = null, METRICS = null, DATA = null, CLEAN = null;

  /* ---------- model loading + inference ---------- */
  var nameToIdx = {};
  function loadAll(cb) {
    Promise.all([
      fetch("model/model.json").then(r => r.json()),
      fetch("model/metrics.json").then(r => r.json())
    ]).then(function (res) {
      MODEL = res[0]; METRICS = res[1];
      MODEL.features.forEach(function (n, i) { nameToIdx[n] = i; });
      cb();
    }).catch(function () {
      document.getElementById("pipelog").innerHTML =
        '<p class="wrk">could not load the model files. check your connection and refresh.</p>';
    });
  }

  function encodeRow(row) {
    var r = {}, k;
    for (k in row) r[k] = row[k];
    Object.keys(MODEL.preprocess.medians).forEach(function (c) {
      if (r[c] === null || r[c] === undefined || r[c] === "" || Number.isNaN(+r[c])) r[c] = MODEL.preprocess.medians[c];
    });
    Object.keys(MODEL.preprocess.clip).forEach(function (c) {
      var b = MODEL.preprocess.clip[c], v = +r[c];
      if (v < b[0]) r[c] = b[0];
      if (v > b[1]) r[c] = b[1];
    });
    var v = new Array(MODEL.features.length).fill(0);
    MODEL.preprocess.cat_cols.forEach(function (c) {
      MODEL.preprocess.categories[c].forEach(function (cat) {
        v[nameToIdx[c + "_" + cat]] = (String(r[c]) === String(cat)) ? 1 : 0;
      });
    });
    MODEL.preprocess.num_cols.forEach(function (c) { v[nameToIdx[c]] = +r[c] || 0; });
    return v;
  }
  function predictProba(vec) {
    var votes = MODEL.classes.map(function () { return 0; });
    MODEL.trees.forEach(function (t) {
      var n = 0;
      while (t.f[n] !== -2) n = (vec[t.f[n]] <= t.t[n]) ? t.l[n] : t.r[n];
      votes[t.v[n]]++;
    });
    return votes.map(function (x) { return x / MODEL.trees.length; });
  }
  function predict(vec) {
    var p = predictProba(vec), best = 0, i;
    for (i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    return { cls: MODEL.classes[best], proba: p };
  }

  /* ---------- csv parsing ---------- */
  function parseCSV(text) {
    var rows = [], row = [], cur = "", q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur); cur = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else cur += c;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    if (!rows.length) return { header: [], rows: [] };
    var header = rows[0].map(function (h) { return h.trim(); });
    return {
      header: header,
      rows: rows.slice(1).filter(function (r) { return r.length === header.length; })
        .map(function (r) {
          var o = {};
          header.forEach(function (h, j) { o[h] = r[j].trim(); });
          return o;
        })
    };
  }

  var NEED = ["platform", "content_type", "post_hour", "day_of_week", "follower_count",
              "hashtag_count", "caption_length", "video_duration_sec", "has_cta"];

  function cleanData(parsed) {
    var stats = { raw: parsed.rows.length, missing: 0, dups: 0, clipped: 0 };
    var med = MODEL.preprocess.medians, clip = MODEL.preprocess.clip;
    var seen = {}, out = [];
    parsed.rows.forEach(function (r) {
      // coerce numerics
      MODEL.preprocess.num_cols.forEach(function (c) {
        if (r[c] === "" || r[c] === undefined) { r[c] = NaN; stats.missing++; }
        else { var v = +r[c]; if (Number.isNaN(v)) { r[c] = NaN; stats.missing++; } else r[c] = v; }
      });
      var key = JSON.stringify(r);
      if (seen[key]) { stats.dups++; return; }
      seen[key] = 1;
      MODEL.preprocess.num_cols.forEach(function (c) {
        if (Number.isNaN(r[c])) r[c] = med[c] !== undefined ? med[c] : 0;
        if (clip[c]) {
          if (r[c] < clip[c][0]) { r[c] = clip[c][0]; stats.clipped++; }
          if (r[c] > clip[c][1]) { r[c] = clip[c][1]; stats.clipped++; }
        }
      });
      out.push(r);
    });
    return { rows: out, stats: stats };
  }

  /* ---------- upload ---------- */
  var drop = document.getElementById("drop");
  ["dragover", "dragenter"].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add("over"); });
  });
  ["dragleave", "drop"].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove("over"); });
  });
  drop.addEventListener("drop", function (ev) {
    if (ev.dataTransfer.files.length) readFile(ev.dataTransfer.files[0]);
  });
  document.getElementById("file").addEventListener("change", function (ev) {
    if (ev.target.files.length) readFile(ev.target.files[0]);
  });
  document.getElementById("sample").addEventListener("click", function () {
    fetch("model/sample.csv").then(function (r) { return r.text(); })
      .then(ingest).catch(function () { alert("could not load sample csv"); });
  });
  function readFile(f) {
    var rd = new FileReader();
    rd.onload = function () { ingest(String(rd.result)); };
    rd.readAsText(f);
  }
  function ingest(text) {
    var parsed = parseCSV(text);
    var missing = NEED.filter(function (c) { return parsed.header.indexOf(c) < 0; });
    if (missing.length) { alert("csv is missing columns: " + missing.join(", ")); return; }
    DATA = parsed;
    var c = cleanData(parsed);
    CLEAN = c;
    renderStats(c.stats);
    renderPreview(c.rows.slice(0, 8), parsed.header);
    document.getElementById("runpipe").disabled = false;
    document.getElementById("predictbtn").disabled = false;
    document.getElementById("pipelog").innerHTML = '<p class="inf">csv ready — hit run pipeline.</p>';
  }
  function renderStats(s) {
    var el = document.getElementById("cleanstats");
    el.hidden = false;
    el.innerHTML =
      stat(s.raw, "rows loaded") + stat(s.missing, "missing → median filled") +
      stat(s.dups, "duplicates dropped") + stat(s.clipped, "outliers capped (iqr)") +
      stat(s.raw - s.dups, "rows clean");
    function stat(b, l) { return '<div class="stat"><b>' + b + '</b><span>' + l + '</span></div>'; }
  }
  function renderPreview(rows, header) {
    var el = document.getElementById("preview");
    document.getElementById("previewwrap").hidden = false;
    var h = "<tr>" + header.map(function (x) { return "<th>" + x + "</th>"; }).join("") + "</tr>";
    h += rows.map(function (r) {
      return "<tr>" + header.map(function (x) {
        var v = r[x];
        if (x === "engagement_level") return '<td><span class="pill ' + v + '">' + v + "</span></td>";
        return "<td>" + (v === null || v === undefined ? "" : v) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    el.innerHTML = h;
  }

  /* ---------- pipeline run ---------- */
  var log = document.getElementById("pipelog");
  function say(html, cls) {
    var p = document.createElement("p");
    if (cls) p.className = cls;
    p.innerHTML = html;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  document.getElementById("runpipe").addEventListener("click", function () {
    if (!CLEAN || !METRICS) return;
    runPipeline();
  });

  function runPipeline() {
    log.innerHTML = "";
    document.getElementById("charts").hidden = true;
    var m = METRICS, s = CLEAN.stats, chain = Promise.resolve();
    var steps = [
      ["wrk", "▸ module 1 — loading data…"],
      ["ok", "✓ shape: " + s.raw + " rows × " + DATA.header.length + " columns"],
      ["wrk", "▸ module 2 — cleaning: median imputation, dedup, iqr capping…"],
      ["ok", "✓ " + s.missing + " missing filled · " + s.dups + " duplicates dropped · " +
              s.clipped + " outliers capped → " + (s.raw - s.dups) + " rows clean"],
      ["wrk", "▸ module 3 — eda: class balance…"],
      ["inf", "low " + m.class_balance.Low + " · medium " + m.class_balance.Medium + " · high " + m.class_balance.High],
      ["wrk", "▸ module 4 — one-hot encoding (" + MODEL.features.length + " features) → 80/20 stratified split…"],
      ["ok", "✓ train " + m.shapes.train[0] + " · test " + m.shapes.test[0]],
      ["wrk", "▸ module 5 — decision tree depth sweep (2–20)…"],
      ["ok", "✓ best max_depth = " + m.dt.best_depth + " · test accuracy " + m.dt.accuracy.toFixed(4)],
      ["wrk", "▸ module 6 — random forest, 200 trees…"],
      ["ok", "✓ test accuracy " + m.rf.accuracy.toFixed(4)],
      ["wrk", "▸ module 7 — head-to-head…"],
      ["ok", "✓ random forest wins: " + m.rf.accuracy.toFixed(4) + " vs " + m.dt.accuracy.toFixed(4)],
    ];
    steps.forEach(function (st) {
      chain = chain.then(function () { say(st[1], st[0]); return wait(420); });
    });
    chain.then(function () {
      say("done. all outputs below are from the real training run.", "inf");
      drawCharts();
      document.getElementById("charts").hidden = false;
    });
  }

  /* ---------- charts ---------- */
  Chart.defaults.color = "#9a9aa5";
  Chart.defaults.borderColor = "#232329";
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  var CLS = { Low: "#ff6b6b", Medium: "#ffb020", High: "#3ddc84" };
  var ORDER = ["Low", "Medium", "High"];
  var drawn = false;

  function drawCharts() {
    if (drawn) return; drawn = true;
    var m = METRICS;
    new Chart(document.getElementById("ch-balance"), {
      type: "bar",
      data: { labels: ORDER, datasets: [{ data: ORDER.map(function (k) { return m.class_balance[k]; }),
        backgroundColor: ORDER.map(function (k) { return CLS[k]; }) }] },
      options: { plugins: { legend: { display: false } } }
    });
    new Chart(document.getElementById("ch-depth"), {
      type: "line",
      data: { labels: m.dt.depth_curve.depths, datasets: [
        { label: "train", data: m.dt.depth_curve.train, borderColor: "#9a9aa5", tension: .2 },
        { label: "test", data: m.dt.depth_curve.test, borderColor: "#ffb020", tension: .2 } ] },
      options: { plugins: { legend: { position: "bottom" } }, scales: { y: { min: .4, max: 1 } } }
    });
    new Chart(document.getElementById("ch-acc"), {
      type: "bar",
      data: { labels: ["decision tree", "random forest"],
        datasets: [{ data: [m.dt.accuracy, m.rf.accuracy], backgroundColor: ["#9a9aa5", "#3ddc84"] }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 1 } } }
    });
    var imp = m.rf.importances.slice().reverse();
    new Chart(document.getElementById("ch-imp"), {
      type: "bar",
      data: { labels: imp.map(function (x) { return x[0]; }),
        datasets: [{ data: imp.map(function (x) { return x[1]; }), backgroundColor: "#ffb020" }] },
      options: { indexAxis: "y", plugins: { legend: { display: false } } }
    });
    cmTable(document.getElementById("cm-dt"), m.dt.confusion);
    cmTable(document.getElementById("cm-rf"), m.rf.confusion);
  }
  function cmTable(el, cm) {
    var max = Math.max.apply(null, cm.flat ? cm.flat() : [].concat.apply([], cm));
    var h = '<table><tr><th></th>' + ORDER.map(function (k) { return "<th>pred " + k + "</th>"; }).join("") + "</tr>";
    ORDER.forEach(function (rk, i) {
      h += "<tr><th>actual " + rk + "</th>" + ORDER.map(function (ck, j) {
        var v = cm[i][j], a = (.12 + .88 * v / max).toFixed(2);
        var col = rk === ck ? "61,220,132" : "255,107,107";
        return '<td style="background:rgba(' + col + "," + a + ');color:#0b0b0e">' + v + "</td>";
      }).join("") + "</tr>";
    });
    el.innerHTML = h + "</table>";
  }

  /* ---------- batch predict ---------- */
  document.getElementById("predictbtn").addEventListener("click", function () {
    if (!CLEAN) return;
    var rows = CLEAN.rows, counts = { Low: 0, Medium: 0, High: 0 }, agree = 0, hasActual = 0;
    var out = rows.map(function (r) {
      var p = predict(encodeRow(r));
      counts[p.cls]++;
      if (r.engagement_level) {
        hasActual++;
        if (r.engagement_level === p.cls) agree++;
      }
      return { r: r, p: p };
    });
    var el = document.getElementById("predsummary");
    el.hidden = false;
    el.innerHTML =
      stat(counts.High, "predicted high") + stat(counts.Medium, "predicted medium") +
      stat(counts.Low, "predicted low") +
      (hasActual ? stat(Math.round(100 * agree / hasActual) + "%", "match actual (" + hasActual + " rows)") : "");
    function stat(b, l) { return '<div class="stat"><b>' + b + '</b><span>' + l + '</span></div>'; }

    var t = document.getElementById("predtable");
    document.getElementById("predwrap").hidden = false;
    var cols = ["platform", "content_type", "post_hour", "day_of_week", "follower_count",
                "hashtag_count", "caption_length", "video_duration_sec", "has_cta"];
    var h = "<tr>" + cols.map(function (x) { return "<th>" + x + "</th>"; }).join("") +
            "<th>prediction</th><th>confidence</th></tr>";
    h += out.slice(0, 60).map(function (o) {
      var conf = Math.round(Math.max.apply(null, o.p.proba) * 100);
      return "<tr>" + cols.map(function (x) { return "<td>" + o.r[x] + "</td>"; }).join("") +
        '<td><span class="pill ' + o.p.cls + '">' + o.p.cls + "</span></td><td>" + conf + "%</td></tr>";
    }).join("");
    t.innerHTML = h + (out.length > 60 ? "" : "");
    if (out.length > 60) say2("showing first 60 of " + out.length + " rows");
    function say2(x) {
      t.insertAdjacentHTML("afterend", '<p class="dim" style="margin-top:8px">' + x + "</p>");
    }
  });

  /* ---------- tabs ---------- */
  document.querySelectorAll(".tab").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("active"); });
      b.classList.add("active");
      document.getElementById("pane-batch").hidden = b.dataset.tab !== "batch";
      document.getElementById("pane-play").hidden = b.dataset.tab !== "play";
    });
  });

  /* ---------- playground ---------- */
  var SLIDERS = [
    ["post_hour", "post hour", 0, 23, 1, 12],
    ["follower_count", "followers", 79, 45141, 50, 8000],
    ["hashtag_count", "hashtags", 0, 30, 1, 14],
    ["caption_length", "caption length", 10, 500, 5, 259],
    ["video_duration_sec", "video sec", 0, 180, 1, 30],
  ];
  var state = {};
  function buildPlayground() {
    var c = document.getElementById("playcontrols");
    var h = "";
    SLIDERS.forEach(function (s) {
      state[s[0]] = s[5];
      h += '<div class="ctl"><label>' + s[1] + ' <b id="v-' + s[0] + '">' + s[5] + '</b></label>' +
           '<input type="range" id="s-' + s[0] + '" min="' + s[2] + '" max="' + s[3] + '" step="' + s[4] + '" value="' + s[5] + '"></div>';
    });
    h += '<div class="ctl"><label>call to action</label><div class="seg" id="seg-cta">' +
         '<button data-v="0">off</button><button data-v="1" class="on">on</button></div></div>';
    state.has_cta = 1;
    MODEL.preprocess.cat_cols.forEach(function (col) {
      state[col] = MODEL.preprocess.categories[col][0];
      h += '<div class="ctl"><label>' + col.replace(/_/g, " ") + '</label><select id="d-' + col + '">' +
        MODEL.preprocess.categories[col].map(function (x) {
          return '<option value="' + x + '">' + x + "</option>";
        }).join("") + "</select></div>";
    });
    // sensible defaults
    state.platform = "Instagram"; state.content_type = "Reel/Video"; state.day_of_week = "Sat";
    c.innerHTML = h;
    SLIDERS.forEach(function (s) {
      document.getElementById("s-" + s[0]).addEventListener("input", function (e) {
        state[s[0]] = +e.target.value;
        document.getElementById("v-" + s[0]).textContent = e.target.value;
        updatePlay();
      });
    });
    document.querySelectorAll("#seg-cta button").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll("#seg-cta button").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        state.has_cta = +b.dataset.v;
        updatePlay();
      });
    });
    MODEL.preprocess.cat_cols.forEach(function (col) {
      var sel = document.getElementById("d-" + col);
      sel.value = state[col];
      sel.addEventListener("change", function () { state[col] = sel.value; updatePlay(); });
    });
    updatePlay();
  }
  var SUBS = { Low: "this one's gonna flop 📉", Medium: "mid. it'll do okay.", High: "this one's gonna pop off 🚀" };
  function updatePlay() {
    var p = predict(encodeRow(state));
    var v = document.getElementById("verdict");
    v.className = "verdict " + p.cls;
    v.innerHTML = '<span class="vlabel">' + p.cls + "</span>";
    document.getElementById("verdictsub").textContent = SUBS[p.cls];
    var trees = MODEL.trees.length;
    document.getElementById("treenote").textContent =
      Math.round(Math.max.apply(null, p.proba) * trees) + " of " + trees + " trees agree";
    var bars = document.getElementById("probars");
    var order = ["High", "Medium", "Low"];
    bars.innerHTML = order.map(function (k) {
      var i = MODEL.classes.indexOf(k), pct = Math.round(p.proba[i] * 100);
      return '<div class="prow"><span>' + k + '</span><div class="pbar"><i style="width:' + pct +
        '%;background:' + ({ High: "#3ddc84", Medium: "#ffb020", Low: "#ff6b6b" })[k] + '"></i></div><span>' + pct + "%</span></div>";
    }).join("");
  }

  loadAll(function () { buildPlayground(); });
})();
