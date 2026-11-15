---
tags:
  - type/plan
  - topic/junction-2026
updated: 2026-11-13
---

# Meta project plan (Claude Fable 5.2 review, Fri 13 Nov 23:10)

> [!summary]
> Draft plan. Owner decisions in section 6 are still open. Latency figures are estimates.

**The clock on this laptop says Fri 23:08 EET, not 22:00.** The draft is due 23:59 (the platform shows 23:55), so submit name and challenge now. The plan below starts at 23:10.

No files were edited. All latency figures are my estimates; nothing is measured. Repo paths are under `/tmp/meta-wearables-`.

## 1. Critical review

| Risk | Why it hurts | Fix |
|---|---|---|
| It is Meta AI's "look and tell me" plus a clip | Creativity is 25%, and the judges have seen multimodal Q&A | Sell "see the invisible mechanism", not "what is this" |
| First-person is used for one photo | A phone camera does the same; the brief says "beyond mirroring" | Trigger while hands are on the object; follow-ups point at parts with a fresh frame |
| Path B is a video player on your face | That is mirroring | Line art made for the additive display; live and steppable if the hybrid is allowed |
| "Students and curious people" | No need, no pilot, no number | One user, one moment (section 2) |
| Any object, any language, A/B/C test | Three products in about 35 hours | 5 verified sims plus a generated fallback; cut generated video |
| LLM-drawn physics is sometimes wrong | Trust is 25% | Mark sims "verified" and generated ones "sketch" |
| Only 10 shared Display pairs | No pair means no demo | Build the whole path on mocks first |

**Platform_Notes.md fact check**

| Claim | Verdict | Source |
|---|---|---|
| 600x600, 30 Hz, additive, black is see-through | Correct | `webapp/README.md` "Design Constraints" |
| WebGL/Three.js allowed, text in DOM, text at least 16 px | Correct | `webapp/plugins/meta-wearables-webapp-game/docs/threejs-vs-dom.md` |
| JS under 500 KB gzipped | **Wrong budget.** Main guide says under 300 KB total first load, under 15 requests, 1 KB ≈ 16 ms. Use Canvas 2D, not Three.js | `webapp/AGENTS.md` "Performance targets"; `webapp/README.md` |
| Web app voice input | **Narrower.** Voice works only through an `<input>` the wearer activates, or through WebMCP (Meta AI calls your tools; off unless Developer Mode; scalar params only) | `webapp/AGENTS.md` "Text input"; `.../skills/ai-glasses-webapp-webmcp/SKILL.md` |
| Web app has no camera | Not stated; the repo never mentions camera access for web apps | (absence) |
| Install by looking at a QR with the glasses | **Wrong.** You scan it with the phone; it deep-links into the Meta AI app | `webapp/README.md` "Deploy to Glasses" |
| App v272+, glasses v125+, tap version 5 times | Not in the cloned repos | Unverified |
| Stream sizes and 2/7/15/24/30 fps | Correct | `dat-android/.../camera-streaming/SKILL.md:73-79` |
| Photo via `camera.photo`, stop the stream first | Correct, but experimental and single-use per Camera. `stream.capturePhoto()` also exists | `.../camera-capture/SKILL.md`; `.../camera-streaming/SKILL.md:135` |
| Mic: audio streaming, 48 kHz | **Misleading.** Audio only rides on a camera stream, which breaks "never streams". Use on-device `addSpeech` instead | `.../audio-streaming/SKILL.md`; `.../speech/SKILL.md` |
| Display images by HTTPS URL only | **Incomplete.** Android also takes a local `image(bitmap=)`. Video must be the root view, so captions must be baked in | `dat-android/CHANGELOG.md:55`; `.../display-access/SKILL.md` |
| Error list | Correct, plus `BATTERY_CRITICAL`, `THERMAL_CRITICAL`, `PEAK_POWER_SHUTDOWN`, and `batteryLevel`/`donState`/`hingeState` on `Device` | `dat-android/CHANGELOG.md:28,128,129` |
| Android 10+ | Doc says so, but the samples set `minSdk = 31`, so bring an Android 12+ phone | `dat-android/samples/DisplayAccess/app/build.gradle.kts:34` |
| iOS needs Xcode 26.4+, iOS 17.2+ | Correct | `dat-ios/.../getting-started/SKILL.md:12` |
| Mock Device Kit | Correct, and better: `GlassesModel.META_RAYBAN_DISPLAY` with `MockDisplayKit` previews the Display on the phone | `dat-android/CHANGELOG.md:34` |
| Developer Mode needs no review | Correct: app ID and token can be `0` | `.../permissions-registration/SKILL.md:84` |
| Neural Band open to developers | Yes, as semantic events (Nav, Select, Back, Drag), not raw EMG; experimental | `.../inputs/SKILL.md` |
| DAT app and Web App at the same time | **Undocumented, likely not on the Display.** A session may pause or stop when "another experience takes over the device" | `.../session-lifecycle/SKILL.md:75` |

- **Useful find:** the BirdSpotter sample already attaches camera, inputs, speech and display in one session, which is our skeleton (`dat-android/samples/BirdSpotter/.../DatGlassesSessionRepository.kt:745,960,1241,1403`).
- **Licence catch:** its licence is Meta Developer Terms, not MIT. Use it as a reference; do not fork it into our MIT repo without asking.

## 2. Sharpened concept

| Item | Proposal |
|---|---|
| Punchline | "Look at anything. See the physics inside it." |
| User | Hands-on learners aged 13-18, including deaf and dyslexic learners for whom a spoken paragraph fails |
| Scenario | Hands on a guitar: "why is it higher when I press here?" |
| Hero shot | Point of view: fingers on the fret, pinch. A glowing string appears, vibrating in slow motion. The finger moves up, the wave shortens, caption reads "shorter string, higher note" |
| Versus Meta AI | It talks; we show. Our sims are computed and checked, with a depth ladder, and nothing is stored |

