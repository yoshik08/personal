/* engagement predictor — 100% client-side random forest */
(function () {
  "use strict";
  var MODEL = null, METRICS = null, DATA = null, CLEAN = null;

  /* ---------- model loading + inference ---------- */
  var nameToIdx = {};
  function loadAll(cb) {
    Promise.all([
      fetch("/engagement/model/model.json").then(r => r.json()),
      fetch("/engagement/model/metrics.json").then(r => r.json())
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

  /* ---------- in-browser CART + random forest training ----------
     trains real trees on the user's csv. output format matches model.json
     (f/t/l/r/v arrays) so predictProba works unchanged. */
  function giniCounts(counts, total) {
    if (!total) return 0;
    var s = 0;
    for (var i = 0; i < counts.length; i++) { var p = counts[i] / total; s += p * p; }
    return 1 - s;
  }

  function trainTreeArrays(X, y, nClasses, indices, opts, importances) {
    var F = [], T = [], L = [], R = [], V = [];
    var nF = X[0].length;
    function build(idx, depth) {
      var id = F.length;
      F.push(0); T.push(0); L.push(0); R.push(0); V.push(0);
      var counts = [], c, i;
      for (c = 0; c < nClasses; c++) counts.push(0);
      for (i = 0; i < idx.length; i++) counts[y[idx[i]]]++;
      var total = idx.length, bestCls = 0;
      for (c = 1; c < nClasses; c++) if (counts[c] > counts[bestCls]) bestCls = c;
      V[id] = bestCls;
      if (depth >= opts.maxDepth || total < 2 * opts.minLeaf || counts[bestCls] === total) {
        F[id] = -2; return id;
      }
      var order = [], f;
      for (f = 0; f < nF; f++) order.push(f);
      for (i = order.length - 1; i > 0; i--) {
        var j = (Math.random() * (i + 1)) | 0, tmp = order[i];
        order[i] = order[j]; order[j] = tmp;
      }
      var mTry = Math.min(opts.mTry, nF);
      var parentGini = giniCounts(counts, total);
      var bestGain = 1e-9, bestF = -1, bestT = 0;
      for (var fi = 0; fi < mTry; fi++) {
        f = order[fi];
        var sorted = idx.slice().sort(function (a, b) { return X[a][f] - X[b][f]; });
        var leftC = [], rightC = [];
        for (c = 0; c < nClasses; c++) { leftC.push(0); rightC.push(counts[c]); }
        var leftN = 0;
        for (i = 0; i < sorted.length - 1; i++) {
          var si = sorted[i];
          leftC[y[si]]++; rightC[y[si]]--; leftN++;
          var rightN = total - leftN;
          if (leftN < opts.minLeaf || rightN < opts.minLeaf) continue;
          if (X[sorted[i]][f] === X[sorted[i + 1]][f]) continue;
          var gain = parentGini
            - (leftN / total) * giniCounts(leftC, leftN)
            - (rightN / total) * giniCounts(rightC, rightN);
          if (gain > bestGain) {
            bestGain = gain; bestF = f;
            bestT = (X[sorted[i]][f] + X[sorted[i + 1]][f]) / 2;
          }
        }
      }
      if (bestF < 0) { F[id] = -2; return id; }
      if (importances) importances[bestF] += bestGain * total;
      var leftIdx = [], rightIdx = [];
      for (i = 0; i < idx.length; i++) {
        if (X[idx[i]][bestF] <= bestT) leftIdx.push(idx[i]);
        else rightIdx.push(idx[i]);
      }
      F[id] = bestF; T[id] = bestT;
      L[id] = build(leftIdx, depth + 1);
      R[id] = build(rightIdx, depth + 1);
      return id;
    }
    build(indices, 0);
    return { f: F, t: T, l: L, r: R, v: V };
  }

  function predictTreeVec(tree, vec) {
    var n = 0;
    while (tree.f[n] !== -2) n = (vec[tree.f[n]] <= tree.t[n]) ? tree.l[n] : tree.r[n];
    return tree.v[n];
  }

  function buildEncoder(rows, targetCol) {
    var cols = Object.keys(rows[0]).filter(function (c) { return c !== targetCol; });
    var catCols = [], numCols = [], categories = {}, medians = {}, clip = {};
    cols.forEach(function (c) {
      var isNum = true;
      for (var i = 0; i < Math.min(rows.length, 200); i++) {
        var v = rows[i][c];
        if (v === "" || v == null) continue;
        if (isNaN(+v)) { isNum = false; break; }
      }
      if (isNum) { numCols.push(c); return; }
      catCols.push(c);
      var cats = {};
      rows.forEach(function (r) {
        if (r[c] !== "" && r[c] != null) cats[String(r[c])] = 1;
      });
      var uniq = Object.keys(cats).sort();
      if (uniq.length > 25) {
        /* high-cardinality like ids/handles — useless for trees, drop it */
        catCols.pop();
        return;
      }
      categories[c] = uniq;
    });
    numCols.forEach(function (c) {
      var vals = [];
      rows.forEach(function (r) {
        var v = +r[c];
        if (!isNaN(v)) vals.push(v);
      });
      vals.sort(function (a, b) { return a - b; });
      if (!vals.length) { medians[c] = 0; clip[c] = [0, 0]; return; }
      medians[c] = vals[Math.floor(vals.length / 2)];
      var q1 = vals[Math.floor(vals.length * 0.25)], q3 = vals[Math.floor(vals.length * 0.75)];
      var iqr = q3 - q1;
      clip[c] = [q1 - 1.5 * iqr, q3 + 1.5 * iqr];
    });
    var features = [];
    catCols.forEach(function (c) {
      categories[c].forEach(function (cat) { features.push(c + "_" + cat); });
    });
    numCols.forEach(function (c) { features.push(c); });
    var nameToIdx = {};
    features.forEach(function (n, i) { nameToIdx[n] = i; });
    return {
      catCols: catCols, numCols: numCols, categories: categories,
      medians: medians, clip: clip, features: features,
      encode: function (row) {
        var v = [];
        for (var i = 0; i < features.length; i++) v.push(0);
        var c, key;
        for (c = 0; c < catCols.length; c++) {
          key = catCols[c] + "_" + String(row[catCols[c]]);
          if (nameToIdx[key] !== undefined) v[nameToIdx[key]] = 1;
        }
        for (c = 0; c < numCols.length; c++) {
          var col = numCols[c], val = parseFloat(row[col]);
          if (isNaN(val)) val = medians[col];
          var b = clip[col];
          if (val < b[0]) val = b[0];
          if (val > b[1]) val = b[1];
          v[nameToIdx[col]] = val;
        }
        return v;
      }
    };
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
  /* clicking anywhere on the dropzone opens the picker */
  drop.addEventListener("click", function (ev) {
    if (ev.target.closest("button")) return;
    document.getElementById("file").click();
  });
  document.getElementById("file").addEventListener("change", function (ev) {
    if (ev.target.files.length) readFile(ev.target.files[0]);
  });
  document.getElementById("sample").addEventListener("click", function () {
    fetch("/engagement/model/sample.csv").then(function (r) { return r.text(); })
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
    if (!CLEAN) return;
    runPipeline();
  });

  var activeModelLabel = "pre-trained";
  var chartObjs = [];
  function destroyCharts() {
    chartObjs.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    chartObjs = [];
    document.getElementById("cm-dt").innerHTML = "";
    document.getElementById("cm-rf").innerHTML = "";
  }
  function setActiveModel(model, label) {
    MODEL = model;
    nameToIdx = {};
    MODEL.features.forEach(function (n, i) { nameToIdx[n] = i; });
    activeModelLabel = label;
    var el = document.getElementById("modellabel");
    if (el) el.textContent = "model: " + label;
    buildPlayground();
  }
  function evaluateTrees(trees, X, y, nClasses) {
    var cm = [], i, j;
    for (i = 0; i < nClasses; i++) { cm.push([]); for (j = 0; j < nClasses; j++) cm[i].push(0); }
    var correct = 0, votes = [];
    for (i = 0; i < nClasses; i++) votes.push(0);
    for (i = 0; i < X.length; i++) {
      for (j = 0; j < nClasses; j++) votes[j] = 0;
      for (var t = 0; t < trees.length; t++) votes[predictTreeVec(trees[t], X[i])]++;
      var best = 0;
      for (j = 1; j < nClasses; j++) if (votes[j] > votes[best]) best = j;
      cm[y[i]][best]++;
      if (best === y[i]) correct++;
    }
    return { accuracy: X.length ? correct / X.length : 0, confusion: cm };
  }

  async function runPipeline() {
    log.innerHTML = "";
    document.getElementById("charts").hidden = true;
    destroyCharts();
    var rows = CLEAN.rows, target = "engagement_level";
    var valid = rows.filter(function (r) { return String(r[target] || "").trim() !== ""; });
    if (valid.length < 20) {
      say("need at least 20 rows with an engagement_level column to train.", "wrk");
      return;
    }
    say("▸ encoding " + valid.length + " rows…", "wrk");
    await wait(30);
    var encoder = buildEncoder(valid, target);
    var classes = [];
    valid.forEach(function (r) {
      var c = String(r[target]).trim();
      if (classes.indexOf(c) < 0) classes.push(c);
    });
    classes.sort();
    var nClasses = classes.length;
    var X = [], y = [];
    valid.forEach(function (r) {
      X.push(encoder.encode(r));
      y.push(classes.indexOf(String(r[target]).trim()));
    });
    say("✓ " + X.length + " rows × " + encoder.features.length + " features · " + classes.join(" / "), "ok");

    /* stratified 80/20 split */
    var byClass = [], i, j;
    for (i = 0; i < nClasses; i++) byClass.push([]);
    for (i = 0; i < y.length; i++) byClass[y[i]].push(i);
    var trainIdx = [], testIdx = [];
    byClass.forEach(function (idxs) {
      for (i = idxs.length - 1; i > 0; i--) {
        j = (Math.random() * (i + 1)) | 0;
        var t = idxs[i]; idxs[i] = idxs[j]; idxs[j] = t;
      }
      var nTest = Math.max(1, Math.round(idxs.length * 0.2));
      for (i = 0; i < idxs.length; i++) (i < nTest ? testIdx : trainIdx).push(idxs[i]);
    });
    var trainX = trainIdx.map(function (k) { return X[k]; });
    var trainY = trainIdx.map(function (k) { return y[k]; });
    var testX = testIdx.map(function (k) { return X[k]; });
    var testY = testIdx.map(function (k) { return y[k]; });
    var allTrain = trainX.map(function (_, k) { return k; });
    say("✓ train " + trainX.length + " · test " + testX.length, "ok");

    /* decision tree depth sweep */
    say("▸ decision tree depth sweep…", "wrk");
    var depths = [2, 4, 6, 8, 10, 12, 15, 20];
    var curve = { depths: [], train: [], test: [] };
    var bestDepth = 2, bestAcc = -1, bestDt = null, bestDtCm = null;
    for (var d = 0; d < depths.length; d++) {
      var dt = trainTreeArrays(trainX, trainY, nClasses, allTrain,
        { maxDepth: depths[d], minLeaf: 2, mTry: encoder.features.length }, null);
      var tr = evaluateTrees([dt], trainX, trainY, nClasses);
      var te = evaluateTrees([dt], testX, testY, nClasses);
      curve.depths.push(depths[d]);
      curve.train.push(+tr.accuracy.toFixed(4));
      curve.test.push(+te.accuracy.toFixed(4));
      if (te.accuracy > bestAcc) { bestAcc = te.accuracy; bestDepth = depths[d]; bestDt = dt; bestDtCm = te.confusion; }
      say("  depth " + depths[d] + " → train " + tr.accuracy.toFixed(3) + " · test " + te.accuracy.toFixed(3), "inf");
      await wait(20);
    }
    say("✓ best depth " + bestDepth + " · test accuracy " + bestAcc.toFixed(4), "ok");

    /* random forest */
    var nTrees = X.length > 5000 ? 100 : 200;
    var mTry = Math.max(1, Math.floor(Math.sqrt(encoder.features.length)));
    say("▸ random forest · " + nTrees + " trees (mtry=" + mTry + ")…", "wrk");
    var rfTrees = [], importances = [];
    for (i = 0; i < encoder.features.length; i++) importances.push(0);
    for (var t = 0; t < nTrees; t++) {
      var bIdx = [];
      for (i = 0; i < trainX.length; i++) bIdx.push((Math.random() * trainX.length) | 0);
      rfTrees.push(trainTreeArrays(trainX, trainY, nClasses, bIdx,
        { maxDepth: 100, minLeaf: 2, mTry: mTry }, importances));
      if (t % 25 === 24 || t === nTrees - 1) {
        say("  " + (t + 1) + "/" + nTrees + " trees", "inf");
        await wait(20);
      }
    }
    var rfRes = evaluateTrees(rfTrees, testX, testY, nClasses);
    say("✓ rf test accuracy " + rfRes.accuracy.toFixed(4), "ok");
    var impSum = 0;
    for (i = 0; i < importances.length; i++) impSum += importances[i];
    var impPairs = encoder.features.map(function (n, k) {
      return [n, impSum > 0 ? importances[k] / impSum : 0];
    }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);

    /* swap in the freshly trained model */
    setActiveModel({
      classes: classes,
      features: encoder.features,
      preprocess: {
        medians: encoder.medians, clip: encoder.clip,
        cat_cols: encoder.catCols, categories: encoder.categories,
        num_cols: encoder.numCols
      },
      trees: rfTrees
    }, "your csv · " + X.length + " rows · " + nTrees + " trees");

    /* charts from the real run */
    var bal = {};
    classes.forEach(function (c, k) { bal[c] = byClass[k].length; });
    say("done. every number below came from training on your csv.", "inf");
    drawChartsFrom({
      classes: classes, classBalance: bal, depthCurve: curve,
      dt: { accuracy: bestAcc, confusion: bestDtCm, bestDepth: bestDepth },
      rf: { accuracy: rfRes.accuracy, confusion: rfRes.confusion, importances: impPairs },
      trainN: trainX.length, testN: testX.length
    });
    document.getElementById("charts").hidden = false;
  }

  /* ---------- charts (drawn from real training metrics) ---------- */
  Chart.defaults.color = "#52525b";
  Chart.defaults.borderColor = "#1d1d23";
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  var PALETTE = ["#f87171", "#fbbf24", "#4ade80", "#93c5fd", "#c4b5fd", "#f9a8d4"];
  function clsColor(i) { return PALETTE[i % PALETTE.length]; }

  function drawChartsFrom(m) {
    destroyCharts();
    var classes = m.classes;
    chartObjs.push(new Chart(document.getElementById("ch-balance"), {
      type: "bar",
      data: { labels: classes, datasets: [{ data: classes.map(function (k) { return m.classBalance[k] || 0; }),
        backgroundColor: classes.map(function (_, i) { return clsColor(i); }) }] },
      options: { plugins: { legend: { display: false } } }
    }));
    chartObjs.push(new Chart(document.getElementById("ch-depth"), {
      type: "line",
      data: { labels: m.depthCurve.depths, datasets: [
        { label: "train", data: m.depthCurve.train, borderColor: "#52525b", tension: .2 },
        { label: "test", data: m.depthCurve.test, borderColor: "#a3e635", tension: .2 } ] },
      options: { plugins: { legend: { position: "bottom" } }, scales: { y: { min: 0, max: 1 } } }
    }));
    chartObjs.push(new Chart(document.getElementById("ch-acc"), {
      type: "bar",
      data: { labels: ["decision tree", "random forest"],
        datasets: [{ data: [m.dt.accuracy, m.rf.accuracy], backgroundColor: ["#52525b", "#a3e635"] }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 1 } } }
    }));
    var imp = m.rf.importances.slice().reverse();
    chartObjs.push(new Chart(document.getElementById("ch-imp"), {
      type: "bar",
      data: { labels: imp.map(function (x) { return x[0]; }),
        datasets: [{ data: imp.map(function (x) { return x[1]; }), backgroundColor: "#a3e635" }] },
      options: { indexAxis: "y", plugins: { legend: { display: false } } }
    }));
    cmTable(document.getElementById("cm-dt"), m.dt.confusion, classes);
    cmTable(document.getElementById("cm-rf"), m.rf.confusion, classes);
  }
  function cmTable(el, cm, classes) {
    var flat = [];
    cm.forEach(function (row) { row.forEach(function (v) { flat.push(v); }); });
    var max = Math.max.apply(null, flat.concat([1]));
    var h = '<table><tr><th></th>' + classes.map(function (k) { return "<th>pred " + k + "</th>"; }).join("") + "</tr>";
    classes.forEach(function (rk, i) {
      h += "<tr><th>actual " + rk + "</th>" + classes.map(function (ck, j) {
        var v = cm[i][j], a = (.12 + .88 * v / max).toFixed(2);
        var col = i === j ? "61,220,132" : "255,107,107";
        return '<td style="background:rgba(' + col + "," + a + ');color:#0b0b0e">' + v + "</td>";
      }).join("") + "</tr>";
    });
    el.innerHTML = h + "</table>";
  }

  /* ---------- batch predict ---------- */
  document.getElementById("predictbtn").addEventListener("click", function () {
    if (!CLEAN) return;
    var classes = MODEL.classes;
    var rows = CLEAN.rows, counts = {}, agree = 0, hasActual = 0;
    classes.forEach(function (c) { counts[c] = 0; });
    var out = rows.map(function (r) {
      var p = predict(encodeRow(r));
      counts[p.cls] = (counts[p.cls] || 0) + 1;
      if (r.engagement_level) {
        hasActual++;
        if (String(r.engagement_level).trim() === p.cls) agree++;
      }
      return { r: r, p: p };
    });
    var el = document.getElementById("predsummary");
    el.hidden = false;
    el.innerHTML = classes.map(function (c) {
      return stat(counts[c] || 0, "predicted " + c.toLowerCase());
    }).join("") +
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

  /* ---------- playground (rebuilt for whichever model is active) ---------- */
  var state = {};
  function buildPlayground() {
    var c = document.getElementById("playcontrols");
    var pp = MODEL.preprocess;
    var h = "";
    state = {};
    var sliders = [];
    pp.num_cols.forEach(function (col) {
      var b = pp.clip[col] || [0, 100];
      var lo = Math.floor(b[0]), hi = Math.ceil(b[1]);
      if (lo === 0 && hi === 1) return; /* binary -> toggle */
      if (!(hi > lo)) { lo = 0; hi = 100; }
      var mid = Math.round((lo + hi) / 2);
      sliders.push([col, col.replace(/_/g, " "), lo, hi, mid]);
      state[col] = mid;
    });
    sliders.forEach(function (s) {
      h += '<div class="ctl"><label>' + s[1] + ' <b id="v-' + s[0] + '">' + s[4] + '</b></label>' +
           '<input type="range" id="s-' + s[0] + '" min="' + s[2] + '" max="' + s[3] + '" step="1" value="' + s[4] + '"></div>';
    });
    pp.num_cols.forEach(function (col) {
      var b = pp.clip[col] || [0, 1];
      if (!(Math.floor(b[0]) === 0 && Math.ceil(b[1]) === 1)) return;
      state[col] = 1;
      h += '<div class="ctl"><label>' + col.replace(/_/g, " ") + '</label><div class="seg" id="seg-' + col + '">' +
           '<button data-v="0">off</button><button data-v="1" class="on">on</button></div></div>';
    });
    pp.cat_cols.forEach(function (col) {
      var cats = pp.categories[col] || [];
      if (!cats.length) return;
      state[col] = cats[0];
      h += '<div class="ctl"><label>' + col.replace(/_/g, " ") + '</label><select id="d-' + col + '">' +
        cats.map(function (x) { return '<option value="' + x + '">' + x + "</option>"; }).join("") +
        "</select></div>";
    });
    c.innerHTML = h;
    sliders.forEach(function (s) {
      document.getElementById("s-" + s[0]).addEventListener("input", function (e) {
        state[s[0]] = +e.target.value;
        document.getElementById("v-" + s[0]).textContent = e.target.value;
        updatePlay();
      });
    });
    pp.num_cols.forEach(function (col) {
      var b = pp.clip[col] || [0, 1];
      if (!(Math.floor(b[0]) === 0 && Math.ceil(b[1]) === 1)) return;
      (function (cc) {
        document.querySelectorAll("#seg-" + cc + " button").forEach(function (btn) {
          btn.addEventListener("click", function () {
            document.querySelectorAll("#seg-" + cc + " button").forEach(function (x) { x.classList.remove("on"); });
            btn.classList.add("on");
            state[cc] = +btn.dataset.v;
            updatePlay();
          });
        });
      })(col);
    });
    pp.cat_cols.forEach(function (col) {
      (function (cc) {
        var sel = document.getElementById("d-" + cc);
        if (!sel) return;
        sel.value = state[cc];
        sel.addEventListener("change", function () { state[cc] = sel.value; updatePlay(); });
      })(col);
    });
    updatePlay();
  }
  function updatePlay() {
    var p = predict(encodeRow(state));
    var ci = MODEL.classes.indexOf(p.cls);
    var v = document.getElementById("verdict");
    v.className = "verdict";
    v.innerHTML = '<span class="vlabel" style="color:' + clsColor(ci) + '">' + p.cls + "</span>";
    document.getElementById("verdictsub").textContent = "predicted " + String(p.cls).toLowerCase();
    var trees = MODEL.trees.length;
    document.getElementById("treenote").textContent =
      Math.round(Math.max.apply(null, p.proba) * trees) + " of " + trees + " trees agree";
    var bars = document.getElementById("probars");
    bars.innerHTML = MODEL.classes.map(function (k, i) {
      var pct = Math.round(p.proba[i] * 100);
      return '<div class="prow"><span>' + k + '</span><div class="pbar"><i style="width:' + pct +
        '%;background:' + clsColor(i) + '"></i></div><span>' + pct + "%</span></div>";
    }).join("");
  }

  loadAll(function () {
    setActiveModel(MODEL, "pre-trained");
  });
})();
