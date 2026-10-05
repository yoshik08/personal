// vercel serverless: GET /api/now-playing
// env needed: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN

// module-scope access-token cache: warm lambdas reuse the token until ~60s
// before it expires instead of minting one per request (polls ~1s -> ~300ms).
let cachedToken = null;
let tokenExpiresAt = 0; // Date.now() ms at which we must refresh

async function getAccessToken(clientId, clientSecret, refreshToken) {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) return cachedToken;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tok = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const { access_token, expires_in } = await tok.json();
  if (!access_token) {
    cachedToken = null;
    tokenExpiresAt = 0;
    return null;
  }
  cachedToken = access_token;
  // expires_in is seconds; refresh 60s early so warm lambdas never race expiry
  tokenExpiresAt = Date.now() + (expires_in || 3600) * 1000;
  return cachedToken;
}

export default async function handler(req, res) {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN } =
    process.env;
  // per-user live state: never cache any response from this endpoint
  const send = (body) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(body);
  };
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REFRESH_TOKEN) {
    return send({});
  }
  try {
    const accessToken = await getAccessToken(
      SPOTIFY_CLIENT_ID,
      SPOTIFY_CLIENT_SECRET,
      SPOTIFY_REFRESH_TOKEN
    );
    if (!accessToken) return send({});
    const auth = { Authorization: `Bearer ${accessToken}` };

    const pick = (t, outer) => ({
      trackId: t.id || null,
      title: t.name,
      artist: (t.artists || []).map((a) => a.name).join(", "),
      artists: (t.artists || []).map((a) => ({
        name: a.name,
        url: a.external_urls ? a.external_urls.spotify : null,
      })),
      isrc: (t.external_ids && t.external_ids.isrc) || null,
      image: t.album && t.album.images && t.album.images.length
        ? (t.album.images[1] || t.album.images[0]).url
        : null,
      url: t.external_urls ? t.external_urls.spotify : null,
      progressMs: outer ? outer.progress_ms : null,
      durationMs: t.duration_ms || null,
    });

    // serverHoldMs: ms between receiving Spotify's currently-playing response
    // and sending ours — the client RTT-anchors progressMs with it.
    const now = await fetch(
      "https://api.spotify.com/v1/me/player/currently-playing",
      { headers: auth }
    );
    const recvMs = Date.now(); // spotify response received
    if (now.status === 200) {
      const d = await now.json();
      /* timestamp anchors progressMs: the client adds (now - timestamp) so the
         local clock accounts for transit time between Spotify and the browser */
      if (d && d.item)
        return send({
          playing: d.is_playing,
          timestamp: Date.now(),
          serverHoldMs: Date.now() - recvMs,
          ...pick(d.item, d),
        });
    }
    // nothing playing right now: fall back to last played
    const recent = await fetch(
      "https://api.spotify.com/v1/me/player/recently-played?limit=1",
      { headers: auth }
    );
    const recentRecvMs = Date.now(); // spotify response received
    const r = await recent.json();
    if (r.items && r.items.length)
      return send({
        playing: false,
        timestamp: Date.now(),
        serverHoldMs: Date.now() - recentRecvMs,
        ...pick(r.items[0].track),
      });
    return send({});
  } catch {
    return send({});
  }
}
