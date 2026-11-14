---
tags:
  - type/plan
  - topic/junction-2026
updated: 2026-11-14
---

# Video plan: hooks and 1:25 outline (Claude Fable 5.2, Sat 12:50)

> [!summary]
> Draft by Fable 5.2 from the repo docs and the video kit. **Owner decisions since:** max 1:30; hero objects to add: the glasses explaining themselves (Neural Band, display), sauna, a gym machine (spin bike with magnetic resistance preferred), 3D printer, robot arm, maybe Wi-Fi or sound. The outline below still uses the current 7 library objects; swap the Range beat (0:45-0:57) and the demo object for the new ones as they land.

Nothing was edited. Three things change the plan:

- **Docs disagree on real-glasses state.** `Submission.md` and `DEMO.md` say nothing has run on real glasses. `Test_Now.md` (12:05) says still cards work, and live animation on the glasses is untested. I assume cards work.
- **The display is, as far as I know, a fixed panel in one eye, not anchored to objects.** Confirm with the glasses on. If so, a fixed-position composite is both tracking-free and honest, and lines "stuck" to the real string would be a faked feature.
- **"Nothing stored" is too strong.** The Deck says the photo goes to the bridge and a model provider. Caption it "One photo per pinch. Not saved."

Legend: **R** real footage, **G** recording of the glasses display, **K** kit render, **AI** generated.

## 1. Hooks (first 3 s), ranked

| # | Hook | Visual | Text | Why it works | Risk |
|---|---|---|---|---|---|
| 1 | Your phone, opened | R: hand holds a phone, dark background, pinch enters. K: `phone-inside-clean` pulls apart into 9 layers beside it | Inside the phone you're holding | Viewer is holding a phone; richest clip in the kit; reads muted in 1 s | Looks like anchored AR: tag it "Simulated view" |
| 2 | Pinch, cutaway | R: steaming kettle, band hand pinches in close-up. K: `kettle-cutaway-clean` lights up | Pinch. See inside. | Input and result in one beat; the band is new hardware | Less personal; steam needs backlight |
| 3 | Proof first | R: phone camera through the actual lens, display glowing over a guitar | Filmed through the glasses | Kills "is it fake" instantly | May be unfilmable (dim, tiny sweet spot) |
| 4 | Cold spoon | R: macro spoon in tea. K: `spoon-zoom-clean` to atoms | Why does metal feel cold? | Curiosity gap | Reading a question costs 2 of the 3 seconds |
| 5 | Slow-mo string | R: 240 fps plucked string. K: `guitar-motion-clean` | 110 times a second | Beautiful | Needs sound to land |
| 6 | Read it / see it | Split: R phone scrolling a text wall, K cutaway | Read it. Or see it. | Problem and fix in one frame | Looks like a slide |
| 7 | The throw | R: side-on throw. K: arc scaled to fit | See the physics | Motion grabs | Implies object tracking we don't have |
| 8 | AI eye macro | AI: eye behind lens, lines reflected | Look. Pinch. Understand. | Glossy | Looks like every AI ad; breaks our "real footage only" rule |

**Pick 1 and 2.** Hook 1 opens; hook 2 is the pinch that starts the demo. If hook 3 turns out filmable, it becomes the proof shot at 0:03.

## 2. Outline, 1:25 (16:9, 1080p)

| Time | Beat | Shots | Caption | VO (optional) | Sound |
|---|---|---|---|---|---|
| 0:00-0:03 | Hook | R hand and phone, pinch; K layers explode | Inside the phone you're holding | none | Click on the pinch, music in |
| 0:03-0:08 | Name and proof | G: the same phone card, system yellow frame left in. Tag "Recorded on the glasses" | Physics Lens · Meta Ray-Ban Display | "Look at anything. Pinch. See the physics inside." | |
| 0:08-0:15 | Person and problem | R: teammate at a kettle, pulls out phone, scrolls a text wall, gives up | Today: stop, unlock, read a wall of text | "Everyday things run on physics you can't see." | Music dips |
| 0:15-0:45 | Demo, one real kettle run | R: look, band pinch (2 s). G: progress card, speed-ramped with an on-screen "×N, real wait NN s". G: card; she asks; cutaway steps; swipe to What if; The number | One pinch = one photo → Ask: "How is it built?" → Swipe = new lens → Boiling 1 L: about 2 cents | "I ask a question. It opens the lens that answers it." | Click on every pinch |
| 0:45-0:57 | Range | K clean over R plates, 2 s each: guitar wave, Moon throw, gears, spoon atoms, keys. Tag "Simulated view" | 7 objects · 29 lenses · physics checked | "Different lenses answer different questions." | Beat cuts |
| 0:57-1:05 | How | Simple line diagram: glasses → phone app → bridge → animation | 1 photo → Gemini names it → checked animation | "The camera knows what you hold. The display shows why." | |
| 1:05-1:15 | Trust and access | G: consent card, "Not sure what this is", a Finnish card | Camera only when you pinch. Not saved. · Says when unsure · 6 languages · No audio needed | "It says when it isn't sure." | |
| 1:15-1:21 | Impact | R: another hacker tries the glasses, real reaction | Every object becomes a lesson | "Next: one physics class." (planned, say so) | Music lifts |
| 1:21-1:25 | Close | R: phone from the hook goes down; wearer pinches at the camera; cut to black | Look at anything. See the physics inside it. | same line | Click, cut |

