/* backend base url. on localhost you can point at a local api with ?api=http://localhost:3000 */
window.PLAY_API = "https://play-api-n8hk.onrender.com";
(function () {
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  try {
    var q = new URLSearchParams(location.search).get("api");
    if (q) localStorage.setItem("play_api_dev", q);
    var dev = localStorage.getItem("play_api_dev");
    if (dev) window.PLAY_API = dev;
  } catch (e) {}
})();
/* google oauth client id */
window.GOOGLE_CLIENT_ID = "546501001990-gb8pfs0bupc8jt3anocosal4q7kvf3ld.apps.googleusercontent.com";
