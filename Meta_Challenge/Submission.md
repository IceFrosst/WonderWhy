---
tags:
  - type/submission
  - topic/junction-2026
updated: 2026-11-14
---

# Submission text (Sun 15 Nov, matches what is built)

> [!summary]
> Text for the Junction Platform. **FINAL by Sun 10:00**, draft projects are not reviewed ([guidebook](../Research/Sources/Junction_2026_Participant_Guidebook.pdf), p. 12). Nothing here has run on real glasses yet. State comes from [app/README](app/README.md), [android README](app/android/README.md) and the [handover](../Overnight/handover/meta.md).

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
- **Honest about doubt:** a weak guess shows "Not sure what this is" and opens no scene.

Built for hands-on learners (students aged about 13-18 and curious adults), including people for whom a spoken paragraph does not work.

### What works, plainly
| Claim | Status | On what |
|---|---|---|
| 5 prerendered explainer scenes (guitar, ball, bicycle, kettle, pendulum) plus a phone exploded view | **TESTED** | Laptop, headless Chrome. [README](app/README.md) says "5 objects"; `shared/objects.json` lists 6 ids (adds `phone`), TODO (human): say which number to quote |
| Scenes run at 30 fps | **TESTED** | Laptop, headless Chrome, 13 Nov ([app README](app/README.md)). Not measured on glasses |
| First load about 182 KB gzipped, 4 requests (limit 300 KB, 15) | **TESTED** | Same measurement, 13 Nov ([app README](app/README.md)) |
| Meta's test gate | **TESTED** | Passes, per [app README](app/README.md) |
| Bridge: identified result to scene painted about 50 ms | **TESTED** | Laptop, headless Chrome, 13 Nov ([app README](app/README.md)). Excludes the model and Bluetooth |
| Android app: connect, pinch, one photo, bridge `/detect`, result card | **TESTED** in **mock mode** | Pixel 8, Android 17, Meta Mock Device Kit, 14 Nov ([android README](app/android/README.md)). The phone camera stands in for the glasses |
| Android app on real Ray-Ban Display: registration deep link, camera permission, inputs, HEIC photos | **BUILT** | Untested ([android README](app/android/README.md), "Not done yet") |
| Web App installed on the glasses by QR | **BUILT** | Untested on glasses. Plan: [Glasses_Test.md](Glasses_Test.md) |
| Aim: model looks at the centre crop as well as the full photo | **TESTED** | One run on 14 Nov with a kettle and a guitar in one frame: centre crop gave "kettle" 3 of 3, full photo alone gave "guitar" 3 of 3 ([PROTOCOL](app/shared/PROTOCOL.md)). Small sample |
| Bridge lock (`LENS_TOKEN`), `GET /last`, heartbeat, "Took too long" timeout, low-confidence "Not sure" card | **BUILT** | Specified in [PROTOCOL](app/shared/PROTOCOL.md). TODO (human): confirm the live droplet runs this version and a model key; the handover said `provider: mock` (every photo returns "Not sure") |
| Device states (take off, battery low, camera denied, offline) as cards | **BUILT** | Mock Device Kit states on the Pixel 8 and the phone page; not on glasses |
| Model detection time | **Not measured** | The README says it needs a key and `npm run bench` ([app README](app/README.md)). TODO (human): paste p50 and p90 if run |
| Photo transfer glasses to phone over Bluetooth | **Not measured** | Cannot be simulated ([app README](app/README.md)) |
| Phone app and Web App at the same time on the glasses | **Not possible** | Booth answer, 14 Nov ([Booth_Questions](Booth_Questions.md)). Handover between them: unknown, first glasses test |
| 2 of 8 lenses (Motion, Inside) | **TESTED** in simulator | The rest are **PLANNED** ([Modes](Modes.md)). Other lenses may have landed overnight: TODO (human) re-check |
| Speech question ("why is it higher?") | **PLANNED** | `question` is always null ([android README](app/android/README.md)) |
| Answers in the user's language | **PLANNED** | |
| "Done" by voice clears the scene | **PLANNED** | The "Done" button on the card exists in the Android app (BUILT, mock) |
| Follow-up "rabbit hole" questions | **PLANNED** | |
| Animations on the glasses from the phone app (stills or clips) | **PLANNED** | Android shows text cards only ([android README](app/android/README.md)). Handover lists an export script as open: TODO (human) check |
| Generated explanation for unknown objects | **PLANNED** | Unknown objects show a text answer, no animation |
| Refuses to explain people | **PLANNED** | Not built |

## Technologies
Meta Wearables Device Access Toolkit 1.0.1 (Android, Kotlin), Meta Mock Device Kit, Meta Ray-Ban Display Web App (React, Canvas 2D, Vite), Node.js bridge (HTTP + WebSocket), model detection via Gemini or Claude API (provider switch), Docker, Caddy. TODO (human): drop whichever model is not used in the final run.

## Privacy and consent (what is true)
| Point | Truth | Source |
|---|---|---|
| Camera on only when asked | Yes in the Android app: it starts on pinch, button or "Again", takes ONE photo, releases the camera | [android README](app/android/README.md) |
| Photo not stored on the phone | Yes: "never stored on disk". The phone screen shows the last photo sent, held in memory | [android README](app/android/README.md) |
| Photo leaves the phone | Yes: sent to our bridge, then to the model provider for identification | [PROTOCOL](app/shared/PROTOCOL.md) |
| Photo not stored on the bridge | Not stated in a README. Code read shows only the dev-only `pi` provider writes a temp file. TODO (human): confirm no logging of images | `bridge/detect.js` |
| First-run consent card | **PLANNED** (handover backlog) | [handover](../Overnight/handover/meta.md) |
| Bridge access | Locked by a token when `LENS_TOKEN` is set | [PROTOCOL](app/shared/PROTOCOL.md) |

## Known limits
- Never run on real glasses. Real-glasses plan: [Glasses_Test.md](Glasses_Test.md).
- Camera lives in the phone app and animations live in the Web App. They cannot run together, so the full loop on glasses depends on the handover test.
- Only a few objects. Others show a text answer or "Not sure".
- Physics is prerendered and checked by the team, not generated.

## Pilot path
One physics class or a science centre, with a before and after quiz. **PLANNED**, no pilot has run.
