// vercel serverless: GET /api/now-playing
// env needed: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
export default async function handler(req, res) {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } =
    process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REFRESH_TOKEN) {
    return res.status(200).json({});
  }
  try {
    const basic = Buffer.from(
      `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
    ).toString("base64");

    const tok = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: SPOTIFY_REFRESH_TOKEN,
      }),
    });
    const { access_token } = await tok.json();
    if (!access_token) return res.status(200).json({});
    const auth = { Authorization: `Bearer ${access_token}` };

    const pick = (t, outer) => ({
      trackId: t.id || null,
      title: t.name,
      artist: (t.artists || []).map((a) => a.name).join(", "),
      artists: (t.artists || []).map((a) => ({
        name: a.name,
        url: a.external_urls ? a.external_urls.spotify : null,
      })),
      image: t.album && t.album.images && t.album.images.length
        ? t.album.images[0].url
        : null,
      url: t.external_urls ? t.external_urls.spotify : null,
      progressMs: outer ? outer.progress_ms : null,
      durationMs: t.duration_ms || null,
    });

    const now = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers: auth }
    );
    if (now.status === 200) {
      const d = await now.json();
      /* timestamp anchors progressMs: the client adds (now - timestamp) so the
         local clock accounts for transit time between Spotify and the browser */
      if (d && d.item) return res.status(200).json({ playing: d.is_playing, timestamp: Date.now(), ...pick(d.item, d) });
    }
    // nothing playing right now: fall back to last played
    const recent = await fetch(
      "https://api.spotify.com/v1/me/player/recently-played?limit=1",
      { headers: auth }
    );
    const r = await recent.json();
    if (r.items && r.items.length)
      return res.status(200).json({ playing: false, timestamp: Date.now(), ...pick(r.items[0].track) });
    return res.status(200).json({});
  } catch {
    return res.status(200).json({});
  }
}
