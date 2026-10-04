// vercel serverless: GET /api/discord
// proxies lanyard server-side so the browser never hits a third party
// (no third-party cookies, no extra dns/tls on the client).
const DISCORD_ID = "746561388612157460";

export default async function handler(req, res) {
  try {
    const r = await fetch("https://api.lanyard.rest/v1/users/" + DISCORD_ID, {
      headers: { "User-Agent": "yoshik.xyz" },
    });
    if (!r.ok) return res.status(200).json({});
    const j = await r.json();
    if (!j || !j.success || !j.data) return res.status(200).json({});
    const u = j.data.discord_user || {};
    const s = j.data.discord_status || "offline";
    const ext = u.avatar && u.avatar.indexOf("a_") === 0 ? "gif" : "png";
    res.setHeader("Cache-Control", "s-maxage=25, stale-while-revalidate=25");
    return res.status(200).json({
      username: u.global_name || u.username || "x04_",
      status: s,
      avatar: u.avatar
        ? "https://cdn.discordapp.com/avatars/" + DISCORD_ID + "/" + u.avatar + "." + ext + "?size=128"
        : null,
    });
  } catch {
    return res.status(200).json({});
  }
}
