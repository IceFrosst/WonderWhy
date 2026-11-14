---
tags:
  - type/checklist
  - topic/junction-2026
updated: 2026-11-14
---

# Test what we have now (Sat 14 Nov, updated 12:05)

For the next checkout use the [current loaner checklist](Loaner_Test.md). The [design handoff](Design_Handoff.md) records the end of the live session and links the simulator.

> [!summary]
> For whoever holds the glasses next. Everything is set up on IceFrost's **Pixel 8** and the **Display glasses + band**. Takes about 15 minutes. Write what you see in the last column, or just tell IceFrost.

## What is set up already
| Thing | State |
|---|---|
| Pixel 8 | Meta AI app (Developer Mode on), glasses and band paired. Our **Physics Lens** phone app installed, connected to the droplet, password set |
| Server (droplet) | Locked, recognition on Gemini (`gemini-4-carbon`), up to 40 s per photo |
| Glasses | Our **Web App** "Physics Lens" installed (in the glasses' app list) |

## The two apps (important)
| | Phone app (on the Pixel) | Web App (on the glasses) |
|---|---|---|
| Takes the photo, hears your question | Yes | No (Meta gives it no camera) |
| Shows | Cards with still pictures on the glasses | Live animations you can control |
| Opens with | "Look at something and pinch" | A menu, unless something was recognised in the last 2 minutes |

Things it knows well: **guitar, ball, bike, kettle, keys on a string, phone, spoon.** Anything else gets a short spoken-style answer, no pictures.

## Test 1: photo, question, pictures (phone app)
| # | Do | You should see | What happened |
|---|---|---|---|
| 1 | Open **Physics Lens** on the Pixel. If it says "Glasses not connected", tap **Connect glasses** | Glasses show "Physics Lens · Look at something and pinch" | |
| 2 | Look at one of the objects, keep it in the **middle** of your view. **Pinch** (thumb + index finger, quick tap) | "Taking the photo" with a progress bar | |
| 3 | First time only: a consent card. Pinch = Agree | | |
| 4 | Optional. If **Ask a question before sending a photo** is enabled in Developer, say your question or pinch to skip. The default submits immediately. | Progress bar "Thinking" or "Thinking about your question" | |
| 5 | Wait (10 to 30 s) | A card with a still picture, opened at the part your question was about | |
| 6 | Pinch = next step. Swipe left/right on your finger = other lens. Thumb + middle finger = back | Steps and lenses change | |
| 7 | Say a follow-up while a result is on screen, e.g. "why?" | An answer card | |

**If pinching does nothing** (the band buzzes but no reaction): tap **Explain what I see** on the phone instead, and tell IceFrost. The band's pinch arrives as a "drag" and the app now reads a short drag as a pinch; the threshold is a guess and may need tuning.

## Test 2: live animation (Web App, the "handover")
| # | Do | You should see | What happened |
|---|---|---|---|
| 1 | Do Test 1 steps 2 to 5 with one object | Result card from the phone app | |
| 2 | **Within 2 minutes**: Back out, open the glasses' app list, open **Physics Lens** (the Web App) | The same object as a **live animation**, not the menu. Time it | |
| 3 | Pinch / swipe in the Web App | Steps and lenses, live | |
| 4 | Go back to the phone app and pinch at a new object | Does the phone app still work, or does it need Connect again? | |

## Test 3: all in one (Web App takes the photo) — NEW, untested on glasses
Turn on **Film on glasses (Web App)** on the main phone screen, then tap **Connect glasses**. It takes no Display, so our Web App can stay in front. The Web App's home has a **Take photo** button: the bridge passes the request to the phone app (`GET /capture`, polled twice a second), the phone app takes the photo, the result comes back to the Web App as a normal `show`.

| # | Do | You should see | What happened |
|---|---|---|---|
| 1 | Pixel: Physics Lens, tap **Connect glasses** (nothing appears on the glasses in this mode) | Status "Glasses connected" | |
| 2 | Glasses: app grid, **bottom**, open **Physics Lens** (pin it) | Home screen, first button **Take photo** | |
| 3 | Look at a library object, select **Take photo** | 10 to 20 s later the live animation of that object | |
| 4 | If nothing happens: the phone log says why (camera refused while the Web App is in front?) | | |

To return to the native cards, turn **Film on glasses (Web App)** off and tap **Connect glasses**.

For the kettle film, press Down to focus the playback controls. Select **Inspect** to rotate with Left/Right. Up/Down changes mode between Rotate, Zoom and Pan. Pinch to show or reassemble the parts, and Back to return to the film. **Listen** reads the current caption if the device exposes a speech voice.

## State for whoever iterates next (12:05)
| Area | State | Where |
|---|---|---|
| Recognition | Gemini `gemini-4-carbon` on the droplet, `DETECT_TIMEOUT_MS=40000` (7 to 15 s per photo). `gemini-3.5-flash-lite` is 1 to 1.7 s with the same answers on our test photos, if speed matters more | `/opt/lens/data/.env` |
| Spoken question with the photo | After the photo: "What should I explain?", the words go to `/detect` as `question`; a library object opens at the lens the words point at (`AskFlow.visualFor`) | `android/.../GlassesController.kt`, `AskFlow.kt` |
| Progress card | Stage, bar (bitmap), seconds, refreshed each second | `Cards.progress` |
| Band pinch | Real glasses send a Drag, not Select. Short small drag = pinch, sideways drag = swipe. Thresholds are guesses (`DRAG_TAP_MS`, `DRAG_TAP_MOVE`, `DRAG_SWIPE_MOVE`); drags are logged with values to tune them | `GlassesController.onDrag` |
| Aim | Phone sends a centre crop (`focusBase64`); model classifies the centre | PROTOCOL.md |
| Glasses photo button route | Tested: the photo stays on the glasses. Meta AI has auto-import off and no camera-roll access, so it never reached the gallery. Not pursued | |

## Known problems (don't waste time on these)
- After "Bluetooth dropped", Connect sometimes keeps failing ("No eligible device"). Swipe the phone app away and reopen it. To fix in code: recreate the Wearables state on reconnect.
- A yellow frame around the whole card on the glasses: drawn by the glasses' system, not our cards. Not removable from the app.
- Spoken follow-ups after a result (`POST /ask`) failed once with `detect_failed` on Gemini.
- 3 of the Android unit tests fail on newer bridge content (`StillFrameTest` x2 on the regenerated pendulum/kettle stills, `SketchParseTest` fixture count). Explore stills and sketches may look wrong in the phone app.
- The bridge password (`LENS_TOKEN`) was shown on screen during setup: rotate it after testing (1Password item "Junction 2026 lens bridge token", then droplet `.env`, phone app setting, Web App URL in Meta AI).

## Known problems (don't waste time on these)
- (older list below)
- Slow: 10 to 30 s from pinch to card (photo over Bluetooth plus the model).
- The glasses sometimes end our session by themselves; the app reconnects in about 3 s. Pinch again after that.
- Spoken follow-ups (Test 1 step 7) failed once with a server error on Gemini; on Alex's list.
- The question card is English only.
- 3D "Explore" pictures and AI sketches may look wrong on the phone app.

## Report back
For each test: worked or not, the times, and anything confusing. A photo of the glasses' screen helps. If something breaks, leave the Pixel plugged into IceFrost's laptop: the app's log is read from there.
