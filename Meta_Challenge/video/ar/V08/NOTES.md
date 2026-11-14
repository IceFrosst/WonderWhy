# V08 Notebook margins

**Concept.** A teammate at the table, grey footage. A hand-drawn circle lands on his glasses with *wait. how do these even work?*, the `glasses` hologram appears on his left and comes apart.
Amber notes write themselves on like a kid scribbling in a textbook margin, arrows land on the real parts, and colour comes back as the notes fill the frame.

Files: `index.html` (page), `ink.js` (hand-drawn ink: circles, arrows, strike, Caveat written on with a moving clip and a pen nib, `?` marks), `config.json` (every number).

## Shot list (8.0 s, footage IMG_5561.MOV from 0.0 s)
| Time | What happens |
|---|---|
| 0.0-0.35 | Grey, cool, slow push. He looks down at the pair in his hands |
| 0.35-1.0 | Amber circle draws around the glasses on his face |
| 0.75-1.75 | White note top right: *wait. how do these even work?* |
| 1.3-2.1 | Hologram (assembled) wipes in on the left, top to bottom; dashed arrow from the circle to it (1.6-2.2) |
| 2.2-4.4 | Parts separate (beat 1 explode, staggered); yaw drifts -18 to +16 degrees over the shot |
| 2.6-3.4 | `?` above the projector, arrow, then *the display is a tiny projector* writes as the `?` shrinks away |
| 3.55-4.45 | *a tiny TV in the lens?* written, then crossed out (4.2) |
| 4.45-5.55 | *nope: light zig-zags inside the glass to your eye (waveguide)*, arrow up to the waveguide |
| 4.95-6.0 | `?` then *camera: sees what you see*, arrow to the camera |
| 5.7-6.85 | Circle on the band, *the band reads your wrist muscle signals* |
| 6.9-8.0 | Small print bottom right: *Visualised. On the glasses it's a panel in your view.* Hold, colour at 55 % |

All labels come from the `glasses` spec: projector (caption "A tiny projector makes the image"), waveguide ("Light zig-zags inside the glass"), camera, neural wristband ("The band reads your finger muscles").

## What the PC session must tune
| Item | Where | Now | Check |
|---|---|---|---|
| Crop | `footage.plate.vf` | `crop=iw:iw*9/16:0:ih*0.30` | Face sits at y about 500 of 1080; looked right on the 1080x1920 proxy |
| In-point | `footage.plate.in` | 0 | Clip is 8.1 s, we use 8.0 s |
| Face circle | `face[]` (t, x, y, rx, ry, rot), 1 key per second | Read off a 1 fps contact sheet | Biggest risk: he moves fast (head turn at 6-7 s, x 900 to 1155). Add keys at 0.5 s steps if the circle slides off the glasses |
| Hologram | `anchor[]` (t, x, y, w, rot, yaw, pitch) | x 430-440, y 460-425, w 760 to 1030 | w grows at 2.2-4.2 s on purpose: the explode beat zooms the model out. Keep the camera part (right end) clear of his face |
| Note positions | `notes[].dx, dy` (px from the anchor), `how.x, y` (absolute) | Left half and top right are empty wall / crowd | Text is clamped inside the frame; arrows follow the parts by themselves |
| Arrow bows | `notes[].arrowBow` | 30-70 px | Waveguide arrow crosses the ghosted hand; bow it more if it reads as a mess |
| Grade | `grade` | sat 0.10 to 0.55 from 2.2 to 7.0 s, brightness 0.8 | Proxy is already SDR; no tonemap in vf |

## Cues (`config.cues`)
| t | Sound |
|---|---|
| 0.35, 5.7 | Pencil circle scratch |
| 0.75, 3.05, 4.45, 5.3, 6.0 | Pencil writing, short |
| 1.3 | Low airy shimmer, hologram appears |
| 2.2 | Soft slide as the parts separate |
| 2.6 | Pencil tick for the `?` |
| 4.2 | Two fast pencil strikes (crossing out) |
| 6.9 | Nothing new, music carries the end |

## Unsure
- At 0-1.2 s he holds a second pair (black, thick) low in frame and wears another. I circled the pair on his face; if the held pair is the Meta one, retarget `face[]` to his hands for 0-1.2 s, but they leave the bottom of the frame by 1.2 s.
- The model's hand and band show (ghosted) under the glasses from the start; it foreshadows the band note but adds clutter.
- The notes are dense from 5.5 s; if it reads busy, drop the camera note (the brief asks for it, so it's in).
- Stills checked against the real proxy at 0.5-7.6 s (3 runs); no full render done.
