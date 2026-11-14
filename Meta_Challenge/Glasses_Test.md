---
tags:
  - type/checklist
  - topic/junction-2026
updated: 2026-11-14
---

# First real-glasses test (20 minutes)

> [!summary]
> Nothing has run on real glasses yet. Ordered so the tests that change our plan come first. Bring: Display pair, Neural Band, Android phone (12+), laptop, stopwatch, a ball, a guitar or kettle. Write results in the pass/fail column.
>
> The same rows can be ticked in the Android app under Developer > Glasses check, which produces a text report to share (built and run on the emulator only).

**Prepare before the slot** (not counted in the 20 min): phone has the Meta AI app v272+ and our APK installed with "Mock glasses" OFF, app restarted ([android README](app/android/README.md)). Bridge token is at hand (ask a teammate, never in git). Open booth questions: [Booth_Questions](Booth_Questions.md).

| # | Min | Step | What to do | Expected | Pass / fail | If it fails | Skip if short? |
|---|---|---|---|---|---|---|---|
| 1 | 0-3 | Developer Mode and versions | Meta AI app: Developer Mode on (tap app version 5 times). Note app version and glasses version. Glasses paired, Display model | App v272+, Developer Mode on, glasses shown as connected. Version numbers noted | [ ] | Update the app, factory reset the loaner ([Discord_Notes](Discord_Notes.md) links), ask the Meta booth. Note: the v272+/v125+ numbers are unverified in Meta's repos ([Plan](Plan.md)) | No |
| 2 | 3-6 | **Key test: phone app registration** | Open our app, Mock OFF, tap Connect | Meta AI opens, you approve, it returns through `physicslens://`, state "connected" | [ ] | Note the exact error. Check restart after switching mock off. Without this, steps 3-6 are blocked: switch to Web App tests (step 7+) | No |
| 3 | 6-8 | Camera permission | Allow camera when asked. Then deny once and retry | Allow: session starts. Deny: "camera denied" card with "Try again", no crash | [ ] | Check Meta AI app permissions. Record what the card shows | No |
| 4 | 8-11 | **Pinch to photo to card** | Look at the ball. Pinch (`Select`). Then try the phone button "Explain what I see" | "Looking..." card, then label and concept card on the Display. "Again" and "Done" work | [ ] | Try the capture button instead of pinch. If no card: phone button only. Check bridge `/health` and token. If provider is `mock`, a "Not sure" card is expected, so use a forced object | No |
| 5 | 11-14 | **Latency** | Stopwatch from the pinch to the card, 3 tries. Then open the bridge `/latency` page | Times written down. Bridge shows `preUploadMs` (Bluetooth photo transfer), detect time and render time | [ ] | If `/latency` is empty, check the token header. Record stopwatch times only | Partly: stopwatch only |
| 6 | 14-17 | **Key test: handover phone app to Web App** | After step 4 shows a card, open the Web App on the glasses ("Physics Lens" in the app list). Watch the Display | Web App connects and opens the same scene (`hello` triggers a replay of the last result, `GET /last`, within 120 s). Note: does the phone app session survive, or does the Display take over | [ ] | If the Web App opens empty, check it is inside 120 s and the token. If opening the Web App kills the phone session, record it. Plan then: phone app shows scenes alone, or Web App alone with forced objects | No |
| 6b | 17-19 | **Phone-only path (stills)** | Close the Web App. In our app, pinch at the ball, then step through the card: pinch = next step, D-pad left/right = lens. No Web App open. App needs the bridge's `/media/` | Card on the Display shows the drawing cut out of the still, caption and buttons inside 600x600, nothing cut off. Read it at arm's length indoors | [ ] | Record what overflows or is unreadable. If step 6 failed, this is the demo path: make it the only one. Clips are not built, only stills | No |
| 6c | 19-21 | **Voice question, real microphone** | After a result is on the Display, say "why does it curve?" (ball) and then one question in a noisy corner. Allow microphone when asked | "Heard" line, then an answer card that opens the matching lens and step. Note the delay from end of speech to card, and the locale | [ ] | Only the kit's injected text was tested. If no speech arrives, note the permission and the SDK log. Fallback: typed question on the phone | No |
| 7 | 21-23 | Web App install by QR | Scan [install-qr.png](app/deploy/install-qr.png) with the **phone** camera | Meta AI opens and adds "Physics Lens" to the glasses. Do this early if step 6 needs it | [ ] | Use the deep link in [deploy/README](app/deploy/README.md). Check Developer Mode and HTTPS | Do before step 6 |
| 8 | 23-25 | Scenes at 600x600 additive | Open the ball and guitar scenes on the Display. Read the captions at arm's length, indoors and near a window | Text readable (16 px minimum), lines visible against the real world, no flicker. Fps looks smooth (we have only measured 30 fps in a simulator) | [ ] | Note which colours or lines wash out. Fix with brighter strokes later | Skip scene two |
| 9 | 25-26 | Input: D-pad, pinch, back | D-pad changes angle or speed, pinch steps, back leaves | Matches the arrow, Enter, Esc behaviour | [ ] | Note which gesture is wrong | Yes |
| 10 | 26-27 | Bridge token entry | Open the Web App with `?k=<token>` once. Close and reopen without it | Works both times (kept in `localStorage`). A wrong token shows "Bridge locked" | [ ] | Check the link has `k=`. Note that typing a token on glasses is not practical | Yes |
| 11 | 27-28 | Take off, fold, battery | Take the glasses off, put them on, fold them. Note battery % at start and end | Taking off blanks the Display or stops the session cleanly. No crash. Battery % noted | [ ] | Record the state codes shown | Yes |
| 12 | 28-29 | Offline | Turn phone Wi-Fi/data off, pinch | "Offline" or error card, then recovers when back on | [ ] | Record what happens | Yes |
| 13 | 29-30 | Language switch | Phone app Language picker to Suomi, pinch at the ball. Read the card | Finnish label, caption and buttons on the Display. Å, ä and ö show. Stills keep English labels (known). Machine-translated: ask a Finnish speaker if the physics words are right | [ ] | Note any missing glyph or wrong word | Yes |
| 14 | 30-31 | First-run consent | Clear app data (Web App: clear storage). Start the Web App | Consent card first, then the home screen. The Android app has a first-run consent card too (only seen on an emulator): clear its app data, the first trigger should show "Before you start", pinch = Agree | [ ] | Record what is shown | Yes |

