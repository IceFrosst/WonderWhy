# V01: The printer prints its own hologram

**Concept:** grey POV walk up to the Prusa Core One. On a pinch, a glowing twin of the printer gets printed on the real bed, bottom-up in serpentine layers by an amber nozzle.
Colour spreads out from the printer as the layers stack. It ends on the finished model standing next to the real orange parts, with one label.

**Change from the brief (real clip seen):** the clip ends close on the print head, so a whole-printer hologram at real scale won't fit. The hologram is a twin about 2/3 of the frame high. It stands on the real bed, right of the orange parts, base on the bed's front edge. I think this is a better fit for the title anyway.

## Shot list (7.3 s, clip `printer_1_core_one.mp4` from 0.4 s)
| t (s) | What happens |
|---|---|
| 0.0-1.9 | Grey, cold grade. POV walks past the Bambu P2S/AMS to the Core One (real camera move) |
| 1.9-2.4 | Trigger: cyan pinch ring at the real nozzle, amber corner brackets close on the model's bounds |
| 2.0-2.4 | Faint grey "slicer preview" ghost of the whole model fades in |
| 2.3-5.6 | Print: 26 layers, serpentine. First layers are slow (the nozzle reads), then it speeds up like a timelapse. The amber tool path is lit and the next pass is dashed. Hot layers glow amber, cool to white/cyan, with faint layer lines |
| 2.3-5.6 | Grade: colour spreads out in a circle from the printer as it prints, so everything is in full colour at 5.6 |
| 5.6-6.15 | Done: nozzle parks up, a thin cyan pass sweeps up the model, layer lines fade, the model breathes gently |
| 5.75-7.3 | Label wipes in at bottom left: "It lays hot plastic down, one layer at a time." A leader runs to the printed stack. Small print at bottom right from 2.6 s |
| 4.0-7.3 | Digital push 1.00 to 1.045 (plate and hologram together) so the static hold keeps moving |

## PC session: what to tune
| What | Where | Note |
|---|---|---|
| **Anchor keyframes** | `anchor` t = 1.9, 3.0, 4.0, 6.0, 7.3 | **Top priority.** The camera is still pushing in from 1.9 to 4.0 s, so the base must stay glued to the bed's front edge. Add keys every ~0.3 s there if it slides. Rule: model spans v 0.11-0.82 and u 0.25-0.70 of the square |
| yaw / pitch | `anchor[].yaw/pitch` | Offsets from the model view (yaw 28, pitch 16). They match the bed plane's perspective. Now -6 to +2 for slight parallax |
| In point | `footage.plate.in` = 0.4 | Clip is 8.04 s, the shot uses 0.4-7.7. The camera settles around 4.2 s of the clip |
| Crop | `vf` = `crop=iw:iw*9/16:0:ih*0.12` | 16:9 window 12% down the portrait frame. It shows the head, the orange parts and the bed edge at the end. Checked on the proxy |
| Trigger point | `trigger.u/v` | Sits on the hologram nozzle. Move it if a real hand pinch is in shot (none seen in the proxy) |
| Label | `label.x/y`, `label.to` | Bottom left with a soft scrim. The leader crosses the real orange gear; aim `to` elsewhere if that bothers anyone |
| Push | `push.keys` | Set z to 1 if the hold already has enough handheld motion |

## Cues (in `config.cues`)
| t | Sound |
|---|---|
| 0.0 | Real printer hum + footsteps from the clip, low |
| 1.9 | Soft click (pinch) |
| 2.3 | Stepper ticks, one per layer for the first ~5 layers |
| 3.6 | Ticks blur into a rising whirr |
| 5.6 | Short hiss (plastic cools) + gentle chime |
| 5.75 | Light swish for the label |
| 7.3 | Cut on a music downbeat |

## Unsure
- At 5.0 s the late layers fly past (about 2 frames per layer). Check in motion that it reads as a timelapse, not flicker. If it flickers, lower `print.warp` to 1.4 or `layers` to 22.
- The hot amber tint is subtle on the thin top-frame lines. It's clearest on the base and bed layers.
- The orange parts on the real bed aren't labelled. The leader points at the hologram's own stack.
- Stills checked on the SDR proxy (1080x1920) only. No motion render yet.
