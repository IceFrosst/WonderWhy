---
tags:
  - type/checklist
  - topic/junction-2026
updated: 2026-11-13
---

# Meta booth: what we need to ask (Fri 13 Nov)

> [!summary]
> Take this to the Meta booth. Write the answers in the last column and push. **Question 1 decides how we build.** Contact: Amanda Le. Web Apps: Ming Lin, William La, Amy Lee, Odil Nikadambaev. Toolkit iOS: Dennis Punjabi.

## The two ways to build, in plain words
| | **Web App** | **Toolkit** (Device Access Toolkit) |
|---|---|---|
| What it is | A website that opens **on the glasses** | An app **on the phone** that uses the glasses as camera, mic and small screen |
| Sees the object | No camera | Yes: photo on a pinch |
| Hears the question | Only through a text field the wearer activates | Yes: on-device speech |
| Shows | Anything, drawn live at 30 fps, reacts to pinch and swipe | Only text, pictures or a video clip |
| Glasses | Display only (10 pairs) | All 20 pairs |

**Our idea needs both:** see the object (toolkit only) and show a live animation (Web App only).

| Option | How it works | Trade-off |
|---|---|---|
| **1. Toolkit only (our safe plan)** | Pinch → photo → AI → short text answer, then the animation plays as a **video clip** | Works for sure. Not interactive; each follow-up is a new clip |
| **2. Both together (best)** | Toolkit sees, Web App draws the animation live | Interactive (the animation changes as you ask). Meta's docs don't say whether both can run at once |

Speed, estimated (nothing measured): first text answer ~3-5 s after the pinch. A ready-made animation ~1-3 s more. An AI-generated one ~15-25 s more as video, less if drawn live.

## What Meta's docs already say (checked 13 Nov, late)
| Finding | Source |
|---|---|
| "Your app has **exclusive display control** during active sessions" (toolkit display) | Docs: Display overview, "Sessions" |
| A toolkit session can be paused or stopped when "the user performs a system action that opens another experience" or "another app or system feature starts a device session" | Docs: Session lifecycle |
| Only the toolkit can use the camera or microphone. Web Apps get speech only as dictated text, or through WebMCP | Docs index (`llms.txt`) |
| WebMCP is off by default; on in Developer Mode (may need a restart of glasses and app) | Docs: WebMCP agent tools |
| "Hey Meta, start <app name>" can launch our phone app by voice (needs Developer Center setup) | Docs: Voice invocations |

**So:** a toolkit display and a Web App on the Display at the same time is **out**. Still open: questions 1, 1b and 2. **The simulators can't answer them.** They are two separate tools with no shared "glasses system" deciding which app wins, so only Meta or a real pair can tell us.

## Our situation
We will build mostly on the **simulators** (Display Simulator for Web Apps, Mock Device Kit for the toolkit) and get only a **few hours on real glasses**. So we need to know what the simulators can't show us, and when we can have glasses.

## Questions
**A. How we build (ask first)**
| # | Ask | Why we need it | Answer |
|---|---|---|---|
| 1 | **We know a toolkit display session and a Web App can't share the Display. But can a toolkit session with only camera and speech (no display) stay alive while our Web App is open? Or does opening the Web App stop it?** | Decides option 1 or 2 | **No.** Both can't run in parallel (team, 14 Nov) |
| 1b | If it stops: can our phone app open our Web App on the glasses by itself after taking the photo (a handover), so the wearer doesn't have to launch it by hand? | A slower route to option 2 | **Maybe.** Handover might work; not confirmed (team, 14 Nov) |
| 2 | **Is WebMCP on for the loaner pairs? If the wearer says "Hey Meta, explain what I'm looking at", can Meta AI look through the camera and pass what it sees as text to our Web App's tool?** | Would give live animation with no toolkit at all | **No.** The Meta AI route won't work (team, 14 Nov) |
| 3 | Do speech, pinch input and photo capture work in Developer Mode without a registered app (app ID `0`)? | Whether we need Developer Center accounts | |

