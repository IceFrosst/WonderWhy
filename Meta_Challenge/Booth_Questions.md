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

## Questions
| # | Ask | Why we need it | Answer |
|---|---|---|---|
| **1** | **Can a toolkit session (camera, speech) keep running while a Web App is on the Display? If not, can one hand over to the other?** | Decides option 1 or 2 | |
| 2 | Can we keep one Display pair and a Neural Band until Sunday 15:00? If not, how do booking slots work? | No glasses means no demo | |
| 3 | Do speech, pinch input and photo capture work in Developer Mode without a registered app (app ID `0`)? | Whether we need Developer Center accounts | |
| 4 | How long does a photo take to reach the phone? How long until a video clip starts on the Display? | Our speed budget | |
| 5 | Video on the Display: limits on size and length, can it loop, must the URL be public? | Our animation clips | |
| 6 | How fast can the phone app swap images on the Display? Is 2-5 per second possible? | Would give near-live animation without the Web App | |
| 7 | Can the phone speak through the glasses speakers during a session? | Spoken explanation | |
| 8 | Which languages does on-device speech support? | "Any language" feature | |
| 9 | Is WebMCP on for the loaner pairs? Can Meta AI pass what it sees to our Web App? | A possible way around question 1 | |
| 10 | Does the Display Simulator match the real glasses closely enough to film the video in it? | Backup footage | |

## After the booth
- Answer 1 is **yes**: build option 2. The animation player becomes a Web App on Saturday.
- Answer 1 is **no**: stay on option 1. Render the ~5 checked simulations to clips in advance.
- Either way the animation code is the same, so start it now.

Background: [Platform_Notes](Platform_Notes.md), full plan: [Plan](Plan.md).
