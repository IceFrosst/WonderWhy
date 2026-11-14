# render3d: the Explore lens renderer

Renders every Explore chapter (`lens: "explore"`, `scene: "model3d"`, spec in [MODEL3D.md](../shared/MODEL3D.md)) with three.js in headless Chromium, frame by frame, and writes per-beat clips, stills and label tracks into `bridge/media/<id>/explore/`. Two looks: the glowing-line look (default) and the photo-real look (`spec.style: "real"`, MODEL3D.md v2).

## Run
| Command | What |
|---|---|
| `npm install` | Once. Pins `three` 0.170.0 and `playwright` 1.55.0 (same Chromium as `glasses/`) |
| `npm run render` | All objects in `shared/objects.json` that have an Explore chapter |
| `npm run render -- --only kettle` | One object |
| `npm run render -- --only kettle --stills-only` | Only `c<n>.png` / `s<n>.png` (about 1.5 s): use while tuning a spec |
| `npm run render -- --only kettle --beat 3` | One beat's files (does not rewrite `tracks.json` or the manifest) |
| `npm run render -- --spec chapter.json --id test --out /tmp/media` | A chapter from a file (testing a sketch) |
| `npm run render -- --spec chapter.json --id test --out /tmp/media --stills-only --strip` | Also `k<n>.png`: 900x600 contact sheet, 3 frames in the move + 3 after rest. Review motion without video |
| `--max-kb <kb>`, `--crf <n>` | Size cap per clip (default 1024 KB, 3072 KB for `style: "real"`), start CRF (18) |
| `--fps <n>` | Preview clips at n frames per second (1 to 30, default 30): same timeline, a third of the work at 10. Use for a quick look on a laptop; final clips are rendered at 30 on a machine with a GPU |

Needs `ffmpeg` on PATH. The kettle (6 beats, 1224 frames) takes about **25 s** on a machine with a GPU (Chromium uses ANGLE/D3D11); software WebGL is slower but works: on the Iris Xe laptop Chromium falls back to SwiftShader, about **0.3 s per frame** in the line look. The real look's occlusion shadows, panes and halos cost about +15 to 18% per frame (paired A/B in one browser, 14 Nov night). Stills only: about 3 s per beat.