**B. Glasses time**
| # | Ask | Why we need it | Answer |
|---|---|---|---|
| 4 | How do we book glasses? How long is a slot, and how many can we get? | Plan our test sessions | |
| 5 | **Can we have a Display pair and Neural Band for peer review (Sun 10:30-14:00) and the pitch (14:15)?** | Reviewers must try it at our table | |
| 6 | Can we book a slot on Sunday morning to film the video? | Video is due 09:30 | |
| 7 | How long does setup take with a loaner pair (factory reset, pairing, Developer Mode)? Do we need our own Meta account ready? | Not to lose half a slot on setup | |
| 8 | How do Meta's judges see our demo: on real glasses at our table, or is a simulator recording enough? | What must work live | |

**C. Building on simulators**
| # | Ask | Why we need it | Answer |
|---|---|---|---|
| 9 | Does Mock Device Kit run in the Android emulator, or does it need a real Android phone? | Whether we can develop on a laptop alone | |
| 10 | Can the mock simulate Neural Band pinches, speech and the Display together? | Test the full loop without glasses | |
| 11 | What usually breaks when a project moves from the simulator to real glasses? | Fix it before our slot | |
| 12 | Does the Display Simulator look close enough to the real display (brightness, colours, text size) to design in and to film for the video? | Design and backup footage | |
| 13 | Is there a way to record what the wearer sees (camera view plus display) for the video? | The hero shot | |

**D. Speed and limits on real glasses**
| # | Ask | Why we need it | Answer |
|---|---|---|---|
| 14 | How long does a photo take to reach the phone? How long until a video clip starts on the Display? | Our speed budget, which we can't measure on a simulator | |
| 15 | Video on the Display: limits on size and length, can it loop, must the URL be public? | Our animation clips | |
| 16 | How fast can the phone app swap images on the Display? Is 2-5 per second possible? | Near-live animation without the Web App | |
| 17 | Can the phone speak through the glasses speakers during a session? | Spoken explanation | |
| 18 | Which languages does on-device speech support? | "Any language" feature | |
| 19 | How long does the battery last with photo-on-demand use, and does the venue Wi-Fi or Bluetooth crowding cause drops? | 3.5 hours of peer review | |

## What the simulators can answer (checked 13 Nov in Meta's repos)
The Display Simulator (Chrome extension) only fakes the Web App screen. Mock Device Kit runs **inside our phone app**: it fakes the glasses (camera from a file or the phone camera, pinch, speech, Display preview, don/doff, permissions). Neither fakes the Meta AI app, Bluetooth or the real device.

| Question | Sim answers it? | How |
|---|---|---|
| 1. Toolkit + Web App at the same time | **No** | Nothing in the sims arbitrates between apps. Docs: a session "may pause or stop when another experience takes over". Ask Meta or test on real glasses |
| 2. WebMCP on loaner pairs | No | Ask |
| 3. Developer Mode with app ID `0` | Partly | Mock works without registration; real glasses still need checking |
| 9-10. Mock in emulator, pinch + speech + Display together | **Yes** | Build the Android app with Mock Device Kit (needs an Android 12+ phone or an emulator image) |
| 12. Simulator vs real display look | Partly | Simulator does additive blending and backgrounds; brightness needs real glasses |
| 14. Photo to phone latency | **No** | Bluetooth only exists on real glasses. Our phone stand-in has a delay slider to model it |
| Model and render latency | **Yes** | Our bridge logs capture → detect → rendered for every request (`GET /latency`) |
| Web App load time on glasses | **Yes (estimate)** | Meta's `ai-glasses-webapp-optimize-performance` throttles to the glasses link (1 KB ≈ 16 ms) |
| Live physics animation at 30 fps | **Yes** | The ball trajectory scene runs in the simulator |
| 15-19. Video limits, image swap rate, speaker, languages, battery | No | Ask or test on glasses |

Test rig: `Meta_Challenge/app/` (glasses Web App + bridge + phone stand-in page).

## After the booth
- Answer 1 or 2 is **yes**: build option 2. The animation player becomes a Web App on Saturday.
- Only 1b is yes: option 1 first, handover as a stretch goal.
- All **no**: stay on option 1. Render the ~5 checked simulations to clips in advance.
- Either way the animation code is the same, so start it now.
- Build everything on the simulators first. Use glasses slots only to test, measure speed and film.

Background: [Platform_Notes](Platform_Notes.md), full plan: [Plan](Plan.md).
