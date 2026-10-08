// vercel serverless: GET /api/lyrics?artist=&title=&duration=&mode=line|word
// Three providers queried in parallel, each with a 4s timeout.
// mode=line  → race: first provider with synced lyrics wins.
// mode=word  → priority: lrcmux word > netease word > wordSync:false.
// responses are edge-cached for a day per query+mode.
export default async function handler(req, res) {
  const artist = String(req.query.artist || "").slice(0, 200);
  const title = String(req.query.title || "").slice(0, 200);
  const duration = parseFloat(req.query.duration) || 0; // seconds
  const mode = req.query.mode === "word" ? "word" : "line";
  if (!artist || !title)
    return res.status(400).json({ error: "artist and title required" });

  res.setHeader(
    "Cache-Control",
    "s-maxage=3600, stale-while-revalidate=86400"
  );

  const TIMEOUT = 4000;
  const ac = (ms) => {
    const c = new AbortController();
    setTimeout(() => c.abort(), ms);
    return c.signal;
  };

  // --- Provider fetchers (all return a normalized result or null) ---

  async function fetchLrcmux() {
    try {
      const r = await fetch(
        "https://api.lrcmux.dev/get?artist=" +
          encodeURIComponent(artist) +
          "&title=" + encodeURIComponent(title) +
          "&duration=" + Math.round(duration),
        { headers: { "User-Agent": "yoshik.xyz/lyrics" }, signal: ac(TIMEOUT) }
      );
      if (!r.ok) return null;
      const d = await r.json();
      if (!d || !d.meta || !Array.isArray(d.lines) || !d.lines.length) return null;
      const isWord = d.meta.level === "word";
      const lines = [];
      d.lines.forEach((ln) => {
        const text = (ln.text || "").trim();
        if (!text) return;
        const textWords = text.split(/\s+/);
        let wordStarts = null;
        if (isWord) {
          const ws = (ln.words || []).filter((w) => w.text && w.text.trim()).map((w) => w.start);
          wordStarts = ws.length === textWords.length ? ws : null;
        }
        lines.push({ time: ln.start, text, words: wordStarts });
      });
      if (!lines.length) return null;
      const hasWord = lines.some((l) => l.words);
      return { source: "lrcmux", wordSync: hasWord, lines };
    } catch { return null; }
  }

  async function fetchNetease() {
    try {
      const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      const hdr = { Referer: "https://music.163.com", "User-Agent": UA };

      // search
      const cleanTitle = title.replace(/['']/g, "'");
      const q = encodeURIComponent(cleanTitle + " " + artist.split(",")[0]);
      const sr = await fetch(
        "https://music.163.com/api/cloudsearch/pc?s=" + q + "&type=1&limit=10",
        { headers: hdr, signal: ac(TIMEOUT) }
      );
      if (!sr.ok) return null;
      const sd = await sr.json();
      const songs = sd.result?.songs;
      if (!songs || !songs.length) return null;

      // pick best match
      const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
      const titleN = norm(cleanTitle);
      const artistN = norm(artist.split(",")[0]);
      const durMs = duration * 1000;
      let bestId = null, bestScore = Infinity;
      for (const s of songs) {
        const sTitle = norm(s.name || "");
        const sArtist = norm((s.ar || s.artists || [])[0]?.name || "");
        // title must fuzzy match
        if (!sTitle.includes(titleN) && !titleN.includes(sTitle)) continue;
        // artist must fuzzy match
        if (!sArtist.includes(artistN) && !artistN.includes(sArtist)) continue;
        const sDur = s.dt || s.duration || 0;
        const score = durMs > 0 ? Math.abs(sDur - durMs) : 0;
        if (score < bestScore) { bestScore = score; bestId = s.id; }
      }
      if (!bestId || (durMs > 0 && bestScore > 3000)) return null;

      // fetch lyrics
      const lr = await fetch(
        "https://music.163.com/api/song/lyric?id=" + bestId + "&lv=-1&kv=-1&tv=-1&yv=-1",
        { headers: hdr, signal: ac(TIMEOUT) }
      );
      if (!lr.ok) return null;
      const ld = await lr.json();

      // word-level: yrc
      if (ld.yrc?.lyric) {
        const lines = parseYRC(ld.yrc.lyric);
        if (lines.length) return { source: "netease", wordSync: true, lines };
      }
      // line-level fallback: lrc
      if (ld.lrc?.lyric) {
        const lines = parseLRC(ld.lrc.lyric).map((l) => ({ time: l.time, text: l.text, words: null }));
        if (lines.length) return { source: "netease", wordSync: false, lines };
      }
      return null;
    } catch { return null; }
  }

  async function fetchLrclib() {
    try {
      const q = encodeURIComponent(title + " " + artist.split(",")[0]);
      const r = await fetch("https://lrclib.net/api/search?q=" + q, {
        headers: { "User-Agent": "yoshik.xyz/lyrics" },
        signal: ac(TIMEOUT),
      });
      if (r.status === 429) return { rateLimited: true };
      const arr = r.ok ? await r.json() : [];
      let best = null, bestScore = Infinity;
      (arr || []).forEach((x) => {
        const diff = duration > 0 ? Math.abs((x.duration || 0) - duration) : 0;
        if (duration > 0 && diff > 3) return;
        const score = diff + (x.syncedLyrics ? 0 : 1e9);
        if (score < bestScore) { bestScore = score; best = x; }
      });
      if (best && best.syncedLyrics) {
        const lines = parseLRC(best.syncedLyrics).map((l) => ({ time: l.time, text: l.text, words: null }));
        if (lines.length) return { source: "lrclib", wordSync: false, lines };
      }
      if (best && best.plainLyrics) {
        return { source: "lrclib", wordSync: false, plain: best.plainLyrics };
      }
      return null;
    } catch { return null; }
  }

  // --- Dispatch based on mode ---
  try {
    if (mode === "word") {
      // Priority: lrcmux word → netease word → wordSync:false
      const [lrcmux, netease] = await Promise.all([fetchLrcmux(), fetchNetease()]);
      if (lrcmux && lrcmux.wordSync) return res.json(lrcmux);
      if (netease && netease.wordSync) return res.json(netease);
      return res.json({ source: "none", wordSync: false, lines: [] });
    } else {
      const [lrcmux, lrclib, netease] = await Promise.all([fetchLrcmux(), fetchLrclib(), fetchNetease()]);
      if (lrcmux && lrcmux.lines && lrcmux.lines.length) return res.json(lrcmux);
      if (lrclib && lrclib.lines && lrclib.lines.length) return res.json(lrclib);
      if (netease && netease.lines && netease.lines.length) return res.json(netease);
      if (lrclib && lrclib.plain) return res.json(lrclib);
      if (lrclib && lrclib.rateLimited) return res.status(429).json({ error: "rate-limited" });
      return res.json({ source: "none", lines: [] });
    }
  } catch {
    return res.status(502).json({ error: "lyrics upstream failed" });
  }
}

