---
tags:
  - type/handover
  - topic/junction-2026
updated: 2026-11-14
---

# Handover (Sat 14 Nov, 18:25) — start a fresh session from here

> [!summary]
> Product: **WonderWhy** (Meta Ray-Ban Display + Neural Band). Video: "Never stop asking why", max 1:30. Script: [Video_Script.md](Video_Script.md) (draft 8). Review: [Video_Review.md](Video_Review.md). Tests: [Test_Now.md](Test_Now.md).

## Running right now (on IceFrost's laptop)
| Job | Where | Notes |
|---|---|---|
| Fable 5.2 (xhigh) building **3 Act 1 variants** (A drawn line-art memory, B kinetic questions, C real grass + type) | Writes to `Meta_Challenge/video/act1/` (untracked); report in `/tmp/fable_act1.out`, done flag `/tmp/fable_act1.status` | Started 18:09. Silent renders, code only (no AI imagery: no image model). Uses the Kinetic Film skill in `Meta_Challenge/video/vendor/` (third-party, not committed) |

## Decisions made
- Name **WonderWhy**. Lines: *Why is the grass green?* · *How does the world work?* · *You used to ask why.* · *Then you stopped.* · **Look at anything.** · *An object or a concept.* (+ text-only examples) · **See how it really works.** · **Feed your curiosity. Grow your understanding of the world.** · *Keep asking. It goes deeper.* · **Never stop asking why.** · End: **WonderWhy. See how the world really works.** + **Come to our table. Try it.**
- Objects in the video: **earbuds** (reveal; built and live), **3D printer** (real run; the follow-up is now a **comparison with a second printer**, type unknown), **sauna**, **gym bike**, **the glasses explaining themselves**, grass (ending answer). Team decision: object animations will be **custom from scratch**, added later.
- Render method = the FieldSight film: one page with `window.renderFrame(t)`, Playwright + `/usr/bin/chromium`, ffmpeg (see `~/Projects/playground/hackathon/fieldsight/pitch/launch/README.md`). Kinetic Film style only for selected moments.
- Child: no AI image model available (grok-build login gone), so Act 1 is code-drawn or real footage. Child voice + SFX: ElevenLabs (needs a Junction key; the only key on file belongs to Medly, do not use it).

## Footage
| Filmed | Where it is |
|---|---|
| B1, B3, A (grass), sauna, gym bike, earbuds in, earbuds in palm, band plate, all crowd scenes (walk, stop, glasses on, earbuds out, pinch), friend share scene, 3D printer (wide, focus, macro) | IceFrost's phone and the friend's uploads. **Nothing new is on `main` yet** (checked 18:20: last commits are Stoa). Agree one folder: suggested `~/Videos/wonderwhy/raw/` on the laptop, not git (large files) |

**Collecting (18:30):** folder `~/Videos/wonderwhy/raw/{icefrost,mrnetwork,friend}/` on IceFrost's laptop. Script [video/ingest.sh](video/ingest.sh): `adb` (Pixel on USB), `sort <who>` (LocalSend drops in ~/Downloads), `index` (writes `raw/INDEX.md`: duration, res, fps, codec, HDR). iPhone footage: AirDrop to MrNetwork's Mac, then LocalSend to the laptop (keeps full quality; not WhatsApp).

Plan: IceFrost does a rough edit on the phone first; then the code pipeline polishes (grade grey/gold, captions, composites, sound).

## Still to do (owner)
| Task | Owner | Blocker |
|---|---|---|
| Copy phone footage to the laptop (`adb pull /sdcard/DCIM/Camera ~/Videos/wonderwhy/raw/`, phone on USB) | IceFrost | none |
| Rough edit on the phone | IceFrost | footage |
| Pick an Act 1 variant | IceFrost | Fable job |
| ElevenLabs key for Junction (child voice: 3 lines; SFX: click, whoosh, muffled crowd, rising tone, printer hum) + music source | IceFrost | key → 1Password `agent-general` |
| Second printer type for the comparison | IceFrost | — |
| Custom object animations (printer + comparison, sauna, gym bike, glasses/band, grass) | team | — |
| Glasses recordings ("Record display") of each object | IceFrost | objects |
| Voiceover lines in a quiet room | IceFrost | — |
| Rotate the bridge password (shown on screen during setup): 1Password "Junction 2026 lens bridge token" → droplet `.env` → phone app → Web App URL in Meta AI | laptop session | after filming |
| Spoken follow-up `/ask` failed on Gemini once | Alex (issue #3/#22) | — |
| Deploys: only the laptop's key is on the droplet (`deploy/deploy.sh`) | — | — |

## Deadlines
Rough cut tonight → safety upload (unlisted) **23:30** → fixes Sun 05:00-08:00 → **lock 08:00** → public **09:30** → **final submission 10:00** → peer review 10:30-14:00 (whole team at the table).
