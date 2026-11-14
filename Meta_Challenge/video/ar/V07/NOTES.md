# V07: "Wait, how did these block all that?"

He lies on the grass, earbuds in, rubbing his forehead. The `earbuds` hologram lifts out of his real earbud and turns to show the outer mic and the speaker.
Then the trick: the hall's noise (cyan) and its flipped copy (amber) meet and go flat (green). Grey and jittery at the start, warm and calm at the end.

**Footage change (from the coordinator):** the earbuds-case clip does not exist. This version now uses `A001_11141516_C098 2.MOV` (grass, earbuds in). Anchors, in-point and crop were set by eye on the SDR proxy.

## Shot list (7.5 s)
| Time | What happens |
|---|---|
| 0.0-1.5 | Grey, grainy, slight hand-held jitter. He lies on the grass with a hand behind his head. Caption in his voice: *"Wait, how did these block all that?"* (0.3-2.9) |
| 1.5-2.9 | Rubs his forehead. A thin cyan ring opens around his left earbud (frame right), and the hologram lifts off it, up and to the right, growing to full size. It never crosses his face |
| 2.9-4.3 | The model turns and opens slightly. Labels: **Outer mic** (3.0), **Speaker** (3.3) |
| 4.1-5.5 | Upper left: the cyan wave "The hall" draws in, then the amber "Flipped copy" (the same shape, upside down) |
| 5.5-6.5 | The two slide together from left to right. Where they meet, they go flat in green: "What you hear" |
| 6.4-7.5 | Calm hold, warm grade. *They play the noise back, flipped.* Small print: *Visualised. On the glasses it's a panel in your view.* |

## What the PC session must tune (everything is in `config.json`)
| Key | What | Current guess |
|---|---|---|
| `footage.plate.in` / `speed` | in-point and slow-down | 18.3 s at 0.7x (uses source 18.3-23.55 s). Forehead rub at about output 2-4 s |
| `footage.plate.vf` | 16:9 window from portrait | `crop=iw:iw*9/16:0:ih*0.24` (relative; the face sits in the lower half, grass above for graphics) |
| `ear` keys | the real earbud in his left ear (frame right), linear | 9 keys measured on the proxy (0-7 s). **Check 1.5-2.5 s**: the lift-off ring must sit on the earbud |
| `anchor` keys 0-2.9 | lift-off path from the ear to the upper right | starts at the ear (1080,735) with w 40, ends at (1440,390) with w 720 |
| `anchor` keys 2.9-7.5 | hologram resting spot, yaw turn, explode | upper right, x 1440-1462. Keep it clear of his hair when the camera drifts |
| `wave` keys | wave strip upper left (x, y, w, amp, gap) | x 130, y 225, w 720. Keep clear of his raised arm |
| `plate` keys | slow push | zoom 1.0 to 1.04. The ear keys assume no push, so keep it small |

## Cues
| t | Sound |
|---|---|
| 0.0 | Hall crowd noise, loud and busy (the noise is in his head) |
| 0.3 | VO, the user, dry: "Wait, how did these block all that?" |
| 1.5 | Soft rising shimmer as the earbud lifts off |
| 3.0 / 3.3 | Two ticks for the labels |
| 4.2 | Crowd swells a little with the cyan wave |
| 4.8 | Reversed swell (the flipped copy) |
| 5.6 | Crowd ducks fast to near silence, with one low warm tone as the line goes flat |
| 6.5 | Silence and one soft click. Music can come in here |

## Notes and doubts
| Point | Detail |
|---|---|
| Colours vs the app | The brief has noise in cyan and anti-noise in amber. The app's earbuds beat 6 uses the reverse (energy = amber, actor = cyan). The waves here are drawn in 2D, so swapping them is one line |
| Model | `earbud.js` loads the app's earbuds spec without the ear canal and eardrum, plus 2 beats of our own (whole; mic + speaker in focus). It uses scene.js read-only |
| Readability | Thin lines on bright grass: a soft dark pool sits under the hologram and the waves, and the hologram gets a second screen pass. There is no extra bloom |
| Captions | The final answer line sits over his phone and chin. It has a shadow; add a band if it reads weak in motion |
| Not checked | No full render or motion check: only stills at 0.5, 1.8, 2.2, 2.6, 3.6, 4.4, 5.0, 5.4, 5.9, 7.0, 7.2 and 7.4 against the proxy |
| Best still | `out/snap/V07_02.60.jpg`: face-palm, question caption, hologram just lifted off |