// Parse NetEase YRC word-level format
// Lines: [lineStartMs,lineDurMs](chunkStartMs,chunkDurMs,0)text(...)text...
// Syllable chunks without spaces are merged into one word; use first chunk's start.
function parseYRC(yrc) {
  const CREDIT = /^[{（]|^制作|^作词|^作曲|^编曲|^混音|^母带|^录音|^和声|^出品|^监制|^Produced|^Written|^Composed|^Arranged/i;
  const lines = [];
  yrc.split("\n").forEach((raw) => {
    raw = raw.trim();
    if (!raw) return;
    // parse line header [lineStart,lineDur]
    const hdr = raw.match(/^\[(\d+),(\d+)\]/);
    if (!hdr) return;
    const lineStart = parseInt(hdr[1]);
    // parse word chunks: (startMs,durMs,0)text
    const chunks = [];
    const re = /\((\d+),(\d+),\d+\)([^(]*)/g;
    let m;
    while ((m = re.exec(raw))) {
      const text = m[3];
      if (text) chunks.push({ start: parseInt(m[1]), text });
    }
    if (!chunks.length) return;
    // join all text
    const fullText = chunks.map((c) => c.text).join("").trim();
    if (!fullText) return;
    // skip credit/metadata lines
    if (CREDIT.test(fullText)) return;

    // Merge chunks into words: when consecutive chunks have no space between them,
    // they're syllables of the same word. Use first chunk's start for the word.
    const words = []; // { text, start }
    let curWord = { text: chunks[0].text, start: chunks[0].start };
    for (let i = 1; i < chunks.length; i++) {
      const prev = curWord.text;
      const chunk = chunks[i];
      // if previous chunk ended with space or this chunk starts with space, new word
      if (prev.endsWith(" ") || chunk.text.startsWith(" ")) {
        words.push({ text: curWord.text.trim(), start: curWord.start });
        curWord = { text: chunk.text.trimStart(), start: chunk.start };
      } else {
        curWord.text += chunk.text;
      }
    }
    if (curWord.text.trim()) words.push({ text: curWord.text.trim(), start: curWord.start });
    // filter empty
    const filtered = words.filter((w) => w.text);
    if (!filtered.length) return;

    // Build our output: text from joined words, starts array
    const text = filtered.map((w) => w.text).join(" ");
    const textWords = text.split(/\s+/);
    const starts = filtered.map((w) => w.start);

    lines.push({
      time: lineStart,
      text,
      words: starts.length === textWords.length ? starts : null,
    });
  });
  return lines;
}

function parseLRC(lrc) {
  const lines = [];
  let offset = 0;
  const offsetMatch = lrc.match(/\[offset:(-?\d+)\]/i);
  if (offsetMatch) offset = parseInt(offsetMatch[1]) || 0;

  lrc.split("\n").forEach((raw) => {
    const times = [];
    const re = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    let m;
    while ((m = re.exec(raw))) {
      const frac = m[3] || "0";
      const mult = frac.length === 3 ? 1 : frac.length === 2 ? 10 : 100;
      let t = +m[1] * 60000 + +m[2] * 1000 + +frac * mult;
      t -= offset;
      times.push(t);
    }
    const text = raw.replace(/\[.*?\]/g, "").replace(/<[^>]*>/g, "").trim();
    if (!text || !times.length) return;
    times.forEach((t) => lines.push({ time: t, text }));
  });
  lines.sort((a, b) => a.time - b.time);
  return lines.filter((l, i) => i === 0 || l.time !== lines[i - 1].time);
}
