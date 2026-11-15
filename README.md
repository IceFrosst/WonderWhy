# WonderWhy

**Junction 2026 · Meta challenge "AI Glasses for Everyone, Everyday"**

Look at something, pinch, and the glasses show *why it works*: a short, animated physics explanation on **Meta Ray-Ban Display**, driven by the **Meta Neural Band**. A real-world explanation mode: 7 prerendered objects (ball, guitar, bicycle, kettle, keys, phone, spoon), several "lenses" per object (Motion, Inside, Cutaway, What if, ...), follow-up questions, six languages. The demo still works offline, because the library ships inside the app.

## Try it (no login, no hardware)

| What | Link |
|---|---|
| Public demo (saved explanations, no backend) | https://wonderwhy-demo.vercel.app |
| Live camera emulator (your camera + pinch, real bridge) | https://lens.167-71-139-39.sslip.io/emulator |
| Glasses app on the live bridge (600 × 600) | https://lens.167-71-139-39.sslip.io/ |
| Demo clips of real objects | [`DemoVideos/Objects/`](DemoVideos/Objects) |

## How it fits together

```
Ray-Ban Display + Neural Band ──> Android app (Meta Wearables toolkit) ──> bridge (/detect, /ask) ──> model
         ▲                                                          │
         └────────── glasses Web App (React + three.js) <───────────┘
```

| Part | Path | What it is |
|---|---|---|
| Glasses Web App | [`Meta_Challenge/app/glasses`](Meta_Challenge/app/glasses) | The app on the Display: scenes, lenses, D-pad / pinch navigation (Vite, React, three.js) |
| Bridge | [`Meta_Challenge/app/bridge`](Meta_Challenge/app/bridge) | Node server: object detection, follow-up questions, relay, latency log; also serves the built glasses app and the phone/emulator pages |
| Android app | [`Meta_Challenge/app/android`](Meta_Challenge/app/android) | Phone app using the Meta Wearables Device Access Toolkit: photo on pinch, result cards on the glasses |
| 3D renderer | [`Meta_Challenge/app/render3d`](Meta_Challenge/app/render3d) | Renders the "Explore" chapters (three.js, headless Chrome) into clips and stills |
| Shared contract | [`Meta_Challenge/app/shared`](Meta_Challenge/app/shared) | `objects.json` (the library), `PROTOCOL.md`, `DESIGN.md`, `MODEL3D.md`, translations |
| Deploy | [`Meta_Challenge/app/deploy`](Meta_Challenge/app/deploy) | Dockerfile, Caddy config, `deploy.sh` for the droplet |
| Video pipeline | [`Meta_Challenge/video`](Meta_Challenge/video) | The WonderWhy film: AR renders, rough cuts, child voice auditions |
| Docs | [`Meta_Challenge/`](Meta_Challenge/README.md) | Plan, modes, platform notes, test sheets, video script, submission text |

Good starting points: [`Meta_Challenge/README.md`](Meta_Challenge/README.md), [`Modes.md`](Meta_Challenge/Modes.md), [`Platform_Notes.md`](Meta_Challenge/team-notes/Platform_Notes.md), [`app/DEMO.md`](Meta_Challenge/app/DEMO.md), [`Submission.md`](Meta_Challenge/Submission.md).

## Run it locally (about 2 minutes)

Needs Node 20+. No API key is needed for the 7 library objects.

```bash
cd Meta_Challenge/app/glasses && npm ci && npm run build
cd ../bridge && npm ci && npm start
```

| Open | What |
|---|---|
| http://localhost:8787/ | Glasses app (arrows = D-pad, Enter = pinch, Esc = back) |
| http://localhost:8787/phone | Phone stand-in: webcam, pinch, object buttons, languages |
| http://localhost:8787/health | Provider and auth status |

Tests: `cd Meta_Challenge/app/bridge && npm test`. Real detection needs a key: copy `bridge/.env.example` to `bridge/.env` and set `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` (never commit `.env`). Android build and emulator notes: [`app/android/README.md`](Meta_Challenge/app/android/README.md). 3D renders: [`app/render3d/README.md`](Meta_Challenge/app/render3d/README.md).

## Team

| Who | GitHub |
|---|---|
| Alex | [MrNetwork](https://github.com/mrnetwork0001) |
| IceFrost | [IceFrosst](https://github.com/IceFrosst) |
| IdelicMemor | IdelicMemor |

## About this repo

This repository was extracted, with its commit history, from the team monorepo [IceFrosst/Junction-2026](https://github.com/IceFrosst/Junction-2026) (git filter-repo; only the Meta glasses project paths were kept). Some docs under `Meta_Challenge/` link to research notes that stayed in the monorepo, so those links do not resolve here. Licensed under [MIT](LICENSE).
