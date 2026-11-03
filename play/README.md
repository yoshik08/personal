# play — frontend

Static SPA for [yoshik.xyz/play](https://yoshik.xyz/play), deployed with the personal
Vercel project. A private, uploads-only music library. No build step: plain ES modules.

## structure

```
index.html   shell + mount points
config.js    window.PLAY_API, window.GOOGLE_CLIENT_ID (localhost: ?api=http://localhost:3000)
style.css    design system — AMOLED black, Archivo (expanded) display, Geist UI
js/
  app.js      router, player dock, now playing, drag & drop, keyboard
  core.js     dom helpers, event bus, api client (cold-start aware), toasts, sheets, menus
  auth.js     google sign-in (redirect flow, state-checked) + drive-mint code screen
  library.js  songs + playlists store
  player.js   one <audio>, queue, shuffle/repeat, media session, resume on reload
  lyrics.js   synced lyrics: word fill (lrcmux) / line (lrclib), interlude dots
  upload.js   id3 + filename parsing, cover matching, review sheet, upload tray
  views.js    library, playlists, playlist, settings, landing
  art.js      generative covers + accent colour from artwork
  cache.js    indexeddb offline copies (lru, 300mb)
  icons.js    phosphor icons (regular + fill)
```

Motion uses anime.js 4 (`/assets/vendor/anime-4.5.0.umd.min.js`) and CSS springs;
everything stands down for Settings → Motion → Off or prefers-reduced-motion.
Fonts live in `/assets/fonts/play/`.

## routes

`#/` library · `#/playlists` · `#/playlist/:id` · `#/settings`

## drive token minting

`scripts/mint-drive-token.js` (backend repo) sends Google back here with
`state=drive-mint`; the page shows the code with a copy button instead of
spending it as a sign-in.
