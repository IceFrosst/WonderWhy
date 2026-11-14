# V10 Beat montage

Three real shots cut on a 100 BPM grid (1 beat = 0.6 s, 8.4 s = 14 beats). Each object's hologram pops in on a beat beside its real thing, and the grade climbs from grey (printer) to gold (glasses).

## Shot list
| Time | Shot | Footage (raw, in-point) | Beat events |
|---|---|---|---|
| 0.0-2.4 | Prusa Core One, mid-print, grey/cold | `printer_1_core_one.mp4` from 3.5 s, crop 10% down | 0.6 pop `printer3d` · 1.2 label "Hot plastic, layer by layer" |
| 2.2-2.6 | Whip pan left (continuous pan, 16-sample motion blur) | both | cut on 2.4 |
| 2.4-4.8 | Lying on the grass, earbuds in, half colour | `A001_11141516_C098 2.MOV` from 17.3 s, crop 30% down | 3.0 pop `earbuds` by his ear · 3.3 label "Sound cancels sound" |
| 4.55-5.05 | Push-through: zoom into the earbuds hologram, land zoomed in on shot 3 (12 samples) | both | cut on 4.8, short warm lift |
| 4.8-8.4 | Glasses go on, he faces camera, full warm | `IMG_5557.MOV` from 11.15 s, crop 20% down | 5.4 pop `glasses` · 6.0 label "A screen in one eye" · 7.2-7.5 glasses explode open |

Small print from 0.6 s on: *Visualised. On the glasses it's a panel in your view.*

## What the PC session must tune (all in `config.json`)
| Key | What | Status |
|---|---|---|
| `anchor.glasses` | Head moves right after ~7 s (he looks down); keep the hologram clear of his hair at 7.5-8.4 | Checked on proxy at 6.6 and 7.9, tight at 7.9 |
| `anchor.earbuds` | Hologram up and right of his right ear (ear at about x 1060, y 520 on the proxy) | Checked at 3.8 |
| `anchor.printer` | Over the right half of the enclosure, beside the real print | Checked at 1.6 |
| `footage.*.in` | Printer 3.5 (approach settles about 4.0) · grass 17.3 (camera re-frames about 19.6, hidden by the push) · glasses 11.15 (on at about 12.0) | Picked from 1-2 fps strips |
| `footage.*.vf` | Relative crops `crop=iw:iw*9/16:0:ih*k`, k = 0.10 / 0.30 / 0.20 | Checked on 1080x1920 proxies |
| `grade` | Shot 3 venue light is purple, so the gold wash only reads in the hologram and label. Push `warm`, or lower `sat`, if it should look warmer | Open |
| `lx, ly` in anchors | Label block top-left; clamped inside the frame in code | OK |

## Cues (also in `config.cues`)
| t | Sound |
|---|---|
| 0.0 | Music downbeat, 100 BPM |
| 0.6 / 3.0 / 5.4 | Pop: soft glassy tick + low thump (each one a step brighter) |
| 1.2 / 3.3 / 6.0 | Type tick for the label |
| 2.2-2.4 | Whip whoosh |
| 4.55-4.8 | Push riser into a soft hit |
| 7.2 | Shimmer as the glasses open |
| 8.4 | Ends on a beat, music carries on |

## Unsure
- "Noise-cancelling earbuds" tag: assumes the buds in the grass clip are ANC (the script says so).
- The whip at 16 samples still shows faint strobing at peak speed; raise `transitions[0].samples` to 24 if it shows in motion.
- 8.4 s is a little over "about 8 s"; shorten shot 3 by one beat (`duration` 7.8, shot `t1` 7.8) if needed.
- The grass shot is the coordinator's replacement: the earbuds-case clip does not exist.