About 55 s is real or real-app output, above our 60% rule.

**Compositing (no tracking):**
- **Blend:** Screen (Add if it looks weak). Black disappears, as on the display. Darken the plate 10-15% first.
- **Kdenlive (installed):** clean clip on the track above the plate, compositing mode Screen.
- **ffmpeg:** this ran here on a test pattern plus a kit clip, not on real footage:
  ```
  ffmpeg -i plate.mp4 -i clip-clean.mp4 -filter_complex "[0:v]eq=brightness=-0.12,format=gbrp[b];[1:v]scale=760:760,pad=1920:1080:580:160:black,format=gbrp[o];[b][o]blend=all_mode=screen:shortest=1,format=yuv420p" out.mp4
  ```
- **Fixed panel:** always put the square at the same spot (right of centre), on handheld shots too.
- **Plates:** tripod, static object, dark empty space where the panel goes. Bright backgrounds wash the lines out, as on real glasses.
- **Entry:** 4-frame fade plus a 96→100% scale on the pinch frame. No fake scan lines.

## 3. Short cuts (1:1, silent, looping)

| Cut | Beats |
|---|---|
| 15 s | 0-3 hook · 3-6 G proof with tag · 6-12 four lenses at 1.5 s each · 12-15 punchline and name. Last frame = first frame |
| 6 s | Phone in hand (1 s) · pinch (0.5 s) · layers explode (3 s) · "See the physics inside" (1.5 s). Export 480 px GIF or WebP |

## 4. Thumbnail and title

| | Thumbnail | Title |
|---|---|---|
| **A (pick)** | Hand with phone on the left, neon exploded layers on the right, "SEE INSIDE ANYTHING" | Physics Lens: see the physics inside anything |
| B | Wearer's face, raised pinch, glowing kettle cutaway, "PINCH TO SEE INSIDE" | I pinched at a kettle. My glasses cut it open. |
| C | Real through-lens frame, "REAL GLASSES. REAL PHYSICS." | Why does a spoon feel cold? Ask your glasses. |

## 5. Shooting and editing

I don't know the glasses' battery drain. Note the percentage before and after block A and scale the rest. Glasses go in the case between blocks.

| When (Sat) | What | How | Who |
|---|---|---|---|
| 13:00-13:40 | **A. Display recordings (most important)**: kettle full run with the real wait, spoken question, phone, an unknown object, Finnish, consent card | "Record display"; two takes each; check that the first file plays before continuing | Wearer: IdelicMemor. MrNetwork on call for the app |
| 13:40-13:55 | Through-the-lens attempt | Phone lens against the glasses lens, dark background. Hard 15 min limit | IceFrost |
| 14:15-15:30 | **B. Daylight**: bike outside, wearer looking and pinching, band close-ups | Landscape, 30 fps; sunset is around 15:50 | IceFrost films |
| 15:45-16:45 | **C. Plates**: phone in hand, kettle, guitar, spoon, ball; 10 s each | Tripod, dark side space | IceFrost |
| 17:00-17:30 | Problem skit, a stranger's reaction | Ask their permission on camera | All |

| Edit | Budget |
|---|---|
| 17:30-20:00 | Rough cut with captions only; watch it muted on a phone |
| 20:00-21:00 | Pickups; voiceover in a quiet room |
| 21:00-23:00 | Composites, tags, music |
| 23:30 | Safety upload (unlisted); cut the 15 s and 6 s versions |
| Sun 05:00-08:00 | Fixes only, no new ideas. Lock 08:00, public 09:30, check logged out |

## 6. Traps and honesty

| Don't | Do |
|---|---|
| Lines stuck to the real object | Fixed panel, tagged "Simulated view" |
| Hide the 10-30 s wait | Speed-ramp it with the real number on screen |
| Present renders as glasses footage | Two fixed tags: "Recorded on the glasses" / "Simulated view" |
| Show live animation on the glasses if Test 2 and 3 fail | Show the still cards as G; motion only as K |
| Show unknown objects getting animations | On the glasses they get a text answer; show that |
| "Nothing stored", "works on anything" | "Not saved", "7 objects checked, AI answer for the rest" |
| Logo intro, team intro, architecture tour | Product inside 3 s |
| AI b-roll, stock music drops, sound-only jokes | Real hands, real venue, one click motif |
| Claim a pilot or user numbers | "Planned" |
| Remove the yellow system frame | Leave it in; it shows the footage is real |
