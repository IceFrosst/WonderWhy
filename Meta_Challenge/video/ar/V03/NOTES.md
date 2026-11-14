# V03: Over the shoulder, and the honest panel

**Concept:** you walk up to the Core One asking "How does it build this?". The printer3d hologram prints itself into the air in your eye line, turns to look back at you for a beat, then opens its print head.
**Honesty:** an inset slides in showing the real right-lens view: the same printer, no hologram in the world, and a small fixed panel right of centre with the same model in it.

Footage: `printer_1_core_one.mp4` (SDR proxy, portrait). Tuned against the real proxy on the laptop (4 still runs).

## Shot list (7.0 s, 30 fps)
| Time | What happens |
|---|---|
| 0.0-1.0 | Grey, cold grade. Walk-up to the Core One. Subtitle *How does it build this?* (0.25-1.9) |
| 0.85 | Soft cyan listening ring where the hologram will appear |
| 1.0-2.0 | Hologram draws in from the bottom up behind a thin scan line, like layers printing. Colour clears outwards from it (1.05-2.7) |
| 1.7 | Small print *Visualised* bottom left, stays |
| 2.0-2.45 | Hologram turns slowly (8 deg/s) and bobs |
| 2.45-4.1 | **Look-back:** it swings to face the wearer, dips once (a small nod), holds about 0.5 s, then turns away again |
| 3.8-5.8 | Beat 1 of the spec: the camera moves onto the print head and the head comes apart (edges feathered so the close-up never shows a hard box) |
| 4.25-4.7 | Inset whips in from the right. A faint ghost of the hologram shrinks into the panel |
| 4.7-7.0 | Inset: *RIGHT LENS*, the real view, panel right of centre. Tag *On the glasses: a panel in your view.* |
| 5.2-7.0 | Labels from the spec, one by one: Drive gear, Heater, Nozzle, Fan |

## What the PC session must tune
| Item | Now | Note |
|---|---|---|
| Clip in-point | `in: 1.0` | 7 s window ends at 8.0 s of the 8.04 s clip. No slack: keep `in` ≤ 1.04 |
| Crop `vf` | `crop=iw:iw*9/16:0:ih*0.13` | Keeps the print head and orange part in frame from tl 2 s on. Relative only, no tonemap (proxies are SDR) |
| `anchor` keyframes | 9 keys, 0-7 s | Hologram sits over the dark left half of the chamber (the CORE ONE logo side). Check 1.0-2.2 most: the camera is still pushing in, and the hologram should grow with the scene. From 3.0 on, follow the logo drift (about -50 px x by 4.6, scene scales ~1.08x by 7.0) |
| `inset` keyframes | x 1250, y 630, w 620 | Bottom right, clear of the real print head and part. Covers the LED bar and stickers only |
| `panel` | cx 0.62, cy 0.55, size 0.42 | Right of centre in the inset. Lands over the real print head, which is roughly where the display sits |
| Timeline | `config.timeline` | All beat times live there, retime freely |

## Cues
| t | Sound |
|---|---|
| 0.0 | Printer hum and room tone, low-passed (grey) |
| 0.25 | VO IceFrost: "How does it build this?" |
| 0.85 | Soft two-note listening chime, low-pass opens |
| 1.0 | Rising shimmer, quiet stepper ticks under the draw-in |
| 2.45 | Near silence, one soft servo whirr for the look-back |
| 3.8 | Light mechanical spread as the head comes apart |
| 4.25 | Short whip swish, inset in |
| 5.2 | Four tiny ticks, one per label |
| 7.0 | Music carries over the cut |

## Unsure
- Look-back direction: the yaw offset is `-beat0.yaw - 4` deg, and it reads as facing camera in the 3.1 and 3.6 stills. Check that it holds in motion.
- The inset shows the plate with a 6% margin crop, which is the same view as the main shot, not a separate lens recording. If a real Meta "Record display" clip of the printer exists, it could replace the panel content.
- Panel size and position are from the product spec (fixed panel, one eye, right of centre), not measured.
- The labels say "Heater" (from the spec part name). The real part is the heater block, which is what the spec's beat 3 callout calls it.
