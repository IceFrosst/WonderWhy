# Physics Lens: run and demo runbook

For whoever wakes up first. Everything here was run on the desktop on 14 Nov unless a line says otherwise. Contract: [shared/PROTOCOL.md](shared/PROTOCOL.md). Look and wording: [shared/DESIGN.md](shared/DESIGN.md).

## Start it on one laptop (2 minutes)
```bash
cd Meta_Challenge/app/glasses && npm ci && npm run build
cd ../bridge && npm ci && npm start
```
| Open | What it is |
|---|---|
| http://localhost:8787/ | The glasses app (600x600). Arrows = D-pad, Enter = pinch, Esc = back |
| http://localhost:8787/phone | Phone stand-in: webcam, pinch, object buttons, every state button, language, "Ask about what is on the glasses" |
| http://localhost:8787/health | `provider`, `auth`, `sketch`, `standIn` |

## Pick a mode with `bridge/.env` (never commit it)
| Mode | Lines in `.env` | What works | Cost |
|---|---|---|---|
| No key (default) | nothing | The 7 library objects by button, every lens, follow-up questions by word matching, all state cards, second language | None |
| No key + sketches | `SKETCH_PROVIDER=fixture` | The above, plus a recorded stapler sketch for any photo | None |
| Dev stand-in | `DETECT_PROVIDER=claude` and `SKETCH_PROVIDER=auto` | Real recognition, real sketches, real follow-up answers, about 6 s per call, 25 s for a sketch. Answers are tagged "Stand-in model". **Only on your own machine**: it uses the login of whoever runs it | That person's subscription |
| Demo (Gemini) | `GEMINI_API_KEY=...`, `LENS_TOKEN=...`, `SKETCH_PROVIDER=auto` | Everything, fast. **Not run yet: no key was on a test machine** | Team Gemini account |

The bridge refuses to start with a model key and no `LENS_TOKEN`. With a token, open the pages once as `http://localhost:8787/#k=<token>` and `/phone#k=<token>`.

## The 60-second demo (simulator or real glasses)
| Sec | Do | Say |
|---|---|---|
| 0 | Look at a kettle, pinch | "Look at anything and pinch." |
| 5 | The kettle opens on Motion. Pinch twice | "It shows the physics inside: hot water rises, cool water sinks." |
| 15 | Swipe right to Cutaway, pinch to step 3 | "Different lenses answer different questions. This one cuts it open: steam trips the switch." |
| 25 | Swipe to What if, press up three times | "This one lets me change one thing. Twice the water, about twice the time." |
| 35 | Ask "How much does boiling cost?" (phone page "Ask", or voice on Android) | "I can ask it. It jumps to the lens that answers: two cents." |
| 45 | Look at a stapler (anything not in the library), pinch | "And for things it has never seen, it sketches an explanation, and says it is unverified." |
| 55 | Switch language to Finnish, pinch at the kettle again | "Same thing in Finnish." |

Fallbacks, in order: object buttons on the phone page (no camera, no model); "Demo" on the glasses home screen (hands-free loop through every lens); the stills and clips under `bridge/media/` shown by the phone app; the video kit on branch `idea/video-kit`.

## What is tested, and how to re-run it
| Check | Command | Last result (desktop, 14 Nov) |
|---|---|---|
| Bridge unit and security tests | `cd bridge && npm test` | 75 pass |
| Every screen and state of the glasses app, with screenshots | `cd glasses && npm run test:states` | 125 of 125, 215 KB gzipped, 5 requests, about 30 fps (headless). Screenshots: [glasses/docs/](glasses/docs/README.md) |
| Recognition on photos | `cd bridge && DETECT_PROVIDER=claude BENCH_N=1 BENCH_SIZES=MEDIUM npm run bench` (photos in `bridge/samples/`, not in git) | 18 of 18 on the dev stand-in. Gemini: not run |
| Translations match the English | `node shared/i18n/check.mjs` | 5 languages ok, 390 strings each incl. text inside the drawings (machine-translated, need a native read) |
| Android app with mock glasses on an emulator | Overnight/evidence/android-emulator/ *(internal note, not in this repo)* | Ran end to end with the stand-in (kettle 0.97) |
| Stills and clips for the phone-only route | `cd glasses && npm run export:media` (needs ffmpeg for clips) | 90 captioned stills, 90 text-free stills (`c<step>.png`), 29 clips in `bridge/media/` |
| Footage for the pitch video | `cd glasses && npm run export:video` | Branch `idea/video-kit` (re-render after lens changes) |

## Not proven anywhere yet
- Real Ray-Ban Display glasses: written before the 14 Nov loaner session; what it verified is in [Design_Handoff.md](../Design_Handoff.md#what-the-loaner-established), the rest is unverified. Checklist: [Glasses_Test.md](../Glasses_Test.md).
- Gemini: speed and accuracy numbers. Run the bench with the key and put p50 / p90 in [README.md](README.md).
- The live droplet runs an older bridge (deployed 00:42 UTC, before the security fixes). Deploy `main`, then follow "Lock it" in [deploy/README.md](deploy/README.md) **before** any key goes on it.
- A native speaker has not read the translations.
