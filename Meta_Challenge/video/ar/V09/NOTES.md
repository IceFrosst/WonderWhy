# V09: Through the glasses

The honest version. A grey POV through the right lens settles on the Prusa Core One. One pinch turns on the fixed display panel right of centre, and each later pinch moves it to the next real printer3d beat.
A faint world-locked glow over the real hot end hints at the feel. The small print says it is visualised.

## Shot list (8.0 s, 30 fps)
| Time | What |
|---|---|
| 0.0-2.2 | POV pans past the Bambu P2S/AMS and settles on the Core One. Grey, warm lens tint, lens rim, nose side bottom left, slow push |
| 2.2 | Pinch 1: "pinch" tick bottom left (two dots meet, ring opens) |
| 2.32-2.7 | Panel turns on: plate fades in, scales 0.965 to 1, one line of light runs down it |
| 2.32-3.8 | Beat 0: whole printer turning. "How does a 3D printer build things?" |
| 2.9-3.8 | Ghost (beat 3 hot end, heat wisps) fades in on the real nozzle. Small print fades in |
| 3.8 | Pinch 2: beat 1 "The print head, taken apart." (labels: Drive gear, Heater, Fan, Nozzle) |
| 5.2 | Pinch 3: beat 2 "A gear pushes the plastic in." (Filament, Drive gear, flow + arrow) |
| 6.6-8.0 | Pinch 4: beat 3 "Melted at 210 °C." (Heater block, 0.4 mm nozzle) |
Each later pinch also flashes the panel rim and gives the ghost a short lift.

## Footage
| Key | Value |
|---|---|
| raw | `printer_1_core_one.mp4` (was PXL_20261114_153800338), SDR portrait proxy |
| in / speed | `in 0.8`, `speed 0.9`, so the plate uses clip 0.8-8.0 s. The view settles at plate ~2.2 s (clip ~2.8 s) |
| vf | `crop=iw:iw*9/16:0:ih*0.17` (16:9 window 17% down: print head at the top, bed and orange part mid-frame) |
| checked | Stills at 1.0, 2.4, 2.5, 3.4, 4.9, 6.0, 7.3, 7.6 against the laptop proxy |

## What the PC must tune
| Item | Where | Note |
|---|---|---|
| Ghost on the nozzle | `anchor` (6 keys, 2.9-8.0 s) | **Top item.** The print head moves while printing; I keyed it every 1-2 s only. Add keys if it drifts in the full render. Coords are plate px (frames/plate/*.jpg) before the push. x,y = nozzle tip, w ≈ 470 |
| Push | `push` 1.00 to 1.08 about (0.7, 0.45) | Keeps the head drifting left of the panel |
| Panel | `panel` x 1420, y 590, w 580 | Head-locked, so it never moves. Left edge sits just right of the real head |
| Pinch times | `pinches`, `beats[].from`, `panelOn` | Move them together if the settle point differs on the 4K file |
| Grade | `grade` sat 0.10 to 0.20 | World stays grey; the orange part reads faintly warm |

## Cues
| t | Sound |
|---|---|
| 0.0 | Printer hum + room tone (footage, low) |
| 0.4 | VO "How does it build this?" |
| 2.2 | Soft band click (pinch) |
| 2.32 | Quiet glassy display-on tone, 0.3 s |
| 3.8 / 5.2 / 6.6 | Step click on each pinch |
| 8.0 | Hum carries into the next cut, no sting |

## Unsure
- Panel caption is the app's real 20 px at w 580, about 19 px on screen. Readable at 1080p but small on a phone. Raise `panel.w` if needed (honesty versus legibility).
- The plate under the panel is dimmed 28% for legibility. The real waveguide can't dim, so it's a slight cheat.
- Beat 0 shows the app's generic open-frame printer, not a Core One. That's true to the app, but a judge may notice.
- The ghost is beat 3's hot end (heater block + nozzle). Its heat wisps animate, but it doesn't follow the panel beat.
- The beat 1 explode is still opening when pinch 3 lands (1.4 s on screen).
