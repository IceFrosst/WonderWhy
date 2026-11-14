---
tags:
  - type/checklist
  - topic/junction-2026
updated: 2026-11-14
---

# Test what we have now (Sat 14 Nov, 11:20)

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
| 4 | Card "What should I explain?": **say your question**, e.g. "how is it built?", "where does the energy go?", "how much?". Or pinch to skip | Progress bar "Thinking about your question" | |
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

## Known problems (don't waste time on these)
- Slow: 10 to 30 s from pinch to card (photo over Bluetooth plus the model).
- The glasses sometimes end our session by themselves; the app reconnects in about 3 s. Pinch again after that.
- Spoken follow-ups (Test 1 step 7) failed once with a server error on Gemini; on Alex's list.
- The question card is English only.
- 3D "Explore" pictures and AI sketches may look wrong on the phone app.

## Report back
For each test: worked or not, the times, and anything confusing. A photo of the glasses' screen helps. If something breaks, leave the Pixel plugged into IceFrost's laptop: the app's log is read from there.
