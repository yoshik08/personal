// vercel serverless: GET /api/now-playing
// env needed: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
let cachedToken = null;
let tokenExpiresAt = 0;

export default async function handler(req, res) {
  const tStart = performance.now();
  res.setHeader("Cache-Control", "no-store");
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } =
    process.env;
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REFRESH_TOKEN) {
    return res.status(200).json({});
  }
  try {
    if (!cachedToken || Date.now() > tokenExpiresAt - 60000) {
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
      const data = await tok.json();
      if (!data.access_token) return res.status(200).json({});
      cachedToken = data.access_token;
      tokenExpiresAt = Date.now() + (data.expires_in || 3600) * 1000;
    }
    const auth = { Authorization: `Bearer ${cachedToken}` };

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

    const spSend = performance.now();
    const now = await fetch(
      "https://api.spotify.com/v1/me/player",
      { headers: auth }
    );
    const spRecv = performance.now();
    
    if (now.status === 429) {
      return res.status(200).json({ rateLimited: true, retryAfter: +now.headers.get("retry-after") || 10 });
    }
    if (now.status === 401) {
      cachedToken = null;
      return res.status(200).json({});
    }
    
    if (now.status === 200) {
      const d = await now.json();
      if (d && d.item) {
        const tOut = performance.now();
        return res.status(200).json({
          playing: d.is_playing,
          timestamp: Date.now(),
          deviceId: d.device ? d.device.id : null,
          deviceType: d.device ? d.device.type : null,
          ...pick(d.item, d),
          spotifyTs: d.timestamp || null,
          spotifyRtt: Math.round(spRecv - spSend),
          msSinceSpotifyResponse: Math.round(tOut - spRecv),
          serverHold: Math.round(tOut - tStart),
          serverNow: Date.now()
        });
      }
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
