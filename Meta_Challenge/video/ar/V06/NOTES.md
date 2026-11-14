# V06: colour comes back where the lines have been

**Concept.** The room is grey. The printer3d hologram prints itself bottom-up over the real Prusa Core One, the way the printer builds things, and the footage gets its colour back only where the lines have been.
Then an echo of the lines rolls out through the room, the colour follows it, and the hologram settles to a thin outline.

**Clip:** `printer_2_side_by_side.mp4` from 1.2 s (6.8 s used). The phone pulls back from the Prusa (right) to show a second printer (left). It's still from about 3 s on.

## Shot list
| t (s) | What happens |
|---|---|
| 0.0-1.0 | Fully grey, cold. The camera is still pulling back. At 0.45 a thin cyan ring closes on the printer (the ask) |
| 0.6-2.9 | Right panel: *How does a 3D printer build things?* |
| 1.0-3.8 | Hologram prints bottom-up: an amber scan line with a print-head spark, the newest slice glows amber. Colour returns in a halo behind the line that widens as each slice gets older (orange print, blue LED, blue spool) |
| 2.9-5.15 | Panel: *It draws one slice at a time.* (the app's own caption for this object) |
| 3.9-5.4 | An echo of the hologram grows to 2.9x and fades. Its path is added to the mask, so colour rolls out into the room behind it (second printer, red spool, table) |
| 4.4-6.8 | Small print: *Visualised. On the glasses it's a panel in your view.* |
| 4.6-6.2 | The last corners fill in with a ragged edge; the lines thin to 38 % |
| 5.0-6.8 | Tag **Prusa Core One**, with a leader to the enclosure's top-right corner. Full warm colour |

## How the colour works (deterministic)
- Each frame recomputes the mask from t: the printed hologram (current view) clipped at the reveal height of each earlier time on a 0.2 s grid, blurred by its age (14 px + 85 px/s, max 260), combined with `lighten`. The echo works the same way on a 0.15 s grid. No stored frames.
- The mask is 480x270, luminance turned into alpha with a soft knee, then blurred when it's scaled up. A faint gold rim marks the half-returned edge (`grade.rim`).

## Framing (new: the clip is portrait)
- `vf: "transpose=1"` is lossless. It stores the portrait clip rotated inside a 16:9 frame, and the page rotates it back. **It isn't a crop**, so leave it as is.
- The page puts the full portrait width as a sharp strip on the left (`frame.s 1.05`, `cx 0.847`, `cy 0.47`), feathered into a blurred, darkened copy that makes the right-hand text panel. There's also a 1.00 to 1.04 push on the whole frame.
- The Prusa's right edge runs off the side of the source clip, so the hologram's right edge crosses into the blurred panel. Nothing can fix that in the crop.

## What the PC session must tune
| What | Where | Note |
|---|---|---|
| Anchor keyframes 0.0-2.0 s (pull-back) | `anchor[0..5]` x, y, h | I set them from 8 proxy frames, interpolated linearly. Check that the hologram doesn't slide during the pull-back, and add keys at 0.2 / 0.6 if it does |
| Anchor 2.0-6.8 | `anchor[5..7]` | Checked at 3.0 and 6.5: the base plate is on the enclosure bottom and the model's spool ring is on the real blue spool. Fine-tune ±20 px |
| Model angle | `yaw -14..-19`, `pitch -2` | Shows the left side, like the clip. Not matched exactly |
| In-point | `footage.plate.in 1.2` | 1.4+ would skip more of the pull-back, but the clip is only 8.05 s |
| Proxy vs 4K | none | The page works in portrait fractions, so 2160x3840 gives the same layout |
| Mask cost | `timing.step`, `echoStep` | Up to ~25 blurred stamps a frame at 480x270. Raise the steps if the render is slow |

## Cues
| t | Sound |
|---|---|
| 0.0 | Room tone + printer hum, low-passed (grey) |
| 0.45 | Soft pinch click |
| 1.0-3.8 | Thin rising tone under the scan line |
| 3.8 | Small high chime as the build tops out |
| 3.9 | Low soft whoosh with the echo; open the low-pass |
| 4.6 | Warm music swell as the colour fills the room |
| 6.8 | Cut on the beat |

## Unsure
- The hologram is the app's open-frame Prusa-style model, not the enclosed Core One. It reads as an x-ray inside the box, but a sharp-eyed judge may notice.
- The right-hand blurred panel is a layout choice made because the clip is portrait. If the film wants full-bleed 16:9, the printer won't fit top to bottom.
- The answer caption is the app's line for beat 4. The visual shows the hologram printing *itself* slice by slice, which is a small, deliberate wink.
- The stand-in drawing (no footage) is crude and only there so the page runs. The real clip is the reference.
