---
tags:
  - type/submission
  - topic/junction-2026
updated: 2026-11-14
---

# Submission text (Sun 15 Nov, matches what is built)

> [!summary]
> Draft text for the Junction Platform. **FINAL by Sun 10:00**, draft projects are not reviewed (guidebook *(internal note, not in this repo)*, p. 12). The table below records the earlier overnight baseline. Use the [design handoff](Design_Handoff.md) and [loaner evidence](team-notes/Loaner_Test.md) for current test claims, including real capture, Gemini, and live kettle Inspect.

## Status labels used below
| Label | Meaning |
|---|---|
| **TESTED** | Built and run. The test setup is named |
| **BUILT** | Built, not tested on real glasses |
| **PLANNED** | Not built |

## Form fields (guidebook p. 12)
| Field | Our text | Status |
|---|---|---|
| Project name | Physics Lens (pick the final name: WhyLens, Curio or Unseen are the old options) | TODO (human): confirm name |
| Punchline | Look at anything. See the physics inside it. | Done |
| Description | Below | Done |
| Challenge(s) | Meta: AI Glasses for Everyone, Everyday. Tech: Best Use of Gemini API only if the final bridge really runs on Gemini | TODO (human): confirm provider on the live bridge, and the one-project rule |
| Technologies | Below | Done |
| Video (public, **max 2:00**) | TODO (human): link, checked logged out | TODO (human) |
| Demo link | Web App: https://lens.167-71-139-39.sslip.io/ (install with [install-qr.png](app/deploy/install-qr.png)). Phone page: `/phone`. TODO (human): check it is up and unlocked for judges | TODO (human) |
| Source link (public repo, MIT) | TODO (human): repo URL. Open: can `stoa/` be public (about 73 MB of building models, see handover) | TODO (human) |
| Source code publicity | Public | TODO (human): confirm |
| Credited for the project? | TODO (human) | TODO (human) |
| Pitch deck (PDF) | Export from [Deck.md](Deck.md) | TODO (human) |
| Team members and roles | TODO (human): names as on the Platform (repo has MrNetwork, IceFrost, IdelicMemor) | TODO (human) |
| Phones, Discord names | Platform only, never in this repo | TODO (human) |

## Description (paste into the form)
You are surrounded by physics you can't see: why a guitar string sounds higher when you press it, how a kettle boils, what a bike's gears do. To find out today, you stop, pull out a phone and read a wall of text.

Physics Lens runs on Meta Ray-Ban Display glasses. You look at an object and pinch. One photo is taken, the object is identified, and a short answer appears in your view. A line-art animation of the hidden mechanism plays on the 600x600 display: the wave on the string, the path of a ball, the layers inside a phone. Pinch steps through it, the D-pad changes a value such as the angle or speed of a throw.

- **Why glasses with a camera:** the object is what you are holding. The camera tells the app what to explain, so you do not describe it. The display shows the answer over the object.
- **Shows, does not only tell:** captions and animation help people who struggle with long text or audio.
- **Camera only on request:** one photo per pinch. The phone app does not save it. See limits below.
- **Honest about doubt:** a weak guess shows "Not sure what this is" and opens no scene. An unknown object can get a generated sketch, tagged unverified.
- **Ask more:** a follow-up question, typed or spoken, jumps to the lens that answers it. Text comes in Finnish, Swedish, German, Spanish and French as well as English.

Built for hands-on learners (students aged about 13-18 and curious adults), including people for whom a spoken paragraph does not work.

### What works, plainly
Counts below were made on 14 Nov from `shared/objects.json` (7 objects, 29 lenses) and `bridge/media/` (90 stills, 29 clips). Older READMEs say 5 or 6 objects; use these.

