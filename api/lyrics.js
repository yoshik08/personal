// vercel serverless: GET /api/lyrics?q=...
// proxies lrclib search so browsers never hit its per-ip rate limit directly.
// edge-cached for a day per query.
export default async function handler(req, res) {
  const q = String(req.query.q || "").slice(0, 200);
  if (!q) return res.status(400).json({ error: "q required" });
  try {
    const r = await fetch(
      "https://lrclib.net/api/search?q=" + encodeURIComponent(q),
      { headers: { "User-Agent": "yoshik.xyz/lyrics" } }
    );
    if (r.status === 429) return res.status(429).json({ error: "rate-limited" });
    if (!r.ok) return res.status(502).json({ error: "lyrics upstream failed" });
    const data = await r.json();
    res.setHeader(
      "Cache-Control",
      "s-maxage=86400, stale-while-revalidate=604800"
    );
    return res.json(data);
  } catch (e) {
    return res.status(502).json({ error: "lyrics upstream failed" });
  }
}
