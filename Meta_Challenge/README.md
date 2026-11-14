---
tags:
  - type/project
  - topic/junction-2026
updated: 2026-11-14
---

# Meta challenge: AI Glasses for Everyone, Everyday

> [!summary]
> Our **grand prize project**. Idea: **real-world explanation mode**. The trajectory-prediction idea is parked (see [Wearables_Research](../Research/Wearables_Research.md)).

## Idea: real-world explanation mode (draft, 13 Nov)
| Decision | Choice |
|---|---|
| What | Look at an object, ask, and get an explanation of the object or concept with animations of how the physics works |
| User | Students and curious people who want to keep learning and understand the world better |
| Where visuals play | **Everything on the glasses** (Ray-Ban Display). Only 10 Display pairs exist, so we must secure one |
| How animations are made | **A/B/C test three ways:** (1) real physics simulations, (2) AI-generated animated diagrams (SVG/canvas code), (3) generated video clips. Claude Opus 5.5 is strong at writing animation code |
| Trigger | **Both:** a tap for a quick "what is this", voice for a specific question |
| After an explanation | **Rabbit hole:** follow-up questions go deeper with more research and visuals. Say "done" and the visual and research disappear. No saved journal |
| Depth | High-school level by default. Gets deeper as the user digs further or asks harder questions |
| Language | Any language: answers in the language the user speaks |
| Hero shot | Not decided yet |
| Accuracy | Open. Later: sources and/or a simulation check |
| Privacy (bare bones) | The camera captures **only on a tap or voice request**, never streams in the background. Frames are not stored after the answer |
| Phones | Team has iPhone and Android; who has which is in issue #1. Android is easier (builds from Linux) |
| Name | Not yet |
| Scope | **Bare-bones shippable demo first**; nice-to-haves later |
| Build path | See [Platform_Notes](Platform_Notes.md): start DAT-only (B), go hybrid with a WebGL Web App (A) if time allows |

Notes:
- The Display web app gets no camera, so the camera goes glasses → phone (toolkit app) → model. Details in [Platform_Notes](Platform_Notes.md).
- Opus writing animation code takes seconds. Plan an instant short answer (text or voice) first, with the animation arriving after.
- The Gemini API tech prize is €4k and DeepMind is on the jury. Option: Gemini for seeing the object, Opus for writing the animation.

**Going to the Meta booth? Take [Booth_Questions](Booth_Questions.md).**

**Plan:** [Plan](Plan.md) (Fable 5.2 review, hour-by-hour plan, booth questions). **Build:** [app/README](app/README.md). **Submit:** [Submission](Submission.md), [Deck](Deck.md), [Glasses_Test](Glasses_Test.md).

## The brief (full text: [Brief](Brief.md), Discord: [Discord_Notes](Discord_Notes.md))
- Show how a first-person view enables new or better everyday interactions.
- Deliver: a working prototype plus a **deck**. It must handle permissions, errors, connectivity and device state changes.
- Consent, safe data practices and accessibility must show in the demo.
- Display and audio-first count equally, as do web apps and Device Access Toolkit integrations.
- **Judging:** 25% each for creativity and use case, technical execution, real-world value and feasibility, and UX (input, accessibility and trust).
- **Prize:** Ray-Ban Meta glasses for each member. Top teams are invited to Meta's AI forum on Wed 18 Nov.

## Constraints we know
- Camera only through the DAT phone app; web apps get no camera.
- 20 shared pairs. Ask whether we can keep one overnight.
- Contact: Amanda Le (mentor). Web Apps: Ming Lin, William La, Amy Lee, Odil Nikadambaev. DAT iOS: Dennis Punjabi.

## Idea shortlist
_To fill in._ Candidates: [Wearables_Research](../Research/Wearables_Research.md#other-glasses-ideas-not-yet-picked).

## Status (Sat 14 Nov)
| Item | State |
|---|---|
| Idea chosen | **Physics Lens** (explanation mode). Name still open |
| Booth questions answered | Partly: [Booth_Questions](Booth_Questions.md) |
| Code | Built overnight in [app/](app/README.md): 7 objects, 29 lenses, bridge, glasses Web App, Android app. Tested in simulators and an emulator only. **Never run on real glasses** |
| Docs | [Submission](Submission.md) (claims with test setups), [Deck](Deck.md), [Glasses_Test](Glasses_Test.md) (first real-glasses test) |
| Open for humans | Name, video, repo URL, live bridge deploy and lock, a Finnish read of the translations |
