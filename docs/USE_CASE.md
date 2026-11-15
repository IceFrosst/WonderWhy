# Use case: why WonderWhy, for whom, and how it gets adopted

[← README](../README.md) · [Architecture](ARCHITECTURE.md) · [UX, accessibility and trust](UX_ACCESSIBILITY_TRUST.md) · [Testing](TESTING.md)

## Pitch

> Curiosity usually dies in three seconds. You see something and wonder how it works, but looking it up means stopping, taking out your phone... So you don't.
>
> WonderWhy closes that gap. Look at anything, ask why, and a 3D explanation of the physics behind it appears in your AR glasses. Curiosity becomes understanding before the moment passes.
>
> **Curiosity and learning everyday unleashed.**

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
| **Library first: 12 curated objects with checked, pre-built explanations; anything else is generated** | Library objects are reliable, cheap (one short model call per pinch, see [cost](#feasibility-and-cost)) and checked in advance. Any other object is recognised in about 2 s and then gets a generated, *unverified* 3D explanation that takes about a minute (57 s measured) and costs more | [`detect.js`](../Meta_Challenge/app/bridge/detect.js) builds the prompt from each object's `detect_hint` and `sketch` generates the rest; [bridge README](../Meta_Challenge/app/bridge/README.md) (`SKETCH_PROVIDER`, `SKETCH_MODEL`) |
| **Pre-rendered films and stills** | Fast after recognition, works over weak Wi-Fi, no per-request video generation | [`bridge/media/`](../Meta_Challenge/app/bridge/media), [3D screen](../Meta_Challenge/app/glasses/docs/3d-screen.md) |
| **Offline fallback** | A venue with bad connectivity still works: the Web App's built-in demos and the Android offline picker of saved cards | [Android README](../Meta_Challenge/app/android/README.md), [state `02-home-offline`](../Meta_Challenge/app/glasses/docs/states/02-home-offline.png) |
| **Honest uncertainty** | A weak guess shows "Not sure"; objects outside the library get a generated explanation labelled *unverified* | [PROTOCOL `lowConfidence`](../Meta_Challenge/app/shared/PROTOCOL.md) |
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

### Coverage and time per object

| Case | Flow | Time |
|---|---|---|
| One of the 12 **library objects** | Recognition (`gemini-3.5-flash`), then pre-built lenses and films | About 2 s recognition (1.8 to 1.9 s measured on the server, two samples, 15 Nov); the rest is instant |
| **Any other object** | Recognition, then the bridge generates a live 3D explanation from the photo and the voice question (`SKETCH_PROVIDER=auto`, `SKETCH_MODEL=gemini-4-carbon`), marked *unverified* | About a minute: **57 s** measured for a pair of glasses (15 Nov); a flash-class model measured **19.5 s**. Single runs, team-reported, no log file in this repo |

### Approximate cost per use (estimate)

**These are estimates, not billing data.** Prices were read from Google's public [Gemini API pricing page](https://ai.google.dev/gemini-api/docs/pricing) on **15 Nov 2026**; they change, and our own account may be on credits. The bridge does not record token counts, so the token sizes below are our **assumptions**, not measurements.

Pricing facts read on 15 Nov 2026 (USD per 1M tokens, paid tier, standard):

| Model | Input | Output (incl. thinking) | Note |
|---|---|---|---|
| `gemini-4-carbon` | $2.00 until 30 Nov 2026, then $4.00 | $10.00 until 30 Nov 2026, then $20.00 | Used for generated 3D explanations |
| `gemini-3.6-flash` | $0.75 until 31 Dec 2026, then $1.50 | $3.75 until 31 Dec 2026, then $7.50 | **No price is listed for `gemini-3.5-flash`.** Google's model page calls it deprecated and says API requests to it are routed to `gemini-3.6-flash`, so we price recognition at the `gemini-3.6-flash` rates (our assumption that billing follows the routing). Our setting still says `gemini-3.5-flash` |

Token assumptions:

| Call | Low assumption | High assumption |
|---|---|---|
| Recognition | 1,500 in (about 1 image of about 1k tokens plus prompt), 200 out | 3,000 in (the bridge actually sends two JPEGs, full view and centre crop, plus the library prompt), 1,000 out including thinking (the output cap is 4,096) |
| Generated 3D sketch | 2,000 in, 8,000 out including thinking | 2,000 in, 12,000 out including thinking (output budget is 16,000) |

Computed cost per call (in USD, arithmetic on the numbers above):

| Call | Prices of 15 Nov 2026 (promotional) | List prices from 1 Jan 2027 (carbon: from 1 Dec 2026) |
|---|---|---|
| Recognition, library object (flash rates) | **$0.0019** low, **$0.0060** high | $0.0038 low, $0.0120 high |
| Generated sketch on `gemini-4-carbon` | **$0.084** low, **$0.124** high | $0.168 low, $0.248 high |
| Generated sketch on a flash model (the 19.5 s alternative, same tokens, flash rates; not what the live bridge uses) | $0.032 low, $0.047 high | $0.063 low, $0.093 high |

Library objects cost only the recognition. An unknown object costs the recognition **plus** the sketch.

Cost per 1,000 sessions (one pinch each, carbon for sketches; follow-up questions not included):

| Scenario | Prices of 15 Nov 2026 | List prices from 1 Jan 2027 |
|---|---|---|
| All 1,000 sessions on library objects | $1.88 to $6.00 | $3.75 to $12.00 |
| 20% unknown (800 library, 200 generated; every session is recognised) | $18.68 to $30.80 | $37.35 to $61.60 |

The "to" ranges run from the low to the high token assumption (low recognition with low sketch, high with high). In the 20% case, the sketches are roughly 80 to 90% of the bill. Between 1 Dec and 31 Dec 2026 the carbon list price applies while flash is still promotional; that mix is not shown.

What limits spend on the live bridge today: a per-IP rate limit on `/detect` and `/ask` (live: `LENS_RATE_PER_MIN=10`, `LENS_RATE_PER_HOUR=100`), 4 concurrent model calls, closed-set prompt, pre-rendered films (no per-request video generation).

Cost levers, **proposals, not built**:

| Lever | Status |
|---|---|
| **Cache generated sketches** and reuse them after the first generation of an object, so a repeated unknown object costs nothing and returns instantly | Not built: the bridge has no sketch cache, every pinch on an unknown object generates again. A reviewed sketch could also be promoted into the library |
| **Consider Meta's own models** (for example Llama vision models or Meta AI APIs) for recognition, and possibly for the sketch, to reduce cost | Not evaluated. We have not tested any Meta model for recognition or sketch quality, latency or price; evaluate later |
| Use the flash-class model for sketches when a minute is too long | Possible by changing `SKETCH_MODEL`; measured 19.5 s once, quality not compared |

### Other costs

| Item | Value |
|---|---|
| Extra calls | A follow-up question is one more small call (`POST /ask`) |
| Earlier measurement | Recognition on a Claude dev stand-in took p50 5.8 s; that is not the live provider and is only kept for history |

### Venue pilot target (proposal)

| | |
|---|---|
| Target | One science centre or museum gallery, or one school physics class |
| Scope | 10 to 20 objects physically in the room, authored as library entries |
| Status | **Proposal only. No venue has been contacted and no pilot has run** |
| Needed from the venue | A few loaner Display pairs for supervised visitors, Wi-Fi, a teacher or curator to check captions |
| Cost shape | Authoring hours (once per object) plus model calls per visitor session: for library objects about 0.2 to 0.6 US cent per recognition, and about $0.08 to $0.25 for each generated explanation (see the [cost table](#approximate-cost-per-use-estimate)). Hardware loan is the real constraint |

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
