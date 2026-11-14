---
tags:
  - type/deck
  - topic/junction-2026
updated: 2026-11-15
---

# Pitch deck outline (3 minutes)

> [!summary]
> Top 5 pitch 3 min on stage, then judges ask for 3 min; mics are cut at 3:00 ([guidebook](../Research/Sources/Junction_2026_Participant_Guidebook.pdf), p. 13). The PDF is also a submission field. The video is a separate 2:00 cut.

**Meta judging criteria, as stated in [Brief](Brief.md), 25% each:**
| Code | Criterion |
|---|---|
| **C** | Creativity and use case (25%) |
| **T** | Technical execution (25%) |
| **V** | Real-world value and feasibility (25%) |
| **U** | User experience: input, accessibility and trust (25%) |

The guidebook's peer review uses different criteria (Innovation, Impact, Implementation). Slides 2, 3 and 7 also cover those. Talk-track is the one sentence in the "Say" column.

## Slides
| # | Time | Title | Say (one sentence) | On screen | Criterion |
|---|---|---|---|---|---|
| 1 | 0:00-0:12 | **Hook** | "Watch: I look at this ball, pinch, and see its path." | Live, 10 s: wearer or simulator view. Object in hand, pinch, glowing path appears. Title and punchline below | C |
| 2 | 0:12-0:30 | Who and what for | "Hands-on learners, 13 to 18, and anyone who learns better from a picture than a paragraph." | One person, one moment (hand on a guitar string, asking why the note rises). One line on deaf and dyslexic learners | C, V |
| 3 | 0:30-0:55 | Why glasses with a camera | "The camera knows what you are holding, and the display puts the answer on it, hands-free." | Three-row table: phone (stop, unlock, type), Meta AI (talks), Physics Lens (sees object, shows mechanism). Brief wording: "beyond mirroring a phone screen" | C, V |
| 4 | 0:55-1:50 | **Demo path** | "Pinch, one photo, the app names it, then I step through the physics." | Live run on glasses if the test passed, otherwise simulator: ball, then guitar, then one "Not sure" object. Change an angle with the D-pad | T, U |
| 5 | 1:50-2:10 | How it is built | "The phone app takes one photo, the bridge identifies it, the Web App draws scenes in 30 fps line art." | One diagram: glasses, phone app, bridge, model, Web App. Honest note on the handover | T |
| 6 | 2:10-2:30 | Trust and limits | "Camera is on only when you ask, the photo is never saved on the phone, and a weak guess says 'Not sure'." | Table: consent, camera, storage, errors, device states, captions. Mark each BUILT or TESTED | U, T |
| 7 | 2:30-2:48 | Path to adoption | "One physics class or science centre, a before and after quiz." | Pilot plan, what we would add: more objects, speech, languages | V |
| 8 | 2:48-3:00 | Close | "Look at anything. See the physics inside it." | Name, punchline, QR to demo and repo, team names | C |

## Slide detail
| # | Notes |
|---|---|
| 1 | Hook must work offline: prerendered scene, `forceObjectId` button on the [phone page](app/bridge/public/phone.html) if the model is slow. If the glasses fail, play the simulator on the laptop. Do not pretend |
| 2 | Name one number only if we have a source. TODO (human): none yet, leave it out |
| 3 | Source for the camera rule: Web Apps get no camera, only the phone app does ([Platform_Notes](Platform_Notes.md)). Do not claim a Meta AI "look and tell" feature does not exist, say it talks and we show |
| 4 | Show only what is TESTED. Real-glasses steps appear only if [Glasses_Test.md](Glasses_Test.md) passed. Say "recorded" for any pre-recorded part |
| 5 | Numbers allowed: 30 fps, about 182 KB gzipped, about 50 ms bridge to scene ([app README](app/README.md), laptop, headless Chrome). Detection time only if `npm run bench` has been run. Say plainly: camera app and Web App cannot run together on the glasses |
| 6 | Truth sources: [android README](app/android/README.md), [PROTOCOL](app/shared/PROTOCOL.md). The photo goes to the bridge and a model provider. Say so. First-run consent card is PLANNED unless built |
| 7 | No pilot has run. Say "planned" |

## Demo path (slide 4)
| Step | Action | Fallback |
|---|---|---|
| 1 | Pinch at the prop | Space on the phone page (pinch) |
| 2 | "Looking..." card, then label | Force-object button, no model needed |
| 3 | Scene step 1, pinch for next step | Enter key in the simulator |
| 4 | D-pad changes angle or speed | Arrow keys |
| 5 | Unknown object: "Not sure what this is" | Same on the phone page |
| 6 | Take glasses off: display blanks (mock) | Mock "Take off / put on" button, say it is mock |

## Q&A (judges ask for 3 min)
| Question | Honest answer |
|---|---|
| Who has this problem, and how do you know? | Learners who stop to look things up. We have not run a study, this is our assumption |
| What exists already? | Meta AI explains by voice. We show a checked animation of the mechanism, drawn for the additive display |
| What was technically hard? | The camera is only in the phone app and the animation only in the Web App, and they cannot run at once. We built a bridge that links them and a `/last` replay for a handover |
| What does not work yet? | Real glasses are barely tested. Speech, other languages, follow-ups, and unknown objects with animation are not built |
| Why not a phone? | A phone works, but you stop, unlock and aim. Glasses keep your hands on the object. We have not compared them in a user test |
| How do you handle privacy? | One photo per pinch, not saved on the phone, sent to our bridge and a model provider. No account, no history |
| How would it scale or who pays? | Schools and science centres first. We have no pricing and no pilot yet |
| How did you test it? | Simulator at 30 fps, Pixel 8 with Meta's mock glasses, Meta's test gate. TODO (human): add the real-glasses result from [Glasses_Test.md](Glasses_Test.md) |

## TODO (human)
- Team names, repo and demo QR on slide 8.
- Which props are on the table for peer review (Sun 10:30-14:00).
- Fill slide 4 with the real-glasses outcome. Keep the old text if the test did not pass.
