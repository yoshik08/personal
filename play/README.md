# play — frontend

Static SPA for [yoshik.xyz/play](https://yoshik.xyz/play). Deploys with the personal vercel project.
A private, uploads-only personal music library — black premium UI, drag/drop upload,
library, player, synced lyrics.

## structure

```
index.html   shell, og tags, player bar, now-playing overlay
config.js    window.PLAY_API (backend base url), window.GOOGLE_CLIENT_ID
style.css    design system (matches yoshik.xyz dark theme)
js/
  core.js    utils, api client, local analytics, toast/modal
  auth.js    google sign-in (redirect flow, ios-safe) + jwt session + drive connect
  cache.js   indexeddb audio blob cache (lru, 300mb cap)
  player.js  global player singleton (queue, shuffle, repeat)
  lyrics.js  synced lyrics (word-level + line fallback)
  upload.js  drag/drop audio files -> drive -> library
  views.js   home (library) + settings
  app.js     hash router + shell wiring
```

## routing

Hash-based (`#/` home, `#/settings`) so static hosting never 404s on refresh.

## config

Edit `config.js` before deploy:
- `window.PLAY_API` → render backend url
- `window.GOOGLE_CLIENT_ID` → oauth client id

## audio flow

Uploads only — there is no search/stream catalogue and no third-party audio
fetching anywhere. `POST /api/songs` (JWT) sends the file to the backend, which
stores it in Yoshik's Google Drive (`yoshik-play` folder) and keeps metadata in
MongoDB. Playback is `GET /api/songs/:id/audio` (JWT): the backend streams from
Drive with Range support; the frontend caches the bytes in IndexedDB (300mb LRU)
and plays from a blob url. Spotify/iTunes are used metadata-only (names/artwork
for the upload matcher).

## drive

Drive auth is app-level and backend-only: settings → "connect drive" opens a
Google consent page (`drive.file` scope, offline access); the backend stores
the refresh token in mongo `app_config`. Users never touch Drive directly.

## notes

- per-route og tags aren't possible on a static SPA — index.html has generic /play tags.
- analytics is local-only (localStorage event log).
