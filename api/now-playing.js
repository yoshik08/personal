// TEMP DEBUG version - revert after diagnosing
export default async function handler(req, res) {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } = process.env;
  const dbg = { has_id: !!SPOTIFY_CLIENT_ID, has_secret: !!SPOTIFY_CLIENT_SECRET, has_rt: !!SPOTIFY_REFRESH_TOKEN,
    rt_len: (SPOTIFY_REFRESH_TOKEN || "").length, rt_prefix: (SPOTIFY_REFRESH_TOKEN || "").slice(0, 6) };
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REFRESH_TOKEN) return res.status(200).json({ dbg, err: "missing env" });
  try {
    const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
    const tok = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: SPOTIFY_REFRESH_TOKEN }),
    });
    dbg.token_status = tok.status;
    const tj = await tok.json();
    dbg.has_access = !!tj.access_token;
    dbg.token_err = tj.error || null;
    if (!tj.access_token) return res.status(200).json({ dbg });
    const auth = { Authorization: `Bearer ${tj.access_token}` };
    const now = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers: auth });
    dbg.now_status = now.status;
    if (now.status === 200) {
      const d = await now.json();
      if (d && d.item) return res.status(200).json({ dbg, playing: d.is_playing, title: d.item.name });
    }
    const recent = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=1", { headers: auth });
    dbg.recent_status = recent.status;
    const r = await recent.json();
    dbg.recent_count = (r.items || []).length;
    dbg.recent_err = r.error || null;
    if (r.items && r.items.length) return res.status(200).json({ dbg, playing: false, title: r.items[0].track.name });
    return res.status(200).json({ dbg });
  } catch (e) { return res.status(200).json({ dbg, err: String(e).slice(0, 120) }); }
}
