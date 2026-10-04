# play — frontend

Static SPA for [yoshik.xyz/play](https://yoshik.xyz/play). Deploys with the personal vercel project.

## structure

```
index.html   shell, og tags, player bar, now-playing overlay
config.js    window.PLAY_API (backend base url), window.GOOGLE_CLIENT_ID
style.css    design system (matches yoshik.xyz dark theme)
js/
  core.js    utils, api client, local analytics, toast/modal
  auth.js    google identity services + jwt session
  cache.js   indexeddb audio blob cache (lru, 300mb cap)
  player.js  global player singleton (queue, shuffle, repeat, history)
  lyrics.js  synced lyrics (word-level + line fallback)
  views.js   all routes
  app.js     hash router + shell wiring
```

## routing

Hash-based (`#/search`) so static hosting never 404s on refresh.

## config

Edit `config.js` before deploy:
- `window.PLAY_API` → render backend url
- `window.GOOGLE_CLIENT_ID` → oauth client id

## audio flow

1. play pressed → IndexedDB lookup by track id
2. hit → blob url, instant play
3. miss → `GET /api/getmp3?q=artist+title` (shows "downloading…" with elapsed time,
   downloads can take 1–3 min on throttled connections) → store in IndexedDB → play
4. LRU eviction at 300mb, quota errors handled gracefully

## notes

- per-route og tags aren't possible on a static SPA — index.html has generic /play tags.
- analytics is local-only (localStorage event log, viewable in settings).
