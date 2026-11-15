---
tags:
  - type/script
  - topic/junction-2026
updated: 2026-11-14
---

# Video script: "Never stop asking why" (draft 13; intro + kinetic drop + logo end card)

> [!summary]
> **Product: WonderWhy** (Meta Ray-Ban Display + Neural Band). **Max 1:30.** Every shot readable muted (phone viewer, first 3 s must hold).
> Story in colour: **gold (child) → grey (adult, earbuds in, shut off) → gold + glowing lines (glasses)**.
> **Objects:** grass (child + ending), **noise-cancelling earbuds** (reveal, built and live), **3D printer** (one real run + answer; no second-printer comparison), **sauna** + **gym bike** (montage), **the glasses explaining themselves** (share scene).
> **Source key:** **CODE** = code-drawn on black (no AI image model available) · **REAL** = filmed · **GLASS** = Meta AI "Record display" from the real glasses · **RENDER** = our clean object animation, Screen-blended in a fixed square right of centre (the display is a fixed panel in one eye; lines are never stuck to the object).
> **Edit rules:** waits are cut out. Corner tag on glasses shots: *Recorded on the glasses · edited for time*. Blur faces of other participants in crowd shots.

## Current cut — v15, 1:14.667

Older printer POV removed (241 frames); P6 Heat stays at 0:27.367–0:33.367 with *How does it build this?*. Exact copy *Feed your curiosity. Grow your understanding of the world. · WonderWhy* moves to the sharing scene's side space at 0:46.367–0:48.767. All retained scene lengths unchanged; later scenes shift 8.033 seconds earlier. Full decode and script syntax checks passed; independent visual/code review accepted (2240 frames, 30 fps). Continuous playback/audio assessment remains outstanding.

**Next:** add owner-approved **Austin take A** (`video/voices/child/lines/austin_timid_A.mp3`) to a separate v16; different narrator for the rest is requested but not selected/generated. Music and SFX remain pending. No new ElevenLabs credits spent.

### Historical edit notes

Changes 15 Nov ~04:15 (v14, 1:22.70): **slop_machine box cut** (curiosity: muted stays). **Printer answer = team's P6 Heat** (`act4_printer/final/P6_heat.mp4`, `6852ab3`: one bit of filament 20 °C → 215 °C → solid → fused, line *Melted at 215°, solid in seconds.*), replacing Alex's AR V02/V09. **Spoken prompt on every example**, earbuds style (cyan listening glyph, live words, then "sent" into the panel): printer *How does it build this?* (replaces "Ask out loud"), sauna *Why does steam feel hotter?*, bike *Why is faster so much harder?*; earbuds keeps *How does the noise cancellation work?*. *Feed your curiosity. Grow your understanding of the world. · WonderWhy* stays at the start of the printer shot. Overlays: `edits/overlays/prompts/`.

Changes 15 Nov ~03:55 (v13, 1:22.70): second detection box on IceFrost's head through the grey hall walk: **curiosity: muted** (hand-tracked, 0:10.1–0:14.4, fades before the glasses go on).

Changes 15 Nov ~03:40 (v12, **1:22.70**): caption *Even this?* removed; **how-it-works diagram removed** (owner); YOLO-style red detection box on the phone in the grey hall walk: **slop_machine 0.99** (hand-tracked, 0:09.9–0:11.7; `edits/overlays/slop/make.py`). Next: voice-over, SFX, music.

Changes 15 Nov ~03:20 (v11, **1:26.70 — under 1:30**): intro is now Alex's **R_B3_match** (`video/ar/renders/`, kid upright, hair matched to IceFrost, end pose matched to the grass clip). **Printer answer** (was placeholder C) = Alex's **V02** scan-line lock-on + exploding head (0.9–4.9 s) → **V09** answer in the fixed panel (4.9–6.9 s), 6 s, caption *Opens the part you asked about* kept. **Glasses-explain-themselves (F) removed** by owner: no explanation in the share scene. **Minecraft toast** on the grass ending when IceFrost touches the grass: *Advancement Made! · Touch Grass* (code-drawn 5x7 pixel font + grass block, top-right, 1:12.2–1:15.9; `edits/overlays/achievement/make.py`). Note: *Even this?* (caption 18) now has no payoff.

