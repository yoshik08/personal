// TEMPORARY one-time spotify code exchange. delete after use.
export default async function handler(req, res) {
  const code = req.query.code;
  if (!code) return res.status(400).json({ ok: false, error: "no code" });
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://yoshik.xyz/callback",
    }),
  });
  const j = await r.json();
  if (j.refresh_token) return res.status(200).json({ ok: true, refresh_token: j.refresh_token });
  return res.status(400).json({ ok: false, detail: j });
}
