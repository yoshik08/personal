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
  auth.js    google sign-in (redirect flow, ios-safe) + jwt session
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
MongoDB. Playback is `GET /api/songs/:id/audio?token=JWT`: the backend streams
from Drive with Range support and the browser plays/seeks immediately (the
`<audio>` element can't set Authorization headers, so the JWT goes in the query).
The frontend also fills an IndexedDB cache (300mb LRU) in the background for
instant replay. Spotify/iTunes are used metadata-only (names/artwork for the
upload matcher).

## drive

Drive is entirely server-side. The backend holds Yoshik's refresh token in the
`DRIVE_REFRESH_TOKEN` env var (minted once via `scripts/mint-drive-token.js` in
the backend repo). Users never see or touch Drive — no connect buttons, no
Drive OAuth in the app. Google login is for app identity only.

## notes

- per-route og tags aren't possible on a static SPA — index.html has generic /play tags.
- analytics is local-only (localStorage event log).
