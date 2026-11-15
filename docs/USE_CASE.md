# Use case: why WonderWhy, for whom, and how it gets adopted

[← README](../README.md) · [Architecture](ARCHITECTURE.md) · [UX, accessibility and trust](UX_ACCESSIBILITY_TRUST.md) · [Testing](TESTING.md)

## Problem

Everyday objects hide their mechanism: a kettle that clicks off, a guitar string that changes pitch, a metal spoon that feels cold. The curiosity is strongest *while you hold the thing*. Today the answer costs a context switch: unlock a phone, find words for what you are looking at, read a wall of text. For many people (younger learners, people with dyslexia or low literacy, second-language speakers, anyone who learns visually) that text is the barrier, and the moment has passed anyway.

## Audience

| Who | Need | How WonderWhy helps |
|---|---|---|
| Students, roughly ages 13+, and curious adults | Understand the physics of things they meet, at high-school depth | One object → short answer, then 4 to 6 steps drawn on the object, one idea per step ([word caps in DESIGN.md](../Meta_Challenge/app/shared/DESIGN.md#words-word-caps-are-part-of-the-design)) |
| People for whom a spoken or written paragraph does not work | Explanation that shows instead of tells | The drawing carries the explanation, captions are one or two lines, and "Listen" reads a step aloud |
| Second-language speakers | Explanation in their language | Six languages (English, Finnish, Swedish, German, Spanish, French; machine-translated, see [limitations](../README.md#known-limitations)) |
| Educators and venues (science centres, museums, classes) | Interactive content that does not need a screen in every visitor's hand | Curated object library, content authored as data ([Design_Handoff](../Meta_Challenge/Design_Handoff.md#edit-and-preview)) |

## Why first-person and wearable, not a phone

| Need | Phone | Glasses + Neural Band |
|---|---|---|
| Say what you are asking about | Type or describe it | **The object in front of you is the query.** One pinch takes one photo; a centre crop tells the model what you are looking at |
| Keep the real thing in view | Phone and object compete for attention | The drawing is overlaid in your field of view on a see-through display, so you compare drawing and object |
| Hands | One hand holds the phone | Hands stay on the object (turn the kettle, pluck the string); the wrist band does the navigation |
| Input | Touch | Pinch to go deeper, swipe to change lens, swipe to spin the live 3D model ([controls](../Meta_Challenge/app/glasses/docs/3d-screen.md#controls-same-in-every-state)) |
| Mirroring | n/a | Not a mirrored phone screen: the Web App is designed for the 600 × 600 additive display (black is see-through, bright line art only), see [DESIGN.md](../Meta_Challenge/app/shared/DESIGN.md) |

The Android app is still part of the path because Web Apps on the Display get no camera (the camera comes through the Device Access Toolkit phone app). That is a platform fact recorded in the [platform notes](../Meta_Challenge/team-notes/Platform_Notes.md); the user does not need to touch the phone.

## Scenarios

Objects marked *library* have full lens sets and pre-rendered films in the repo ([`objects.json`](../Meta_Challenge/app/shared/objects.json)). Objects marked *filmed* exist as real footage and an Explore 3D chapter, not as a full lens set.

| Moment | Object | What the wearer sees | State |
|---|---|---|---|
| Making tea | Kettle | Cut open: heating element, circulating water, the switch that clicks off; "Turn it" spins and explodes the live 3D model | library, verified live on the loaner |
| Picking up a guitar | Guitar | Standing wave on the string; "What if" a shorter string; "The number" | library |
| Throwing a ball | Ball | Path bent by gravity; compare a rubber and a steel ball | library |
| Cycling to school | Bicycle | Gear ratio: force traded for speed | library |
| Setting the table | Metal spoon | Zoom into the crystal lattice: why metal feels cold | library |
| Commuting | Earbuds | How noise cancelling plays the noise back flipped | library |
| Looking at a phone | Phone | Seven layers pulled apart | library |
| Leaving the sauna | Sauna stove | Why steam "bites" | filmed ([DemoVideos](../DemoVideos/Objects/README.md)), Explore chapter in library |
| At the maker space | 3D printer | Hot nozzle lays plastic layer by layer | filmed, Explore chapter in library |
| At the gym | Exercise bike | Footage is an air bike (power rises roughly with speed cubed); the library's *Spin bike* chapter covers a magnetic brake instead, so the two do not match yet | filmed; Explore chapter exists for a different bike type |

Follow-ups work in the same flow: "Why does it click off?" jumps to the lens and step that answers it ([`POST /ask`](../Meta_Challenge/app/bridge/README.md#follow-up-questions)).

## Why this is feasible

| Design choice | Why it matters | Evidence |
|---|---|---|
| **Closed-set recognition** against a curated library, not open-ended generation | Reliable, cheap (one short model call per pinch, see [cost](#feasibility-and-cost)), explanations are checked in advance | [`detect.js`](../Meta_Challenge/app/bridge/detect.js) builds the prompt from each object's `detect_hint` |
| **Pre-rendered films and stills** | Fast after recognition, works over weak Wi-Fi, no per-request video generation | [`bridge/media/`](../Meta_Challenge/app/bridge/media), [3D screen](../Meta_Challenge/app/glasses/docs/3d-screen.md) |
| **Offline fallback** | A venue with bad connectivity still works: the Web App's built-in demos and the Android offline picker of saved cards | [Android README](../Meta_Challenge/app/android/README.md), [state `02-home-offline`](../Meta_Challenge/app/glasses/docs/states/02-home-offline.png) |
| **Honest uncertainty** | A weak guess shows "Not sure"; unknown objects can get a sketch labelled *unverified* | [PROTOCOL `lowConfidence`](../Meta_Challenge/app/shared/PROTOCOL.md) |
| **Content as data** | A venue's object set is an `objects.json` entry plus a render spec | [render3d README](../Meta_Challenge/app/render3d/README.md), [MODEL3D.md](../Meta_Challenge/app/shared/MODEL3D.md) |
| **No login for visitors** | Nothing to sign up for at a kiosk-style station | The emulator and demo need no account |

## Feasibility and cost

Numbers here are **estimates from the repo and git history, not measured project costs**. We did not time authoring sessions and did not pull billing data.

### Content authoring per object

| What | Measured from the repo | Estimate |
|---|---|---|
| Explore spec (6 beats, 3D shapes, labels, captions), one Python file per object in [`render3d/specs/`](../Meta_Challenge/app/render3d/specs) | 7 Explore specs, 146 to 293 lines each, average about 223 | |
| Live 3D spec (one lens built for the live line renderer), same folder | 6 live specs, 151 to 219 lines each, average about 183 (1,097 lines in total) | |
| Lens text (captions, answer, `detect_hint`) | 12 objects and 44 lens chapters in [`objects.json`](../Meta_Challenge/app/shared/objects.json) | |
| Time per object | Not recorded. The git history only gives commit gaps: the six Explore specs went from "half done" (14 Nov 08:35) to "finished, every still checked against its caption" (11:33) in about three hours, and the six live specs landed in a single commit | **About 1 to 3 hours per object** for a person who knows the spec format, including checking each still against its caption (our estimate; physics fact-checking by a teacher comes on top) |
| Rendering and export | Automatic: `render.mjs` writes the films, stills and `tracks.json`, [`export-media`](../Meta_Challenge/app/bridge/README.md) the card stills | Minutes of machine time per object |

A venue's 10 to 20 objects are therefore roughly 10 to 60 person-hours of authoring (estimate), with no change to the app code ([Design_Handoff "Edit and preview"](../Meta_Challenge/Design_Handoff.md#edit-and-preview)).

### Model cost per recognition

| Item | Value |
|---|---|
| Model | Gemini Flash tier: `gemini-3.5-flash` on the live bridge |
| Calls per pinch | One `/detect` call: two JPEGs (full view and centre crop) plus a short closed-set prompt listing the library's objects, JSON reply with an id, a confidence and one short answer ([`detect.js`](../Meta_Challenge/app/bridge/detect.js)) |
| Size (estimate) | Roughly 1 to 3 thousand input tokens and under 100 visible output tokens per call; the output cap is set higher because Gemini counts thinking tokens against it |
| Cost (estimate) | A fraction of a cent per recognition at Flash-tier list prices. Check Google's current price list; we have not measured billing |
| Time (measured) | About 1.8 to 1.9 s detect time on the server for library objects (15 Nov 07:55, two samples). End to end depends on the network |
| Extra calls | A follow-up question is one more small call; a generated sketch for an unknown object is one more call (off by default) |
| Cost control | Closed set, pre-rendered films (no per-request video generation), a per-IP rate limit and 4 concurrent model calls on the live bridge |

### Venue pilot target (proposal)

| | |
|---|---|
| Target | One science centre or museum gallery, or one school physics class |
| Scope | 10 to 20 objects physically in the room, authored as library entries |
| Status | **Proposal only. No venue has been contacted and no pilot has run** |
| Needed from the venue | A few loaner Display pairs for supervised visitors, Wi-Fi, a teacher or curator to check captions |
| Cost shape | Authoring hours (once per object) plus a few cents of model calls per visitor session (assuming a handful of recognitions per visit). Hardware loan is the real constraint |

## Adoption and pilot path

**Status: proposal. No pilot has run.** The only pilot wording in the original submission is "one physics class or a science centre, with a before and after quiz" ([Submission.md](../Meta_Challenge/Submission.md#pilot-path)). The rest below is our plan built on what the repo already does.

| Step | What | Success measure |
|---|---|---|
| 1. Pilot venue | One science centre or museum gallery, or one physics class, with a loaner Display pair per supervised visitor | Visitors finish an explanation without staff help |
| 2. Curate the set | 10 to 20 objects that are physically in the venue; author them as library entries, check the captions with a teacher | Recognition hit rate on the venue's own objects; share of "Not sure" cards |
| 3. Measure | Before/after quiz on the concepts shown; the bridge's latency log ([`/latency`](../Meta_Challenge/app/bridge/README.md#reading-latency)) for pinch-to-content time | Quiz gain against a phone-text control group; median time to first content |
| 4. Consent at the door | First-run consent card is already in the app; add venue signage and a staff-supervised handover | Zero photos stored (already the design); consent accepted before first capture |
| 5. Scale | Add venues by adding library entries; switch the bridge to the venue's own region/provider | Cost per visitor session |

Known blockers to adoption, stated plainly: supply of Display hardware, one-photo latency of several seconds on the real path, no audited provider data retention, translations needing native review. They are listed in the [README](../README.md#known-limitations).