Unknown `material`, `prim` and `fx` names print a `WARNING <id>:` line (the part falls back to its role's material; unknown prims and fx are skipped). Clips over the size cap or with a loop seam over 1 also warn.

## Output (`bridge/media/<id>/explore/`)
| File | What |
|---|---|
| `b<n>.mp4` | 600x600, 30 fps, H.264 yuv420p, `+faststart`, keyframe at `loopFrom`. `move` s (default 0.8) from beat n-1's rest state, then `dur` s of the beat. CRF starts at 18 and rises only if the file is over the cap (1 MB, 3 MB for `real`) |
| `c<n>.png` | The frame at rest (t = `loopFrom`), text-free |
| `k<n>.png` | Only with `--stills-only --strip`: the contact sheet |
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
| Motion | Camera and explode ease (cubic in-out, `move` s, default 0.8). `move` and `dur` are rounded to whole frames. Anims, flows, waves, heat, sine, steam, beams and pulses are quantised to a whole number of cycles per loop, so `[loopFrom, end]` loops exactly (the script checks the seam: max pixel difference 0 or 1) |

## The real look (`spec.style: "real"`, `page/real.js`)
| Step | Detail |
|---|---|
| Materials | `MeshStandardMaterial` (Physical where the preset has clearcoat or sheen) from the MODEL3D v2 preset table; `color`, `metalness`, `roughness`, `opacity`, `emissive`, `glow` override; no `material` = role default. Dark presets are pre-lifted and any non-metal colour darker than 4.5% linear luminance is lifted to it |
| Normals | Split at creases over 40 degrees (`toCreasedNormals`): lathes and tubes smooth, boxes and lathe corners crisp |
| Light | Studio environment built once with PMREM (dark grey dome, overhead box, warm key strip, cool fill strip, two rim strips behind) turned with the camera yaw; warm key, cool fill and two rim directional lights aimed relative to the camera each frame; ACES filmic, sRGB, black background, no floor |
| Occlusion | Two black directional lights (upper left and upper right, camera-relative) only cast soft PCF shadows (512 px, radius 4) framed on the solid parts in view. Their shadows, weighted by how much a face looks at each light, cut all light there by up to `REAL.shadow.ao` (60%, half on focus parts): lid lip, body into base, an exploded layer onto the one below. Receiver-side slope bias, no occlusion at grazing angles. See-through and ghosted parts neither cast nor receive |
| Rim | Every part gets a fresnel rim (material colour lifted to white, power 3.5) so silhouettes read on the additive display; a faint material-tinted edge line (`REAL.edge`, max-blended, so it only shows against darker pixels) |
| See-through | `glass`, `water`, `acrylic`, `glass_tint` and any `opacity` < 1 are additive (reflections, rim and a faint lit tint added to what is behind, no absorption), reflections at 35% |
| Panes | On the big flat faces of a thin see-through or `screen` part (smallest bbox extent under 20% of the middle one): environment reflection under `REAL.pane.floor` is cut, the face rim is x0.12, and one crisp slanted reflected strip is added, so it reads as dark glossy glass; the pane's edges keep the full rim |
| Focus / dim / ghost | Focus parts keep their material and get a silhouette outline in their role colour (green on number beats; fainter on parts that glow already and on thin parts). Others: 35% brightness, 85% desaturated. Ghost parts: the solid fades out and an additive fresnel glass shell fades in. Ghost wins over dim |
| Cut | A clip plane on the listed parts slides in from outside the part over the move (and out again on the next beat). Inside faces of a cut part are a flat mid-dark grey; a thin glowing line marks where the plane crosses the part |
| Glow | A glow layer (black occluders, emissive parts, outlines at 45%, fx) rendered at half size, bloomed, and only the bloom added. White plastic never blooms. Thin parts (middle bbox extent under 3% of the model radius: wires) glow at 30 to 100%. fx lines and points are drawn sharp in the main pass (max blending) |
| Halos | fx lines, flow dots, beams up to 6 px and focus outlines first draw a wider min-blended dark halo: what is under a line of brightness k is capped to `cap / k` (no beading, no effect on dark pixels), so they stay readable over bright metal |
| Tuning | Every number of the look is in `REAL` and `PRESETS` at the top of `page/real.js` |
| Line look unchanged | Checked after every real-look change: `npm run render -- --stills-only --out <tmp>`, then every `c<n>.png` and `s<n>.png` compared pixel by pixel with the same run of the previous code (`git archive HEAD`) on the same machine (14 Nov night: 84 of 84 identical). Do not compare with `bridge/media/`: those were rendered on another machine and differ by rasterisation |

## Decisions where MODEL3D.md leaves room
| Topic | Choice |
|---|---|
| `stagger` | Parts with a non-zero `explode` that change amount leave in `order` (equal orders together), and come back in reverse order. Each travels `move - stagger` s; the stagger is capped at `move - 0.4` so every part rests by `loopFrom` |
| `explodeOnly` | Per part: listed parts take the beat's `explode`, the rest 0. Children follow their parent |
| `anim` | One object = its first kind (v1 behaviour); a list runs each. `slide` like `shake` without motion ghosts; `pulse` scales about the part's origin between 1 and `scale` |
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
| `page/scene.js` | Scene builder, spec normaliser (v2 limits) and deterministic `renderAt(beat, t)`; exposes `window.R3D` |
| `page/real.js` | The real look: presets, materials (rim, occlusion and pane shader hooks), studio environment, lights and occlusion lights, glow pass |
| `page/geometry.js` | Primitives (incl. `capsule`), edge, outline and contour extraction |
| `page/overlay.js` | The captioned still |