| Claim | Status | On what |
|---|---|---|
| 7 objects (guitar, ball, bicycle, kettle, pendulum, phone, metal spoon) with 29 lenses in total (3 to 5 each: Motion, Inside, Cutaway, Zoom, What if, Compare, Flow, The number), all prerendered | **TESTED** | Laptop, headless Chrome at 600x600 on black: `npm run test:states`, 125 of 125 screens and scene steps pass ([glasses docs](app/glasses/docs/README.md)). Not on glasses |
| Scenes run at 30 fps | **TESTED** | Headless Chrome, lowest lens median 29.9 fps ([glasses docs](app/glasses/docs/README.md)). Not measured on glasses |
| First load 214 KB gzipped, 5 requests (limit 300 KB, 15) | **TESTED** | Desktop status 03:20 UTC, after the glasses polish (214 KB); 5 requests and Meta's test gate measured at 211 to 212 KB earlier ([app README](app/README.md), desktop status *(internal note, not in this repo)*) |
| Bridge: identified result to scene painted about 50 ms | **TESTED** | Laptop, headless Chrome, 13 Nov ([app README](app/README.md)). Excludes the model and Bluetooth |
| Detection accuracy: 18 of 18 test photos right (7 objects plus 4 unrelated, "unknown") | **TESTED** on a **dev stand-in** | Claude Haiku through a local command line on the desktop, 1 run each, Wikimedia photos ([app README](app/README.md)). **Not Gemini**, not the demo provider |
| Detection time p50 5.8 s, p90 7.8 s | **TESTED** on a **dev stand-in** | Same run. This is the stand-in's process start, not the demo provider's speed. Gemini time: **not measured** (no key on a test machine). TODO (human): run `npm run bench` with the key and paste |
| Aim: model looks at the centre crop as well as the full photo | **TESTED** | One run, kettle and guitar in one frame: centre crop "kettle" 3 of 3, full photo alone "guitar" 3 of 3 ([PROTOCOL](app/shared/PROTOCOL.md)). Small sample |
| Android app: connect, pinch, one photo, bridge `/detect`, result card | **TESTED** in **mock mode** | Pixel 8, Android 17, Meta Mock Device Kit, 14 Nov. The phone camera stands in for the glasses ([android README](app/android/README.md)) |
| Android app end to end with the real prompt path | **TESTED** | Emulator, Mock Device Kit, local bridge, real model through a dev stand-in: kettle detected 0.97, device and error cards (evidence *(internal note, not in this repo)*, MrNetwork's Mac and the desktop) |
| Android JVM tests | **TESTED** | 153 JVM tests pass (`testDebugUnitTest`, 14 Nov morning, [android README](app/android/README.md)) |
| Android: `POST /rendered` latency ack sent; bridge URL and token edits apply at once; scripted smoke walk | **TESTED** | Emulator, Mock Device Kit, local bridge: `GET /latency` listed the phone's request ids; the smoke script `tools/emulator_smoke.sh` ran twice in a row ([android README](app/android/README.md)) |
| Bridge node tests | **TESTED** | 70 bridge tests (desktop status, 02:28 UTC), after the security fix round (15 findings, 3 serious, each with a test; the three serious ones re-attacked by hand on a local server). TODO (human): re-run `npm test` in `app/bridge/` and quote the count |
| Android on real Ray-Ban Display: registration deep link, camera and microphone permission, inputs, HEIC photos, speech | **BUILT** | Untested ([android README](app/android/README.md), "Real glasses") |
| Web App installed on the glasses by QR | **BUILT** | Untested on glasses. Plan: [Glasses_Test.md](Glasses_Test.md) |
| Stills and clips export: 90 stills (600x600 cards with title and caption) and 29 clips (264x264 H.264, 3 s per step), served at `/media/` | **TESTED** (files made, all clips decode) | Laptop. Shown on a phone only as stills in the Android emulator. **Clips are not played by the Android app** (not built); not shown on real glasses |
| Phone-only route: the Android app shows scenes by itself as stills | **TESTED** in mock mode | Emulator, real `/media/` stills, 14 Nov ([android README](app/android/README.md)). Real glasses: **BUILT**, untested |
| Bridge lock (`LENS_TOKEN`, header and WebSocket), key in the URL fragment (`#k=`) | **TESTED** locally | Local bridge: locked and unlocked in a browser, wrong-token card on the emulator. **Live droplet: not locked.** Deployed version is f7c7c15, unlocked, provider `mock` (desktop status *(internal note, not in this repo)*). TODO (human): deploy the fixed bridge, then lock, then add the key |
| `GET /last` handover route, heartbeat, "Took too long" timeout, "Not sure" card | **TESTED** | Local bridge and scripted bridge, headless Chrome (state check: `replay`, `heartbeat`, `took-too-long`, `not-sure`). Whether the handover works on real glasses: **unknown** |
| Language (`lang`): fi, sv, de, es, fr, plus English | **TESTED** in Finnish | Bridge with the checked-in translations; emulator in Finnish (library, card text). Texts are **machine-translated, not read by a native speaker** ([PROTOCOL](app/shared/PROTOCOL.md), [i18n](app/shared/i18n/README.md)). Drawings and still labels stay English. Android fixed card text is English and Finnish only |
| Follow-up questions (`POST /ask`): answer plus a jump to the right lens and step | **TESTED** | Bridge: with no model, word matching got 4 of 7 test questions right; through the dev stand-in 3 of 3 hard ones right (about 6 s each). Glasses: state check `follow-up`. Android: on the emulator against the real `/ask` on a local bridge with no model (word matching; phone field, kit speech, Finnish; answer card with lens hint, pinch opens it), plus the phone's own fallback and a test stub for error cards. Not run from the phone against a real model. TODO (human): check |
| Spoken question | **TESTED** only with the kit's injected text | Emulator, `simulateTranscription`, answered by the real `/ask` on a local bridge with no model. **Real microphone and speech recognition: untested**. Mic only listens while a result is on screen |
| Sketch for unknown objects ("Sketch · unverified") | **TESTED** | Fixture mode on the emulator; real runs through the dev stand-in: 3 of 3 valid sketches (stapler, potted plant, bistro table; the stapler took 25 s, drawn at 600x600 on the glasses page). **Not run on Gemini.** Off by default. The phone app shows sketch text only, no drawings |
| Offline saved cards (7 library objects, English and Finnish) | **TESTED** | Emulator, bridge stopped (picker "3/7"). Offline cards now show stills for all 7 objects (bundled into the APK at build time). The hosted bridge still serves 6 objects ([android README](app/android/README.md)) |
| Glasses cards redesigned (no filled card, larger stills, a still on overviews); one retry on HTTP 429, then a "Busy" card; phone screen redesigned with dev controls under "Developer" | **TESTED** in mock | Emulator, Mock Device Kit, local mock bridge. Not seen on real glasses, so real legibility is unknown ([android README](app/android/README.md)) |
| Independent code review: 12 findings fixed | **TESTED** in mock (8) / fixed, not reproducible on the emulator (4) | Emulator, Mock Device Kit. The 4 are covered by code and unit tests only ([android README](app/android/README.md)) |
| "Glasses check" (phone checklist of the Glasses_Test.md rows, with a share report), "Seen today" journal with replay on the glasses, receipt line under the mirror | **TESTED** in mock | Emulator, Mock Device Kit, local mock bridge. Sketch journal entries and sketch / stand-in receipts: **unit-tested only**. The check has never run against real glasses ([android README](app/android/README.md)) |
| Device states as cards (take off, fold, battery low, hot, Bluetooth drop, camera denied, other app takes over) | **TESTED** in mock | Emulator, Mock Device Kit. "Other app takes over" is simulated (no kit call). How real glasses report these: untested. Glasses Web App has its own cards: state check |
| First-run consent card | **TESTED** in the glasses Web App (headless Chrome, state check `consent`) and in the Android app (English and Finnish card) | Android: emulator, Mock Device Kit: card on glasses and phone, Not now asks again, Agree sends the photo. Not on real glasses. TODO (human): re-check before submitting |
| Hands-free demo mode (`?demo=1` / `nav demo`) and a video kit (clean and captioned 1080 clips, branch `idea/video-kit`) | Demo mode **TESTED** (headless Chrome state check); video kit **BUILT** | Desktop only (desktop status *(internal note, not in this repo)*). Not a product feature |
| Photo transfer glasses to phone over Bluetooth | **Not measured** | Cannot be simulated ([app README](app/README.md)) |
| End-to-end time from pinch to card | **Not measured** | Stopwatch test in [Glasses_Test.md](Glasses_Test.md). No README states a measured number |
| Phone app and Web App at the same time on the glasses | **Not possible** | Booth answer, 14 Nov ([Booth_Questions](team-notes/Booth_Questions.md)). Handover between them: unknown, first glasses test |
| "Done" by voice clears the scene | **PLANNED** | The "Done" button exists (BUILT, mock) |
| Clip playback on the glasses from the phone app | **PLANNED** | SDK video wiring unclear (handover *(internal note, not in this repo)*) |
| Refuses to explain people | **PLANNED** | Not built |

## Technologies
Meta Wearables Device Access Toolkit 1.0.1 (Android, Kotlin, speech module `mwdat-speech`), Meta Mock Device Kit, Meta Ray-Ban Display Web App (React, Canvas 2D, Vite), Node.js bridge (HTTP + WebSocket), model detection via Gemini or Claude API (provider switch), Docker, Caddy. TODO (human): drop whichever model is not used in the final run.

## Privacy and consent (what is true)
| Point | Truth | Source |
|---|---|---|
| Camera on only when asked | Yes in the Android app: it starts on pinch, button or "Again", takes ONE photo, releases the camera | [android README](app/android/README.md) |
| Photo not stored on the phone | Yes: "never stored on disk". The phone screen shows the last photo sent, held in memory | [android README](app/android/README.md) |
| Photo leaves the phone | Yes: sent to our bridge, then to the model provider for identification | [PROTOCOL](app/shared/PROTOCOL.md) |
| Photo not stored on the bridge | Not stated in a README. Code read shows only the dev-only `pi` provider writes a temp file; the dev `claude` stand-in also uses temp files (desktop security review). Latency log keeps timings and object ids, not images. TODO (human): confirm no logging of images | `bridge/detect.js` |
| First-run consent card | Glasses Web App: **TESTED** (headless Chrome). Android app: **TESTED** on an emulator with mock glasses | [glasses docs](app/glasses/docs/README.md), [android README](app/android/README.md) |
| Bridge access | Locked by a token when `LENS_TOKEN` is set. The fixed bridge refuses to start with a model key and no token. The live droplet is not locked yet | [PROTOCOL](app/shared/PROTOCOL.md), desktop status *(internal note, not in this repo)* |
| Spoken questions and language | The question text goes to the bridge and the model provider; the microphone listens only while a result is on screen | [android README](app/android/README.md) |

## Known limits
- Real capture and live kettle Inspect worked on the loaner. A complete photo-to-film run initiated from the foreground Web App and visible native MP4 playback still need acceptance. [Loaner evidence](team-notes/Loaner_Test.md)
- 7 objects. Others show "Not sure", or a generated sketch tagged unverified when that switch is on.
- Physics is prerendered and checked by the team; the lens captions also went through an independent physics fact-check (18 captions corrected, curves recomputed). Sketches and model answers are not checked.
- The earlier aggregate detection benchmark used a stand-in. The real smartphone run used Gemini. Translations are machine-made.
- The current hosted bridge uses Gemini and requires the team’s private bridge credential for recognition.

## Pilot path
One physics class or a science centre, with a before and after quiz. **PLANNED**, no pilot has run.
