# Testing

[← README](../README.md) · [Use case](USE_CASE.md) · [Architecture](ARCHITECTURE.md) · [UX, accessibility and trust](UX_ACCESSIBILITY_TRUST.md)

## Summary

| Suite | Count | Last result | Run here for this README? |
|---|---|---|---|
| Bridge (Node test runner) | **93** tests, 10 files | 93 pass, 0 fail (about 13 s) | **Yes** (`npm ci && npm test`) |
| Glasses Web App type-check + production build | n/a | Build passes | **Yes** (`npm ci && npm run build`) |
| Docs link check | 580+ relative links | All resolve, including heading anchors | **Yes** (`node scripts/check-md-links.mjs --anchors`) |
| Android JVM unit tests | **172** `@Test`s in 21 files | 172 passed on 14 Nov (README); a debug APK was built and installed on the loaner phone | No (needs JDK 17 + Android SDK) |
| Glasses state and scene suite (headless Chrome, 600 × 600) | **182** captures: 47 named states + 135 lens/scene steps | All 182 OK on 14 Nov 20:11 UTC ([report](../Meta_Challenge/app/glasses/docs/README.md)) | No (needs Playwright browsers; regenerates the report and screenshots) |
| Translation checker | 5 languages | **Fails**: 15 problems per language (see below) | **Yes** |
| Real glasses | Manual checklists | Partial: see [Design_Handoff](../Meta_Challenge/Design_Handoff.md#what-the-loaner-established) | n/a |

## Bridge tests (`Meta_Challenge/app/bridge/test/`)

```bash
cd Meta_Challenge/app/bridge && npm ci && npm test      # node --test test/*.test.js, mock provider, no key or network
```

| File | Tests | Covers |
|---|---|---|
| [`relay.test.js`](../Meta_Challenge/app/bridge/test/relay.test.js) | 6 | `detecting` → `show` → `rendered` relay, nav and state mirroring, `/capture` hand-off, mock provider, basic endpoints |
| [`v1-additions.test.js`](../Meta_Challenge/app/bridge/test/v1-additions.test.js) | 13 | Token auth on HTTP and WebSocket, CORS, `lowConfidence`, `/last` and replay, heartbeat, `detect_timeout`, error codes |
| [`security.test.js`](../Meta_Challenge/app/bridge/test/security.test.js) | 16 | Fail-closed paid providers, body / frame / socket / model-concurrency limits, stale-result races, hostile JSON, path and media safety, 20 MB latency-log cap, 500-entry memory cap, scoped stand-in providers |
| [`ask.test.js`](../Meta_Challenge/app/bridge/test/ask.test.js) | 10 | Follow-up step matching, reply parsing, `/ask` validation and fallback |
| [`lang.test.js`](../Meta_Challenge/app/bridge/test/lang.test.js), [`spectext.test.js`](../Meta_Challenge/app/bridge/test/spectext.test.js) | 6 + 5 | Translation merge per field, language normalisation, bad translation files, localized drawing text, answer cap (14 words), safe 4xx/5xx bodies with request ids |
| [`latency.test.js`](../Meta_Challenge/app/bridge/test/latency.test.js) | 4 | `/rendered`, p50/p90 summary, no clock mixing |
| [`model3d.test.js`](../Meta_Challenge/app/bridge/test/model3d.test.js), [`sketch.test.js`](../Meta_Challenge/app/bridge/test/sketch.test.js) | 15 + 17 | Validation of generated 3D models and sketches (caps, ranges, forced `verified: false`, malformed input never throws) |
| [`emulator.test.js`](../Meta_Challenge/app/bridge/test/emulator.test.js) | 1 | `/emulator` is served with a camera-friendly, same-origin CSP |

## Glasses Web App

| Check | Command | Notes |
|---|---|---|
| Type-check and build | `cd Meta_Challenge/app/glasses && npm ci && npm run build` | `tsc --noEmit && vite build`. Current output: about 261 KB gzip first load (the 14 Nov report said 245,627 B), scene chunk 166 KB gzip loaded lazily |
| State and scene suite | `npm run test:states` | Builds the app, starts its own fake bridge, drives headless Chrome at 600 × 600 through 47 named states (home, offline, locked, looking, timeout, not sure, unknown, error, device states, replay, heartbeat, token variants, reconnect, consent, follow-up, demo, stale request, malformed frame, Explore film, labels, fallback, Finnish, …) and 135 lens/scene steps; checks bundle size (limit 300 KB, 15 requests), frame rate, and writes [`docs/README.md`](../Meta_Challenge/app/glasses/docs/README.md), [`docs/measure.json`](../Meta_Challenge/app/glasses/docs/measure.json) and [screenshots](../Meta_Challenge/app/glasses/docs/states) |
| Film navigation | `node scripts/nav-check.mjs <shotDir>` | Every film against a running bridge; `--quick`, `--only kettle,phone` |
| Media export | `npm run export:media` | Exports stills and clips for the bridge |

Recorded results (14 Nov state check): 4 first-paint requests, 245,627 B gzip, 30 lens scenes with median frame rate between 29.84 and 30 fps in headless Chrome (software GL). **Not measured on glasses.**

## Android app

```bash
cd Meta_Challenge/app/android
./gradlew --no-daemon -q testDebugUnitTest      # JDK 17, Android SDK; see android/README "Build"
```

172 pure-JVM tests ([`app/src/test/`](../Meta_Challenge/app/android/app/src/test/java/com/junction2026/lens)) cover: the trigger gate (display not ready, glasses off, consent order), auth header and URL-key stripping, `/detect` parsing and request bodies, 429 retry, the device-state mapping, card shapes and word caps in English and Finnish, a height estimate of every library card against the 600 × 600 display, offline library and picker, explorer state, follow-up flow, "Seen today" journal (no pictures), receipt line, glasses-check rows and report (never carries the token), and stills trimmed without cutting the drawing. Two tests read repository files: `GlassesCheckTest` reads [`Glasses_Test.md`](../Meta_Challenge/Glasses_Test.md), which is why that file did not move into `team-notes/`.

Emulator evidence (Mock Device Kit, no hardware): [`android/docs/screens/`](../Meta_Challenge/app/android/docs/screens), walk-through script [`tools/emulator_smoke.sh`](../Meta_Challenge/app/android/tools/emulator_smoke.sh), notes in the [Android README](../Meta_Challenge/app/android/README.md).

## Translation checker

```bash
node Meta_Challenge/app/shared/i18n/check.mjs      # from the repo root; exit 1 on any problem
```

**Current result: FAIL, 15 problems in each of `fi`, `sv`, `de`, `es`, `fr`**: five newer library objects (`earbuds`, `glasses`, `spinbike`, `sauna`, `printer3d`) have no translation yet, and the phone's Explore chapter has 6 translated captions against 7 English ones (plus captions more than 30% longer than the English). The bridge falls back to English for anything missing ([`lang.test.js`](../Meta_Challenge/app/bridge/test/lang.test.js) covers the fallback), so the app does not break, but those objects are not localized. This is a real gap, tracked in [README limitations](../README.md#known-limitations).

## Docs

```bash
node scripts/check-md-links.mjs             # every relative Markdown link and <img>/<a> target in tracked .md files must exist
node scripts/check-md-links.mjs --anchors   # also verify #heading fragments that point into .md files
```

Result when this README was written: all relative links resolve. `--anchors` also passes. Links to notes that stayed in the team monorepo were turned into plain text marked *(internal note, not in this repo)*.

## Real hardware and device-level checks

Checklists: [`Glasses_Test.md`](../Meta_Challenge/Glasses_Test.md) (20-minute sheet, also available in the Android app under Developer → Glasses check) and [`team-notes/Loaner_Test.md`](../Meta_Challenge/team-notes/Loaner_Test.md) (loaner session). Results as recorded in [Design_Handoff](../Meta_Challenge/Design_Handoff.md#what-the-loaner-established):

| Flow | Result |
|---|---|
| Band pinch → glasses photo → Android → Gemini → display | Verified in one successful run: JPEG at the phone in 5,594 ms, upload 9 ms later, "Smartphone" recognised at 99% in 5,083 ms. Other attempts lost Bluetooth right after the JPEG; one retry reconnected |
| Kettle film and live Inspect (3D) | Displayed and responded; one run: 1,133 ms to film motion, 1,546 ms to Inspect. Continuous drag, frame rate and long sessions **not measured** |
| Spoken follow-up | Glasses microphone transcribed; one `/ask` returned HTTP 502, the retry worked. Narration quality and audio routing **not tested** |
| Web App "Ask" | Opened the phone visual; "Hey Meta" gave a spoken answer without opening the visual; WebMCP registration verified in Chromium |
| Camera relay while the Web App is in front | In code; **no confirmed end-to-end run** |
| Guitar → Home fix | Passed in the simulator only; **to confirm on glasses** |

Documentation discrepancy to note: [Design_Handoff](../Meta_Challenge/Design_Handoff.md#edit-and-preview) mentions `node Meta_Challenge/app/glasses/scripts/live-kettle-smoke.mjs`; that script is not present in this repository's extract (the Explore fallback screen is covered by the state suite, state `43-explore-fallback`).