- Meta can copy the interface. A validated sim library with a checker is the part that takes work.
- The guitar also works as the peer-review prop: reviewers pluck, pinch and see it. Backup props: a bike gear, a kettle.

## 3. Architecture

**Bare bones: DAT only, Android**

1. Trigger: pinch or capture button (`addInputs`: `InputEvent.Select` / `Capture`).
2. Capture: one photo on trigger (`camera.photo.capturePhoto`), then stop the camera.
3. Question (optional): `addSpeech` transcripts.
4. Backend (TypeScript on a cloud VM): Gemini vision returns object, concept, a two-line answer and a caption.
5. Animation: a known concept returns a pre-rendered MP4 URL. Otherwise the model writes scene JSON, and headless Chromium plus ffmpeg render it to MP4.
6. Display: `sendContent { flexBox text }` at once, then `video(player)`, then a card with Deeper and Done.
7. Done: `clearDisplay()` and delete the frame.

One canvas player (600x600, black, bright lines) renders every scene. It serves the MP4 path now and becomes the Web App later.

**Upgrade (only if booth question 1 is yes):** the same player runs live as a Web App, fed over WebSocket. Pinch steps through, the D-pad changes a parameter, and WebMCP tools give "Hey Meta, go deeper".

| Step | Budget (estimate) |
|---|---|
| Trigger to photo on phone | 0.5-1.5 s |
| Gemini answer to text card | 1.5-2.5 s (first answer at about 3 s) |
| Curated clip starts | 1-3 s more |
| Generated animation | 15-25 s, behind a "drawing..." card |

| Fallback | Use |
|---|---|
| MockDeviceKit: Display preview, phone camera as feed, `simulateTranscription` | All development; stage backup |
| Display Simulator extension: webcam background, WebM recorder | Video footage; Web App QA |
| Cached clips on the phone | Venue Wi-Fi failure |

## 4. Plan

Owners:
- **MrNetwork:** Android app and backend.
- **IceFrosst:** canvas player, display UX, video, deck, README.
- **IdelicMemor:** 5 verified sims, scene schema, accuracy check.

| When | What | Checkpoint |
|---|---|---|
| Fri 23:10-23:50 | Draft submitted (IceFrosst). Booth questions and device checkout (MrNetwork, IdelicMemor) | Draft in |
| Fri 23:50-02:00 | App runs on the mock; backend answers a test photo; scene schema agreed | CP1 |
| 02:00-08:00 | Sleep, off site | |
| Sat 08:00-12:00 | Real glasses: pinch, photo, text card | CP2. If it fails, go to the booth and stay on the mock |
| Sat 12:00-16:00 | 3 sims play on the Display; first hero take filmed | CP3 |
| Sat 16:00-18:00 | Generated fallback; Deeper and Done | |
| **Sat 18:00** | **Feature-cut line.** Hybrid go/no-go. Anything red is cut | |
| Sat 18:00-22:00 | Error, permission and offline states; sims 4-5; second language | CP4 |
| Sat 20:00-23:00 | Film all footage (IceFrosst only) | |
| Sat 23:59 | Feature freeze | |
| Sun 00:00-02:00 | Deck v1, README, submission text | |
| Sun 02:00-06:30 | Sleep | |
| Sun 06:30-08:00 | Video edit locked 08:00; deck PDF 08:30 | |
| Sun 09:00-09:30 | Video public, checked logged out | |
| Sun 09:45 | Status set to FINAL | |
| Sun 10:30-14:00 | Peer review, all three at the table | |

## 5. Brief compliance

| Requirement | Feature |
|---|---|
| Permissions | Camera and mic requested from a user action; a denied state has its own card |
| Errors | Stream, session, display and video errors map to short cards; unsure model says "not sure" |
| Performance trade-offs | Text first, animation after; one deck slide with measured latency |
| Connectivity | Offline card and cached clips; recreate the session after a Bluetooth drop |
| Device state | Taking the glasses off clears the display; low battery and heat cards; shown live with the mock's `doff()` / `fold()` |
| Consent | Capture only on pinch or voice; first-run card |
| Safe data | Frame deleted after the answer; no journal; refuses to explain people; keys on the server |
| Accessibility | Pinch or voice; captions always; narration optional; 16 px and 4.5:1 contrast; step-through mode |
| Pilot path | One physics class or a science centre, with a before/after quiz |

## 6. Questions and decisions

**Meta booth tonight**
1. Does a DAT camera and speech session survive while a Web App is on the Display?
2. Do Speech, Inputs and `camera.photo` work in Developer Mode with app ID `0`?
3. What are the measured times for photo to phone, `sendContent`, and video first frame?
4. What are the video limits (size, length, looping), and must the URL be public?
5. How fast can `image(bitmap=)` update? Is 2-5 fps possible?
6. Does phone text-to-speech play through the glasses during a session?
7. Which languages does Speech support? Is WebMCP on for the loaner pairs, and can Meta AI pass what it sees to our tool?
8. Can we keep one Display and Neural Band until Sunday 15:00?

**Owner decisions**
1. **One project only?** The guidebook allows one, but CLAUDE.md says "several challenges". I would drop the rest.
2. **Scenario and prop:** guitar, bike or kitchen. It must be at the table on Sunday.
3. **Gemini as the main model** for the €4k stack, with Opus only if Gemini's animations fail by Sat 14:00?
4. **Replace the A/B/C test** with curated sims plus a generated fallback, and no generated video?
5. **Who owns the Android build, and on which Android 12+ phone?** Also the project name.
