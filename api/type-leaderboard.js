// vercel serverless: /api/type-leaderboard
// global typing-test leaderboard backed by mongodb.
// one row per name — only a personal best overwrites the stored score.
// GET  -> { scores: [{ name, wpm, acc, ts }] } (top 50 by wpm)
// POST -> { name, wpm, acc } stores iff it beats the name's best
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
    await c.createIndex({ name: 1 }, { unique: true }).catch(() => {});
    await c.createIndex({ wpm: -1 }).catch(() => {});
    indexed = true;
  }
  return c;
}

function cleanName(raw) {
  return String(raw || "")
    .toLowerCase()
    .slice(0, 16)
    .replace(/[^a-z0-9 _-]/g, "")
    .trim();
}

export default async function handler(req, res) {
  try {
    const c = await col();

    /* TEMPORARY one-time dupe purge — remove this branch after cleanup */
    if (req.method === "DELETE" && req.query.token === "tmp-dedupe-4x8k2n") {
      const all = await c
        .find({}, { projection: { _id: 1, name: 1, wpm: 1 } })
        .sort({ wpm: -1 })
        .toArray();
      const seen = new Set();
      const dupIds = [];
      for (const d of all) {
        if (seen.has(d.name)) dupIds.push(d._id);
        else seen.add(d.name);
      }
      const r = dupIds.length
        ? await c.deleteMany({ _id: { $in: dupIds } })
        : { deletedCount: 0 };
      return res.status(200).json({ removed: r.deletedCount });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const name = cleanName(body.name);
      const wpm = Math.round(Number(body.wpm));
      const acc = Math.round(Number(body.acc));
      if (!name || !(wpm >= 0 && wpm <= 300) || !(acc >= 0 && acc <= 100))
        return res.status(400).json({ error: "bad score" });
      const existing = await c.findOne({ name }, { projection: { wpm: 1 } });
      if (!existing || wpm > existing.wpm) {
        await c.updateOne(
          { name },
          { $set: { name, wpm, acc, ts: Date.now() } },
          { upsert: true }
        );
        return res.status(200).json({ ok: true, best: true });
      }
      return res.status(200).json({ ok: true, best: false });
    }

    /* dedupe by name as a safety net — best score per name wins */
    const scores = await c
      .aggregate([
        { $sort: { wpm: -1 } },
        {
          $group: {
            _id: "$name",
            wpm: { $first: "$wpm" },
            acc: { $first: "$acc" },
            ts: { $first: "$ts" },
          },
        },
        { $sort: { wpm: -1 } },
        { $limit: 50 },
        { $project: { _id: 0, name: "$_id", wpm: 1, acc: 1, ts: 1 } },
      ])
      .toArray();
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json({ scores });
  } catch (e) {
    return res.status(500).json({ error: "leaderboard unavailable" });
  }
}
