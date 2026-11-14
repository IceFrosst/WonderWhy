# render3d: the Explore lens renderer

Renders every Explore chapter (`lens: "explore"`, `scene: "model3d"`, spec in [MODEL3D.md](../shared/MODEL3D.md)) with three.js in headless Chromium, frame by frame, and writes per-beat clips, stills and label tracks into `bridge/media/<id>/explore/`.

## Run
| Command | What |
|---|---|
| `npm install` | Once. Pins `three` 0.170.0 and `playwright` 1.55.0 (same Chromium as `glasses/`) |
| `npm run render` | All objects in `shared/objects.json` that have an Explore chapter |
| `npm run render -- --only kettle` | One object |
| `npm run render -- --only kettle --stills-only` | Only `c<n>.png` / `s<n>.png` (about 1.5 s): use while tuning a spec |
| `npm run render -- --only kettle --beat 3` | One beat's files (does not rewrite `tracks.json` or the manifest) |
| `npm run render -- --spec chapter.json --id test --out /tmp/media` | A chapter from a file (testing a sketch) |

Needs `ffmpeg` on PATH. The kettle (6 beats, 1224 frames) takes about **25 s** on a machine with a GPU (Chromium uses ANGLE/D3D11); software WebGL is slower but works.

## Output (`bridge/media/<id>/explore/`)
| File | What |
|---|---|
| `b<n>.mp4` | 600x600, 30 fps, H.264 yuv420p, `+faststart`, keyframe at `loopFrom`. 0.8 s move from beat n-1's rest state, then `dur` s of the beat. CRF starts at 20 and rises until the file is under 400 KB |
| `c<n>.png` | The frame at rest (t = `loopFrom`), text-free |
| `s<n>.png` | The same frame with top line (object, beat dots), labels with leaders, number and caption |
| `tracks.json` | `{objectId, size, fps, beats: [{dur, loopFrom, labels: [{part, side, focus, anchor: [[t, x, y], ...]}], number, dims?}]}`. `dur` is the clip length in seconds (move + beat `dur`); anchors are sampled at 10 Hz over the whole clip, in 600x600 pixels |

`manifest.json` gets a `"<id>.explore"` entry (kind, title, `beats` [{clip, still, clean}], `stills`, `clean`, `tracks`, captions, size 600, fps 30), merged first; other entries are kept. `glasses/scripts/export-media.mjs` skips `model3d` chapters and keeps `*.explore` entries when it rewrites a manifest.

## How a frame is made
| Step | Detail |
|---|---|
| Parts | One primitive each (`page/geometry.js`). Transforms in model space: `pos`, `rot` XYZ degrees, `scale`, `explode` x eased explode amount. A child (`parent`) follows its parent's motion; its own numbers are model-space too |
| Lines | Crease edges (over 30 degrees) and open boundaries, plus the smooth silhouette traced each frame as an interpolated contour (no zigzag on tubes and lathes). Thick `LineSegments2`, max blending so joints do not bead, depth fade (far side 60% dimmer) |
| Faces | Very faint additive fill with a rim term, so solids read as solid |
| Solid / X-ray | With no focus, non-ghost parts are solid: they hide what is behind them except an 8% trace (depth prepass + stencil classes that fade during moves). Focus parts are bright in their role colour, others become dim white ghosts |
| Glow | `UnrealBloomPass` with the wide mips switched off: lines glow without haze. The caption band and the top line are dimmed so text over the video stays legible |
| Motion | Camera and explode ease (cubic in-out, 0.8 s). Anims, flows, waves, heat and pulses are quantised to a whole number of cycles per loop, so `[loopFrom, end]` loops exactly (the script checks the seam: max pixel difference 0 or 1) |

## Decisions where MODEL3D.md leaves room
| Topic | Choice |
|---|---|
| `turn` | A back-and-forth turn, not a full spin: yaw = base + A (1 - cos) / 2 over the loop, peak speed = `turn` deg/s. Rest frame is the base yaw, so the loop and the next beat's move are seamless |
| `zoom` | 1 = the model's bounding sphere (assembled, explode 0) fills 70% of the stage height (stage = y 36 to 500) |
| Anim axis | In model (parent) space, through the part's own origin |
| Number beats | Focus parts draw in answer green with a slow breathing halo (roles are per part; this keeps "green answer" without a new field) |
| Labels | Side = the side of the stage centre the part is on; all side assignments are tried so no two labels on a side come within 26 px at any sample. Anchor = the part's outermost point towards its column, near its middle height, inside the stage |
| Beat 1 move | No previous beat: the camera eases in from 24 degrees round and 12% further out |

## Files
| File | What |
|---|---|
| `render.mjs` | Node driver: static server, Playwright, ffmpeg, manifest merge |
| `page/index.html` | Import map to `node_modules/three` |
| `page/scene.js` | Scene builder and deterministic `renderAt(beat, t)`; exposes `window.R3D` |
| `page/geometry.js` | Primitives, edge and contour extraction |
| `page/overlay.js` | The captioned still |
