# V05: colour spreads out from the lenses

**Concept:** close-up, cold grey world. He puts the glasses on and they settle; colour pours out of the two lenses in a soft ring lit with thin cyan and amber light.
The glasses hologram arrives with the colour, top-left beside his head, turns, then opens up to show projector, waveguide and camera.

## Shot list (7.0 s, footage `IMG_5557.MOV` from 9.8 s)
| Time | Picture | Text |
|---|---|---|
| 0.0-2.2 | Grey, cold, slow push. He reaches up and puts the glasses on | none |
| 2.1-2.4 | Lenses glow faint cyan as they settle | |
| 2.35-5.0 | Colour spreads out from both lenses (union of two discs, lit edge) to the frame edges | |
| 2.7-4.6 | Hologram (beat 0) grows in top-left, masked by the colour front, slow yaw turn | |
| 3.3-7.0 | | Small print bottom-right: *Visualised. On the glasses it's a panel in your view.* |
| 4.6-7.0 | Beat 1: parts move out; labels Projector, Waveguide, Camera from 6.3 s | |
| 4.9-7.0 | He looks down; hologram stays | Caption bottom-left: *Put them on. Finally asked how they work.* |

## Changed after seeing the real clip
| Was (brief) | Now |
|---|---|
| Faces the camera, looks up or pinches | He **puts the glasses on** at 1-2 s, looks at the lens for ~1 s, then looks down. The trigger is the glasses settling (2.25 s) |
| Life-size hologram beside the head | The head fills the middle of a close crop, so the hologram sits in the dark area **top-left**, about 0.8x life size |
| Caption "Six hours wearing them" | Dropped (he is putting them on). One caption at the end instead |
| Ghost eye and hand + band from the app spec | Left out in the page (spec cloned, `dropParts`); Battery label left out (it overlapped Projector) |

## What the PC session should tune (all in `config.json`, plate px = the 1920x1080 frame after `vf`)
| Key | Now | Note |
|---|---|---|
| `footage.plate.in` | 9.8 | Glasses go on at ~11.0-11.8 s raw. Checked on the 1080x1920 proxy |
| `footage.plate.vf` | `crop=iw*0.8:iw*0.45:0:ih*0.19` | Top 80% width, 19% down. Relative, so it works on 4K too |
| `lenses[]` | 14 keys, 0-7 s | Measured by eye on a 0.5 s grid. 2.25 and 2.6 checked on stills (within ~30 px). Only 1.9-5.0 s matter (glow and ring) |
| `trigger`, `ring.start/end` | 2.25 / 2.35-5.0 | Move with `in` if the in-point changes |
| `anchor[]` | x 505-520, y 370-390, w 760-860 | Hologram centre and size. Keep it clear of his hair after 5 s |
| `push` | about (900,700), 1.00 to 1.07 | Slow push. Positions in config are in plate px; the page applies the push to them |
| `holoTint`, `dropParts`, `dropLabels` | | Look tweaks, not positions |

## Cues (`config.cues`)
| t | Sound |
|---|---|
| 0.0 | Muffled hall room tone (grey) |
| 1.0 | Soft rustle: glasses going on |
| 2.25 | Tiny click as they settle |
| 2.35 | Airy rising swell; room tone opens up |
| 2.8 | Thin glass shimmer: hologram in |
| 4.6 | Three soft staggered slides: parts move out |
| 6.3 | Two quiet ticks: labels |

## Unsure
- The footage is already very blue and purple. The colour return reads as "blue world", not gold. A warmer `col` grade (more amber soft-light) might suit the story better.
- He looks down from ~3.5 s, so the second half is the top of his head. A shorter shot (cut at 5.5 s) or an in-point near 10.2 would keep more face.
- The 2.0 s frame in the render showed the glasses ~0.3 s later than my ffmpeg grid, so lens times may be off by a few frames. Check the lens fit at 2.2-2.8 s.
- The caption makes a claim about him. Swap it if it isn't true.
