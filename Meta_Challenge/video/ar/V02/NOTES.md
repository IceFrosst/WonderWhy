# V02 X-ray peel (7.0 s)

A scan line rises up the real Prusa Core One+ from the bottom, the way a printer builds layers. Colour comes back below it, and our printer3d hologram locks onto the machine. Then the print head explodes towards the camera and three labels name its real parts.

Footage: `printer_2_side_by_side.mp4` from 1.0 s. The Core One+ is on the right with its spool on top; the Bambu P2S + AMS 2 is on the left. Anchors were set against the SDR proxy (1080x1920).

## Shot list
| Time | What happens |
|---|---|
| 0.0-0.9 | Muted grey and cool. The phone pulls back from the Core One+ and corner brackets close in on it |
| 0.9-2.45 | A thin cyan line rises from the bottom of the frame to the top. Colour returns below it, the hologram appears below it, and the real printer dims to an x-ray |
| 2.45 | Lock: the hologram has swung the last ~14 deg into place, the brackets turn cyan, and the tag "Prusa Core One+" appears (until 3.9) |
| 2.6 | Small print fades in: *Visualised. On the glasses it's a panel in your view.* |
| 3.3-5.3 | Explode: printer3d beat 1. The camera pushes into the print head, the head parts fly apart, the frame ghosts, and the hologram drifts left and grows (towards the lens) |
| 4.45 / 4.85 / 5.35 | Labels in the order the parts land: "0.4 mm nozzle", "Heater block", "Drive gear" |
| 5.3-7.0 | Hold with a slow yaw drift (-42 to -36 deg) and slow growth. The last label is on screen for 1.65 s |

## PC session: what to tune
| What | Where | Note |
|---|---|---|
| Lock pose 2.47-3.3 s | `anchor` x, y, w, yaw | Set `look.guides: true` to draw the anchor square, the printer box and the live values. Align the hologram spool with the real blue spool and the hologram bed with the orange print's base |
| Pull-back 0.9-1.6 s | `anchor` keys 0.9, 1.6 | The camera is still pulling back here. Check that the hologram shrinks with it (more keys if needed) |
| Printer box (dim + brackets + tag) | `anchor` bx, by, bw, bh | Spool top down to the LED bar, body left edge to the right edge of the frame |
| Yaw | `anchor` yaw = -48 (offset from beat 0's 28, so -20 in total) | We see the printer's front and left side. Flip the sign if it reads mirrored |
| In-point / crop | `footage.plate.in` = 1.0, `vf` = `crop=iw:iw*9/16:0:ih*0.25` | Relative crop, so it works at 2160x3840 too. The printer's right edge is cut by the phone framing; we can't fix that |
| Explode end | `anchor` 5.3 / 7.0 | Keep the nozzle label above the bottom small print |

## Cues
| t | Sound |
|---|---|
| 0.0 | The clip's own room tone and printer hum |
| 0.9 | Soft rising scan tone, 1.5 s, ends on the lock |
| 2.45 | Small click: the hologram locks |
| 3.3 | Airy whoosh towards the camera as the parts fly apart |
| 4.45 / 4.85 / 5.35 | Three quiet ticks, one per label |

## Unsure
- The hologram is our open-frame model; the real printer is an enclosed Core One+. The hologram is narrower than the box and stands for the mechanism inside it. Its spool stands upright, while the real one lies flat on the roof.
- "0.4 mm nozzle" is the stock Core One+ nozzle (from the spec's callout). Check it if the printer has a different one fitted.
- The exploded frame's ghost lines are busy over the P2S at the end. To calm it, lower `look.holoAlpha` after 5 s, or move the 7.0 anchor right.
- The page draws a labelled placeholder (two dashed boxes) when the clip is missing.