Changes 15 Nov ~02:50: **LOOK AT / ANYTHING.** now stacked on the **left** panel; *ANYTHING.* breaks into **OBJECTS** / **CONCEPTS** on the rows below (LOOK AT stays). The Meta Ray-Ban Display callout stays on the right until the cut. **Earbuds copy** (re-rendered V3, `earbuds_v3/out/V3_air_curiosity.mp4`): amber kicker *Something piqued your curiosity?* → live question **"How does the noise cancellation work?"** (was "Wait, how did these block all that?") → big line **Visual explanation with the physics behind it.** (replaces "See how it really works."). `cinematic_v10.mp4`, 1:32.70.

Changes 15 Nov ~02:30: **reveal subtitles replaced by overlays** on the blurred side panels (never on the face): glasses-on → gold callout line from the lens to *WORN HERE · META RAY-BAN DISPLAY · AI glasses with a display in the lens*; then **LOOK AT** (left) / **ANYTHING.** (right) slam in, *ANYTHING.* breaks apart into **OBJECTS** (left) / **CONCEPTS** (right). The example list (Earbuds · Sauna steam · Wi-Fi · sky) is dropped. **STOPPED.** now runs diagonally (rising left→right, 10°) through the side panels and below the face and phone; the hit flash is removed and rays fade out around face/phone. `cinematic_v9.mp4` **1:32.70** (2.70 s over). Overlays: `edits/overlays/look/` (HTML, transparent frames) + `edits/cinematic/overlay_fx.py` after `build.sh`.

Changes 15 Nov ~00:50: **STOPPED. now lands on the grey grass shot** (red slam + burst keyed over IceFrost scrolling, 1.63 s, fades out); the drop ends on *AND THEN YOU* and hard-cuts straight into it. `cinematic_v8.mp4` = **1:32.70** (2.70 s over 1:30). Overlay: `edits/cinematic/overlay_stopped.py` after `build.sh`.

Changes 15 Nov ~00:30 (draft 13): **kinetic drop** between the gold intro and the grey grass, built with the Scenario *Kinetic Film* engine (code only; no Scenario music/AI used): gold slam *YOU USED TO / ASK WHY.* → cold flip *AND THEN / YOU* → **STOPPED.** in red on black → hard cut to IceFrost on the grass (2.73 s, local `edits/kinetic/bomb/`). Captions 3/4 removed from the grass shot (no double text). **End card** now the kinetic Logo block with the Orbit Star logo (`Meta_Challenge/brand/` on `claude/wizardly-franklin-515rin`), tagline + CTA line. Video: `cinematic_v7.mp4`, **1:33.67 — 3.67 s over the 1:30 cap; owner to choose cuts.** Silent kinetic pieces: hit SFX/music pending.

Changes 14 Nov 23:55 (draft 12): **Act 1 is now the team's intro `R_B3_lines`** (planet → kid's eye → kid in golden grass, 6.0 s, one question: *How does it all really work?*). It replaces the 4 s kinetic-questions variant B; the two old child lines are folded into this one. Mostly done; polish continues on the animation branch. **Runtime:** +2 s makes the current cut about **1:30.93**, 0.93 s over the 1:30 cap; a trim still needs owner approval. **In the video:** `cinematic_v6.mp4` (local, `edits/cinematic/`) = v5 with this intro as item A; **1:30.93**, 2728 frames, full decode OK, hard cut to grey at 0:06.00. All other segments unchanged (+2 s offset). Intro is silent until VO/music are added.

