# The 3D screen (film, end, Turn it)

One frame for every 3D state. Code: `src/ExploreView.tsx` (frame, film player), `src/stageControls.ts` (controls), `src/TurnLayer.tsx` + `src/liveModel.ts` (Turn it, lazy).

## Frame
| Band | Content |
|---|---|
| Top line (44 px) | Short name, soft 18 px (`Kettle`, or `Kettle · Turn it` with the mode word in cyan). Beat dots right, thin progress line under them while auto-play runs |
| Stage | The beat video (or its still), label overlay; in Turn it the live model |
| Bottom | Number block (number beats), caption 20 px white, max 2 lines (Turn it: a soft hint instead) |
| Button row | Pill buttons, 40 px, Home always last on the right |

## States
| State | Buttons | Focus on entry |
|---|---|---|
| Film | Pause/Resume, Turn it, Listen, Home | The picture |
| End (last beat) | New photo, Watch again, Turn it, Home (no New photo without a bridge) | New photo (else Watch again) |
| Turn it | Back to film, Open up/Close up (only when parts can move), Home | Back to film |

Nothing comes after the last beat: an object with an Explore film never shows its 2D lenses. Objects without a film keep the 2D lenses, in the same top line and pill row.

## Controls (same in every state)
| Gesture (key) | Film | Turn it |
|---|---|---|
| Pinch (Enter) on the picture | Next beat; last beat = New photo (offline: Watch again) | Open up / close up |
| Swipe left/right | Previous / next beat (no wrap) | Spin: about 35 degrees, glides to a stop in about 1 s; quick swipes add up (3 = about a full turn) |
| Swipe down | Button row, first button | same |
| Swipe up on the picture | Replay the beat | nothing |
| In the row | Left/Right move, Up = back to the picture, pinch presses the button | same |
| Back (Escape) | Home | Back to the film, same beat |
| Pointer drag (simulator pad) | | Follows the finger (turn and tilt), keeps the release speed and glides |

Bridge `nav`: next/deeper = pinch, left/prev and right = swipe, down = row, up = picture, done = Home. Any input holds auto-play 20 s.

## Turn it
- Built live from the chapter's `model3d` spec with render3d's own `buildGeometry` and "real" materials (`@r3d` alias), so it matches the film. Camera = beat 1's yaw and pitch.
- A spec without `style: "real"` gets role materials; an object part that holds other parts becomes glass. Parts flown out of view by a huge explode offset (the phone's finger) are left out.
- Spin: each swipe adds 90 degrees/s (a quick repeat in the same direction 1.8x), capped at 360 degrees/s; exponential friction (0.3 s, a little lighter at speed). Open up / close up eases out over 0.6 s, also while spinning.
- Renders only while something moves (the loop stops when it settles), pixel ratio 1, no bloom. Shadows (the films' soft occlusion) are off; `?shadows=1` turns them on. WebGL failure or context loss shows the beat's clean still (`c<n>.png`) and "3D view unavailable". `?live3d=0` forces that.
- The module (`liveModel`, three.js) is a lazy chunk, fetched 3 s into the film.

## Checks
- `node scripts/nav-check.mjs <shotDir>`: every film against the running bridge (build first). `--quick` skips the 36 s card check, `--only kettle,phone`, `NAV_GPU=1` uses the GPU instead of software GL.
- Measured (AMD Renoir iGPU, 600x600): Turn it shows the model 0.3 to 0.7 s after the button; 60 fps while spinning, with or without shadows; about 1.5 ms of JS per frame.
- `npm run test:states`: the full state suite (own fake bridge).