> [!note]
> Rows add up past 20 minutes on purpose (the Min column runs to 31). **Do in this order: 1, 2, 3, 4, 5, 6, then 6b and 6c.** Do 7 first if the Web App is not yet installed. **If time runs out, skip 8 to 14**, in this order of cutting: 14, 13, 12, 11, 10, 9. Steps 2, 4, 6 and 6b decide the plan; 6c decides whether voice goes in the demo. The phone app and the Web App cannot run together, so 6b is done with the Web App closed.

## What the results decide
| Result | Plan |
|---|---|
| 2 fails | Fix registration first. Demo on mock for the video, say so |
| 4 passes, 6 fails | Phone app alone shows the cards and stills (6b). Web App shown separately with forced objects |
| 6b unreadable | Larger still band or text-only cards; film the Web App in the simulator |
| 6c fails | No voice in the live demo; show the typed question, say voice was tested only with injected text |
| 4 and 6 pass | Demo the handover. Latency numbers go in the deck |
| 8 fails (unreadable) | Increase stroke width and contrast. Film in the simulator |

## Booth questions this test answers ([Booth_Questions](Booth_Questions.md))
| Q | Answered by step |
|---|---|
| 1b: can the phone app hand over to the Web App | 6 |
| 3: Developer Mode works with app ID 0 | 1, 2 |
| 11: what breaks from simulator to glasses | any failed step |
| 12: simulator vs real display look | 8 |
| 14: photo to phone and display latency | 5 |
| Voice question on the real microphone (not a booth question) | 6c |
| 19: battery use | 11 |

## Record
| Item | Value |
|---|---|
| Meta AI app version | |
| Glasses version | |
| Phone model, Android version | |
| Stopwatch times (3) | |
| `/latency` p50 and p90 | |
| Battery start and end | |
| Voice: delay from end of speech to card, locale | |
| Stills legible at arm's length (yes/no, what overflows) | |
| Notes | |