Changes 14 Nov 22:10: the earbuds-case-on-table shot (old shot 3) is cut (weak); Act 2 opens on the grass.
Changes from draft 8: Act 1 is **CODE** (three variants being built, pick one), not AI · footage now mapped to real clip names (see [Footage map](#footage-map)) · object animations are **custom from scratch** (team, added later).

**Latest edit:** owner also removed the short rear-view crowd walk (shot 5; `IMG_5554.MOV`, reveal frames 64–99 / 1.2 s). Grass now cuts directly to the standing/glasses shot. The second-printer video, follow-up question and comparison answer remain removed (shots 13–14; edit items 5/D); first printer + answer stay. `cinematic_v5.mp4` is **1:28.93**, under 1:30. All other segments retain their frames/durations; reveal cues move 1.2 s earlier and *Then you stopped.* remains readable over the standing shot. Shot/caption IDs stay stable; scene time ranges below are story targets, not the current whole-clip viewing timeline. **Pending:** first-printer and glasses explanation placeholders, listening review. **Checked:** full audio/video decode; exact 36-frame removal and sample-exact matching audio cut; all other segment frames/captions unchanged; cut/reveal frames visually checked; local preview HTTP 200. **Next:** insert the first-printer explanation.

## All on-screen copy, in order
| # | Line | Style |
|---|---|---|
| 1 | *How does it all really work?* | child, soft, handwritten gold ("How" from 3.3 s, rest 4.2–5.15 s) |
| 3 | **YOU USED TO ASK WHY.** | kinetic drop, gold slam |
| 4 | **AND THEN YOU** (black) → **STOPPED.** in red, slammed over the grey grass shot | kinetic drop |
| 5 | **LOOK AT** / **ANYTHING.** | side-panel overlay, kinetic |
| 6 | *ANYTHING.* breaks into **OBJECTS** / **CONCEPTS** | side-panel overlay |
| 7 | Callout: *META RAY-BAN DISPLAY · AI glasses with a display in the lens* | at glasses-on, line from the lens |
| 8 | *Something piqued your curiosity?* → **Visual explanation with the physics behind it.** | earbuds shot, kicker + big line |
| 9 | **Feed your curiosity. Grow your understanding of the world.** · *WonderWhy* | big + tag |
| 10 | *Ask out loud* | label |
| 11 | *Opens the part you asked about* | label |
| 13 | *Why steam bites* | label |
| 14 | *Brakes without touching* | label |
| 15 | *It sees it. AI names it. Real physics explains it.* | diagram caption |
| 16 | *Pinch. One photo. Answer in your view.* | caption |
| 17 | *Try it.* | label |
| 18 | *Even this?* | label |
| 19 | *It even explains itself.* | label |
| 20 | **Never stop asking why.** | big, gold |
| 21 | **WonderWhy. See how the world really works.** | end card |
| 22 | **Come to our table. Try it.** · Meta Ray-Ban Display · Junction 2026 | end card |

## Spoken lines (VO / on set, burned-in captions)
| Who | Line | Shot |
|---|---|---|
| Child (ElevenLabs) | "How does it all really work?" (soft, wondering; starts 3.3 s) | 1 |
| Child, happy | "Why?" | 24 |
| IceFrost | "How does the noise cancellation work?" | 8 |
| IceFrost (VO) | "How does it build this?" | 11 |
| IceFrost | "Here, try these." | 19 |
| Friend | "Wait, how do these even work?" | 20 |
| Friend | real laugh / "no way" | 23 |

## Act 1: the child (0:00-0:06) — gold, dreamy · CODE · **R_B3_lines**
**Chosen intro:** `R_B3_lines`, one continuous overhead pull-back in glowing gold lines on dusk. Final render [`act1_intro/final/R_B3_lines.mp4`](https://github.com/IceFrosst/Junction-2026/tree/claude/confident-keller-pxs2tu/Meta_Challenge/video/act1_intro/final) on `claude/confident-keller-pxs2tu` (`e2a6c7b`): 1920×1080, 30 fps, 6.0 s, silent. Source + notes: `act1_intro/R_B3_lines/`. Old variants A/B/C (`act1/`) are retired.
| # | Time | Source | Shot | Text | Audio |
|---|---|---|---|---|---|
| 1a | 0:00-1.3 | CODE | Line-drawn Earth turning in the dark (moon, orbit rings); the dark around it becomes a **pupil**, iris fibres draw in | — | Felt piano already playing, low space-air tone |
| 1b | 1.3-3.0 | CODE | Eye, lashes, then the kid's face looking straight up at us; the Earth is the reflection in his eye | — | Space tone turns into evening field air (wind, far crickets) at 1.4 s |
| 1c | 3.0-5.35 | CODE | Pull back: whole kid lying in glowing grass, arms behind head, knee up, dandelion clocks | *How does it all really work?* ("How" 3.3 s, rest writes on 4.2–5.15 s) | Child VO from 3.3 s · piano resolves to a warm chord |
| 1d | 5.35-6.0 | CODE | Hold: grass sways, motes drift. Fully gold → **hard cut** to the grey adult on the grass | — | Chord held, wind only |

**Polish still open (team):** faint "How" overlaps the raised arm at 3.6–3.9 s; Earth reflection is only a few pixels at the end; record child VO + piano/air bed (render is silent). Fallback wording if wanted: *How does the world really work?* (echoes the end card); change `text.q` in `config.json`.

## Act 2: the adult, shut off (0:06-0:11) — grey, fast, real
Desaturated, cold. **Earbuds in from shot 4 on**: outside sound muffled (low-pass), only a dull tick is clear.
| # | Time | Source | Shot | Text | Audio |
|---|---|---|---|---|---|
| 4 | 0:06-0:09 | REAL | Hard cut from the red STOPPED. → IceFrost on grass outside, earbuds in, head down, scrolling | — (lines now in the kinetic drop just before) | Sound drops to muffled, wind, tick |

## Act 3: the reveal (0:09-0:20) — earbuds
| # | Time | Source | Shot | Effect | Text | Audio |
|---|---|---|---|---|---|---|
| 6 | 0:09-0:11 | REAL | Stops and puts on the glasses | **Grade floods back to gold** | **Look at anything.** → *An object or a concept.* → text list | Soft rising tone |
| 7 | 0:11-0:12 | REAL | Pulls the earbuds out | | | **Crowd floods back in, full and loud** |
| 8 | 0:12-0:14 | REAL | Earbuds in the palm, puzzled, pinches with the band | Close on hand | | "Wait, how did these block all that?" · click |
| 9 | 0:14-0:17 | REAL + RENDER | Noise wave + flipped "anti-noise" wave merge into a **flat line** | Fade in at the fixed square | **See how it really works.** | Music in, bright; crowd dips |
| 10 | 0:17-0:20 | GLASS | Real recording of the earbuds answer, yellow system frame left in | Corner tag | **Feed your curiosity. Grow your understanding of the world.** · *WonderWhy* | Music |

## Act 4: real run + answer — 3D printer
| # | Time | Source | Shot | Effect | Text | Audio |
|---|---|---|---|---|---|---|
| 11 | 0:20-0:23 | REAL (POV) | POV at the printer, hand reaches, pinch | Slow POV push | *Ask out loud* | Printer hum, click · VO "How does it build this?" |
| 12 | 0:23-0:29 | GLASS | Answer: hot plastic squeezed out, laid layer by layer | Cut on each pinch | *Opens the part you asked about* | Click per step |

## Act 5: everyday life has a backstage (0:38-0:46) — montage

**Sauna choice (22:44): S2 Journey**, selected by IceFrost's screenshot. Full 5 s composite; [source on the animation branch](https://github.com/IceFrosst/Junction-2026/tree/claude/confident-keller-pxs2tu/Meta_Challenge/video/act5_sauna/S2_journey). Fixed display: water → hot stones → steam → condensation on skin. Included in the current viewing cut. Its full five seconds remain unchanged after removing the second-printer sequence.

| # | Time | Source | Shot | Effect | Text | Audio |
|---|---|---|---|---|---|---|
| 15 | 5 s (S2) | REAL + RENDER | Sauna stove footage + **S2 Journey** explanation (glasses stay outside) | Fixed display follows water onto stones, steam rising and condensing on skin; no water/steam in the real footage | *Why steam bites.* (baked in) | Room tone retained; hiss SFX still pending |
| 16 | 0:42-0:47 | REAL + RENDER | Gym air bike with the B1 Airflow explanation (`act5_bike/final/B1_airflow.mp4`, 5 s) | Air streams off the fan blades; push harder, more air, more resistance | *Push harder, air pushes back harder.* | Whirr, beat |

## Act 6: how it works (0:46-0:54)
| # | Time | Source | Shot | Effect | Text | Audio |
|---|---|---|---|---|---|---|
| 17 | 0:46-0:50 | RENDER | Line diagram: glasses camera → phone → AI names the object → our checked physics lessons → back to the display | Each step lights in turn | *It sees it. AI names it. Real physics explains it.* | Ticks |
| 18 | 0:50-0:54 | REAL | Quick cuts: band pinch, phone in pocket, glasses on a face | | *Pinch. One photo. Answer in your view.* | Music |

## Act 7: share it, never stop (0:54-1:22) — bookend
Third person films; IceFrost wears one pair, friend sits next to him.
| # | Time | Source | Shot | Text | Audio |
|---|---|---|---|---|---|
| 19 | 0:54-0:57 | REAL | IceFrost hands a **second pair** to the friend (wide two-shot) | *Try it.* | "Here, try these." |
| 20 | 0:57-1:00 | REAL | Friend turns them over, sceptical | | "Wait, how do these even work?" |
| 21 | 1:00-1:02 | REAL | IceFrost looks at the pair, pinches (close on band) | *Even this?* | Click |
| 22 | 1:02-1:08 | GLASS + RENDER | Band reads tiny muscle signals at the wrist (EMG); display bends light into one eye (waveguide) | *It even explains itself.* | Music builds |
| 23 | 1:08-1:12 | REAL | Friend puts them on, looks, pinches: real wow | | Laugh / "no way" |
| 24 | 1:12-1:16 | REAL → CODE | Both smile; match cut to the Act 1 child/grass, now with glowing lines on the blade | **Never stop asking why.** | Child: "Why?" · last note |
| 25 | 1:16-1:22 | Title | Black, logo, fade in | **WonderWhy. See how the world really works.** → **Come to our table. Try it.** · Meta Ray-Ban Display · Junction 2026 | One click, silence |

## Footage map
All raw clips on IceFrost's laptop in `~/Videos/wonderwhy/raw/` (not git; index: `raw/INDEX.md`, made by [video/ingest.sh](video/ingest.sh)). Pixel clips: 4K HEVC 60 fps portrait. iPhone clips (MrNetwork, `friend-next` → `DemoVideos/` and `DemoVideos/New/`, split parts re-joined): 4K HEVC portrait; `A001_*` are 24 fps.
| Shot | Clip | What it shows | Status |
|---|---|---|---|
| 4 grass, scrolling | `mrnetwork/A001_11141516_C098_2.MOV` (26 s, 24 fps) | lying on grass, phone, earbuds in | ok |
| 24 grass ending / B1 | `mrnetwork/A001_11141518_C099_2.MOV` (21 s), `A001_11141519_C100.MOV` (21 s) | on the grass with the glasses, arms up, touching grass | ok |
| Removed shot 5 (archive only) | `mrnetwork/IMG_5554.MOV` | short rear-view walk through the crowd | excluded at owner's request; original footage preserved |
| 6 glasses on | `mrnetwork/IMG_5543.MOV` / `IMG_5544.MOV` or a trim of IMG_5557 (`icefrost-trims/IMG_5557~2.mp4`) | glasses on | ok |
| 8 earbuds in palm | `icefrost/PXL_20261114_145509708.mp4` (5 s) | open earbuds case on a table | ok |
| 8 alt | `mrnetwork/IMG_5560.MOV` (10 s) | hand with the glasses' charging case | b-roll |
| 11 printer | `icefrost/PXL_20261114_153800338.mp4` (8 s) | Prusa Core One printing | first printer retained; second-printer clip excluded (source preserved) |
| 15 sauna | `icefrost/PXL_20261114_135130437.mp4` (15 s; trim `icefrost-trims/PXL_20261114_135130437~2.mp4`) | sauna benches, stove; **no water pour or visible steam** | S2 Journey selected and inserted; 5 s composite rendered from the 4K trim |
| 16 gym bike | `mrnetwork/A001_11141614_C103.MOV` (trim: `icefrost-trims/A001_11141614_C103~2.mp4`) (13 s, 24 fps) | someone on an **air bike** (fan wheel) | ok, but **it is a fan bike, not a magnet bike**: change the line to air resistance (*The harder you push, the harder the air pushes back*) or film a magnet spin bike |
| 18 / 21 / 23 band, glasses on a face | `mrnetwork/IMG_5557.MOV` (24 s), `IMG_5561.MOV` (8 s) | facing camera with glasses; at the table with glasses | ok |
| 19-23 share scene | `icefrost/PXL_20261114_153315589.mp4` (12 s) | 0-2 s glasses held out over the table (19), 3-5 s friend turns them over (20), 6.5 s puts them on (23), 8-11 s looks, smiles at camera (23/24) | ok; shots 21-22 (IceFrost pinches at the pair, GLASS of the glasses explaining themselves) still to record |
| B-roll | `PXL_20261113_*` (6 clips), `PXL_20261114_135208665` (balcony), `PXL_20261114_141728301` (CRT TV wall) | hall, stage, robot, tables | spare |
| GLASS 10, 12, 22 | — | "Record display" on the glasses | **to record** |
Phone trims (the `~2`/`~3` files from IceFrost's phone folder `Movies/WonderWhy/DemoVideos/`) are in `raw/icefrost-trims/`; trimmed grass clips there too.
App renders (earbuds, ball, bicycle, guitar, kettle, pendulum, phone, spoon) are in `raw/mrnetwork-friend-next/` and `app/bridge/media/`.

## To make
| What | How | Who | Blocker |
|---|---|---|---|
| Act 1 intro polish | `R_B3_lines` chosen; finish polish (see Act 1) + child VO, piano/air bed | team (animation branch) | — |
| Remaining shots: 21 (pinch at the pair), GLASS 10/12/22 | Phone + Record display | IceFrost | — |
| Custom object animations: first printer, sauna, gym bike, glasses/band, grass | Code renders on black, palette cyan #4df0ff, amber #ffc247, green #6dff9c | team (Alex owns some, see issue #22) | — |
| GLASS recordings 10, 12, 22 | Meta AI "Record display", two takes each | IceFrost | objects in the library |
| Child voice (3 lines) + SFX (click, whoosh, muffled crowd, rising tone, printer hum, hiss, whirr) | ElevenLabs, **Junction key** (not Medly's) → 1Password `agent-general` | IceFrost | key |
| IceFrost lines + VO | Quiet room | IceFrost | — |
| Music | Free track: soft start, cut 0:04, lift 0:09, peak 0:42 | — | — |
| Edit | Rough cut on the phone → code polish (grade grey/gold, captions, composites, sound); render method: `window.renderFrame(t)` + Playwright + ffmpeg | IceFrost + agents | footage |

## Deadlines (Sat-Sun)
Rough cut tonight → **safety upload (unlisted) 23:30** → fixes Sun 05:00-08:00 → **lock 08:00** → public 09:30 → **final submission 10:00** → peer review 10:30-14:00.
