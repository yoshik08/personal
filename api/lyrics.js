// vercel serverless: GET /api/lyrics?artist=&title=&duration=&isrc=
// v2 shape: { v: 2, source, isrc, level: "word"|"line"|"plain",
//   lines: [{ start, end, text, words?: [{ text, start, end }], chorus? },
//           { interlude: true, start, end }] }
// 1. lrcmux (real word timestamps, no key) — word-level, words aligned to the
//    display text with normalized matching (no dropping on token mismatch).
// 2. lrclib search (line-level LRC) — fuzzy match, best duration fit.
// 3. plain lyrics — single static block, never time:0 per line.
// responses are edge-cached for a day per query; the v:2 field busts old shapes.

// normalized text for matching: lowercase, no apostrophes, no punctuation.
export const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[''`’]/g, "")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

// align lrcmux word timestamps to the display-text tokens. handles
// tokenization differences (trailing spaces, contraction splits like
// "dont" vs "don"+"t", punctuation). returns per-display-token
// [{ text, start, end }] (start/end null when a token can't be matched),
// or null when the line truly fails to align (< half the tokens matched),
// in which case the line falls back to line-level.
export function alignWords(lrcWords, displayText) {
  const L = (lrcWords || [])
    .filter((w) => w && w.text && String(w.text).trim())
    .map((w) => ({
      start: w.start,
      end: w.end,
      n: norm(w.text),
    }))
    .filter((w) => w.n.length);
  const D = String(displayText || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ text: t, n: norm(t) }));
  if (!L.length || !D.length) return null;

  const out = D.map((d) => ({ text: d.text, start: null, end: null }));
  let i = 0,
    j = 0,
    matched = 0;
  while (i < L.length && j < D.length) {
    const a = L[i].n,
      b = D[j].n;
    if (a === b) {
      out[j].start = L[i].start;
      out[j].end = L[i].end;
      matched++;
      i++;
      j++;
    } else if (b.startsWith(a)) {
      // display token spans several lrcmux tokens ("dont" vs "don"+"t")
      let acc = "",
        k = i;
      while (k < L.length && b.startsWith(acc + L[k].n)) {
        acc += L[k].n;
        k++;
      }
      if (acc === b) {
        out[j].start = L[i].start;
        out[j].end = L[k - 1].end;
        matched++;
        i = k;
        j++;
      } else {
        j++; // leave this token unaligned, keep the lrcmux tokens
      }
    } else if (a.startsWith(b)) {
      // lrcmux token runs words together ("ohohoh") — give the span to this token
      out[j].start = L[i].start;
      out[j].end = L[i].end;
      matched++;
      i++;
      j++;
    } else if (i + 1 < L.length && L[i + 1].n === b) {
      i++; // stray lrcmux token
    } else if (j + 1 < D.length && a === D[j + 1].n) {
      j++; // stray display token
    } else {
      i++;
      j++;
    }
  }
  if (matched < Math.ceil(D.length / 2)) return null;
  return out;
}

// interlude: gap >= 4s between one line's end and the next line's start
// gets an inline marker the frontend renders as breathing dots.
export function insertInterludes(lines) {
  const out = [];
  for (let k = 0; k < lines.length; k++) {
    out.push(lines[k]);
    const cur = lines[k],
      next = lines[k + 1];
    if (
      next &&
      cur.end != null &&
      next.start != null &&
      next.start - cur.end >= 4000
    ) {
      out.push({ interlude: true, start: cur.end, end: next.start });
    }
  }
  return out;
}

// chorus: normalized line text repeating >= 2 times gets chorus: true.
export function flagChorus(lines) {
  const counts = new Map();
  for (const ln of lines) {
    if (!ln.text) continue;
    const n = norm(ln.text);
    if (!n) continue;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  for (const ln of lines) {
    if (!ln.text) continue;
    if ((counts.get(norm(ln.text)) || 0) >= 2) ln.chorus = true;
  }
  return lines;
}

function backfillEnds(lines) {
  for (let k = 0; k < lines.length; k++) {
    if (lines[k].end == null)
      lines[k].end =
        lines[k + 1] && lines[k + 1].start != null
          ? lines[k + 1].start
          : lines[k].start;
  }
}

export default async function handler(req, res) {
  const artist = String(req.query.artist || "").slice(0, 200);
  const title = String(req.query.title || "").slice(0, 200);
  const duration = parseFloat(req.query.duration) || 0; // seconds
  const reqIsrc = String(req.query.isrc || "").trim().toUpperCase();
  if (!artist || !title)
    return res.status(400).json({ error: "artist and title required" });

  const cache = () =>
    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate=604800"
    );

  // 1. lrcmux — real word-level timestamps
  try {
    const r = await fetch(
      "https://api.lrcmux.dev/get?artist=" +
        encodeURIComponent(artist) +
        "&title=" +
        encodeURIComponent(title) +
        "&duration=" +
        Math.round(duration),
      { headers: { "User-Agent": "yoshik.xyz/lyrics" } }
    );
    if (r.ok) {
      const d = await r.json();
      const muxIsrc = String((d.track && d.track.isrc) || "").toUpperCase();
      const muxDur = (d.track && d.track.duration) || 0; // seconds
      // ISRC check: request isrc vs lrcmux track.isrc. mismatch AND duration
      // differs >3s => wrong track, fall through to lrclib.
      const isrcOk =
        !reqIsrc ||
        !muxIsrc ||
        muxIsrc === reqIsrc ||
        Math.abs(muxDur - duration) <= 3;
      if (
        isrcOk &&
        d &&
        d.meta &&
        d.meta.level === "word" &&
        Array.isArray(d.lines) &&
        d.lines.length
      ) {
        const lines = [];
        for (const ln of d.lines) {
          const text = String(ln.text || "").trim();
          if (!text) continue;
          const words = alignWords(ln.words, text); // null => line-level
          const line = { start: ln.start, end: ln.end, text };
          if (words) line.words = words;
          lines.push(line);
        }
        if (lines.length) {
          backfillEnds(lines);
          cache();
          return res.json({
            v: 2,
            source: (d.meta && d.meta.source) || "lrcmux", // passthrough
            isrc: (d.track && d.track.isrc) || reqIsrc || null,
            level: "word",
            lines: insertInterludes(flagChorus(lines)),
          });
        }
      }
    }
  } catch (e) {}

  // 2. lrclib fallback — line-level
  try {
    const q = encodeURIComponent(title + " " + artist.split(",")[0]);
    const r = await fetch("https://lrclib.net/api/search?q=" + q, {
      headers: { "User-Agent": "yoshik.xyz/lyrics" },
    });
    if (r.status === 429) return res.status(429).json({ error: "rate-limited" });
    const arr = r.ok ? await r.json() : [];
    let best = null,
      bestScore = Infinity;
    (arr || []).forEach((x) => {
      const score =
        Math.abs((x.duration || 0) - duration) + (x.syncedLyrics ? 0 : 1e9);
      if (score < bestScore) {
        bestScore = score;
        best = x;
      }
    });
    if (best && best.syncedLyrics) {
      let lines = parseLRC(best.syncedLyrics, Math.round(duration * 1000));
      if (lines.length) {
        cache();
        return res.json({
          v: 2,
          source: "lrclib",
          isrc: reqIsrc || null,
          level: "line",
          lines: insertInterludes(flagChorus(lines)),
        });
      }
    }
    if (best && best.plainLyrics) {
      cache();
      // plain: single static block — frontend renders it statically.
      return res.json({
        v: 2,
        source: "lrclib",
        isrc: reqIsrc || null,
        level: "plain",
        lines: [
          {
            start: 0,
            end: Math.round(duration * 1000),
            text: String(best.plainLyrics).trim(),
          },
        ],
      });
    }
    return res.json({
      v: 2,
      source: "none",
      isrc: reqIsrc || null,
      level: "plain",
      lines: [],
    });
  } catch (e) {
    return res.status(502).json({ error: "lyrics upstream failed" });
  }
}

function parseLRC(lrc, durationMs) {
  const lines = [];
  lrc.split("\n").forEach((raw) => {
    const times = [];
    const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    let m;
    while ((m = re.exec(raw))) {
      const frac = m[3] || "0";
      const mult = frac.length === 3 ? 1 : frac.length === 2 ? 10 : 100;
      times.push(+m[1] * 60000 + +m[2] * 1000 + +frac * mult);
    }
    const text = raw
      .replace(/\[.*?\]/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (!text || !times.length) return;
    times.forEach((t) => lines.push({ time: t, text }));
  });
  lines.sort((a, b) => a.time - b.time);
  const deduped = lines.filter((l, i) => i === 0 || l.time !== lines[i - 1].time);
  return deduped.map((l, i) => ({
    start: l.time,
    end:
      i + 1 < deduped.length
        ? deduped[i + 1].time
        : durationMs || l.time,
    text: l.text,
  }));
}
