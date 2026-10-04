// vercel serverless: /api/type-leaderboard
// global typing-test leaderboard backed by mongodb.
// GET  -> { scores: [{ name, wpm, acc, ts }] } (top 50 by wpm)
// POST -> { name, wpm, acc } saves a score
// env needed: MONGODB_URI
import { MongoClient } from "mongodb";

let client = null;
let indexed = false;

async function col() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("missing MONGODB_URI");
  if (!client) {
    client = new MongoClient(uri, { maxPoolSize: 5 });
    await client.connect();
  }
  const c = client.db("yoshikxyz").collection("type_scores");
  if (!indexed) {
    await c.createIndex({ wpm: -1 }).catch(() => {});
    indexed = true;
  }
  return c;
}

export default async function handler(req, res) {
  try {
    const c = await col();
    /* TEMPORARY: one-time cleanup of the verifybot test doc — remove this branch after */
    if (req.method === "DELETE") {
      if (req.query.token !== "tmp-cleanup-9f3k7q2m") return res.status(403).json({ error: "no" });
      const r = await c.deleteMany({ name: "verifybot" });
      return res.status(200).json({ deleted: r.deletedCount });
    }
    if (req.method === "POST") {
      const body = req.body || {};
      const name = String(body.name || "")
        .toLowerCase()
        .slice(0, 16)
        .replace(/[^a-z0-9 _-]/g, "")
        .trim();
      const wpm = Math.round(Number(body.wpm));
      const acc = Math.round(Number(body.acc));
      if (!name || !(wpm >= 0 && wpm <= 300) || !(acc >= 0 && acc <= 100))
        return res.status(400).json({ error: "bad score" });
      await c.insertOne({ name, wpm, acc, ts: Date.now() });
      return res.status(200).json({ ok: true });
    }
    const scores = await c
      .find({}, { projection: { _id: 0 } })
      .sort({ wpm: -1 })
      .limit(50)
      .toArray();
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json({ scores });
  } catch (e) {
    return res.status(500).json({ error: "leaderboard unavailable" });
  }
}
