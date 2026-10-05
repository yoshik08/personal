# Lyrics V2 — Design Doc

Branch: `lyrics-v2`. Target: make the homepage lyrics overlay (the thing behind the "lyrics" button on the Spotify now-playing card) feel better than Apple Music fullscreen and much better than Spotify.

**SCOPE (2026-10-05 cut): homepage Surface A only.** No /play work: no AudioElementClock, no /play tick fixes, no /play fullscreen lyrics view, no S5. One surface, same quality bar.

## 1. Current-state map (verified at 7207a09)

Section 1 of the master prompt is accurate. Line-number drift noted:
- `createPlaybackClock` at script.js:274 (prompt said ~267) — logic as described
- `findLyricIndex` at :341 ✓, `spotifyAnchorMs` at :373 ✓
- Poll logic at :442-446 (prompt said 463-473)
- Overlay at :476-734 (prompt said 475-735)
- `api/lyrics.js` drops word `end`, line `end`, `meta.source`, `track.isrc`; nulls words on token-count mismatch ✓
- `api/now-playing.js` mints token per request, `timestamp: Date.now()` ✓
- `play/js/lyrics.js`: `time: 0` for plain (L33), per-frame `querySelectorAll` (L98,128,136,139), per-frame `scrollTo` (L153) ✓
- Fonts: HankenGrotesk-400.woff2 (variable 100-900), JetBrains Mono ×2 ✓

No other drift. The map is trusted.

## 2. Research summary

Key sources (full list in master prompt §C2):
- **AMLL** (AGPL-3.0, study only): spring line layout (mass 0.9, damping 15, stiffness 90), word mask gradient with 0.5em feather, emphasis glow for words ≥1s and ≤7 chars, interlude dots, duet/bg lines.
- **Beautiful Lyrics** (Spicetify): per-syllable springs, scale 0.95→1.025 at 70%→1.0, Y lift −1/60em at 90%, glow peaks 15% holds to 60%.
- **Apple web player bg** (aadishv.dev): 4 art copies (25/50/80/125% vw), rotate+orbit, twist, Kawase blur, 15fps max, low-power context.
- **Verci**: word-at-a-time, album palette, wake lock.
- **Sync craft**: `timeupdate` is 4-66Hz (use rAF); `currentTime` can repeat; `AudioContext.outputLatency` for Bluetooth.

## 3. Font decision

**Decision: system SF on Apple (`-apple-system`), Hanken Grotesk 800 elsewhere. No new font download.**

Rationale:
- Hanken Grotesk variable (100-900) is already self-hosted and loaded — zero bytes, zero FOUT, instant.
- At 800 weight with −0.022em tracking and 1.12 line-height it carries the heavy/tight Apple feel.
- Inter opsz32 is closer to SF but costs ~90KB and a preload dance; the win is marginal at display sizes.
- Geist is nice but adds a download for little gain over Hanken.
- Apple devices get real SF Pro free via `-apple-system` (legal, not served).

Stack: `-apple-system, BlinkMacSystemFont, "Hanken Grotesk", system-ui, sans-serif`.

Caveat: the side-by-side strip vs SF Pro needs a real browser; flagged for QA in the milestone report.

Tokens (desktop fullscreen): size `clamp(30px, 3.6vw + 8px, 60px)`; weight 800; line-height 1.12; letter-spacing −0.022em; max-width ~20ch; `text-wrap: balance`; line gap 0.55em. Mobile: 30-34px, 7vw padding.
Inactive: rgba(255,255,255,.34); active #fff. Contrast guard darkens scrim to 7:1 / 3:1.
Devanagari: lazy-load Mukta via unicode-range when U+0900–097F detected. CJK: system fonts.

## 4. Spring presets

Semi-implicit Euler, 1/120s substeps, retargetable, velocity-preserving, sleep under epsilon.

| Target | mass | stiffness | damping | notes |
|---|---|---|---|---|
| Line Y (scroll) | 0.9 | 90–110 | 15–17 | stagger 35ms/line outward from active, interruptible |
| Active scale | — | — | — | 0.97 → 1.0, transform-origin left center, never font-size |
| Emphasis glow | spring | — | — | fast rise 15%, hold, decay; per-letter stagger du/2.5/n |

Word wipe: `--p` CSS var (registered via `@property`, `<percentage>`), gradient mask with 0.5em feather, linear in time.
Opacity by distance: d=0 → 1.0; |d|=1 → 0.42; ≥2 → 0.30. Blur 0/1/2/3px capped |d|≤3, opacity-only on mobile/low-end.
Interlude dots: 1.6s breathe cycle, fill in sequence, collapse 300ms before next line.
UI one-offs: CSS `linear()` spring easings, ~200ms, `cubic-bezier(.16,1,.3,1)` fallback.

Reduced motion: no springs/scale/blur/glow/stagger. 120ms opacity crossfade, jump scroll, discrete word color. Word data still used. Static background.

## 5. Architecture

`assets/lyrics/engine.js` + `assets/lyrics/engine.css` → `window.LyricsEngine`, ES5-compatible classic script.
`LyricsEngine.create({ container, clock, mode, motion })` → `{ setLyrics(data), open(), close(), destroy(), setOffset(ms) }`.

Clocks:
- `SpotifyRemoteClock`: wraps createPlaybackClock, upgraded — RTT anchor (t0/t1 + serverHoldMs), slewing ±6%, hard-snap >1.5s, 3 rapid re-polls on seek, adaptive polling (3-4s overlay open / 10-15s card / paused hidden). The engine accepts any `{ now(), playing(), onSeek(), onRate() }` clock; only the Spotify one is built.

Data model: `{ source, isrc, level: "word"|"line"|"plain", lines: [{ start, end, text, words?: [{ text, start, end }], chorus? }] }`.

Render contract: build DOM once per track. Steady state: zero layout reads; writes only to transform/opacity/CSS vars. One rAF loop; sleeps when settled+paused; dies on close/hide.

## 6. P0 plan (homepage only)

1. **API** (`api/`): now-playing token cache + serverHoldMs + isrc; lyrics keeps end times, aligns words (no drop), interlude markers (gap ≥4s), chorus flags, plain → `level:"plain"` static, cache key `v=2`. ✅ DONE
2. **Engine** (`assets/lyrics/`): spring module, engine.js, engine.css per §5.
3. **Homepage**: SpotifyRemoteClock (RTT anchor, slewing, adaptive polling, prefetch on track change), overlay rewritten on engine, S1 karaoke line in card.
4. **Sync lab** (`lyrics-lab.html`): Web Audio clicks on synthetic word timeline, performance.mark comparison. Engine-level, mock clock.
5. **Surprises**: S1 (card karaoke), S2 (desk mode + wake lock), S4 (share poster).

## 7. P1 / P2 (homepage only)

P1: WebGL album bg + palette, fullscreen and layout polish, open/close shared-element transition, Devanagari fallback.
P2: S3 chorus lift. Duet/bg vocal layout if data provides it. Translation toggle for non-English tracks.

## 8. Verification limits (honest)

This environment has no live browser. What I can verify: code correctness (node --check, logic review), API behavior (curl vs live endpoints), static structure. What I cannot: screen captures, feel, perf traces, sync-lab runs, font strips. These are flagged per-item in the milestone report for browser QA.
