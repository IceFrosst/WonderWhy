# Explore lens: the 3D explanation (`lens: "explore"`, `scene: "model3d"`)

Owner: `desktop`. The first lens of every object, library or sketch. It replaces "a small 2D diagram under a lot of text" with **the object itself, in light, turning in front of you, coming apart, and showing the physics on the part that does the work.**

## What the viewer sees (one chapter = 4 to 6 beats)
| Beat | Job | Typical camera | Typical sentence (max 16 words) |
|---|---|---|---|
| 1 Meet it | The whole object, assembled, turning slowly. Names the question | Three-quarter view, whole object | "A kettle boils a litre in about three minutes. Here is how." |
| 2 Take it apart | Parts slide apart along their `explode` vectors. 2 or 3 labels | Pulled back a little | "Inside: a heating element, the water, and a steam switch." |
| 3 to 4 The mechanism | Zoom on the working part. Other parts ghost. The physics is animated on it (flow, arrows, spin, heat, waves) | Close on the focus part | "Current through the element meets resistance and turns into heat." |
| 5 The number | One big number with its unit, green, and what it means | Close or whole | "2000 W: enough to warm a litre by 1 °C every 2 seconds." |
| 6 So what (optional) | A surprising everyday consequence | Whole object again | "Boiling only the water you need saves most of the energy." |

Rules for the words (in addition to [DESIGN.md](DESIGN.md)):
- One sentence per beat, **at most 16 words**, present tense, concrete. It names what is highlighted ("the <part>"), it does not describe the picture ("as you can see" is banned).
- No formula on beat 1 or 2. Beat 5 may carry one number, never a formula.
- Explain cause then effect: "X happens, so Y". High-school level, correct physics, no hedging words.
- A beat that adds nothing is cut. Four strong beats beat six weak ones.

## How it is made and shipped: rendered offline in three.js, streamed as video
The glasses never run a 3D engine. `Meta_Challenge/app/render3d/` renders every Explore chapter with **three.js** in headless Chromium (Playwright), frame by frame (deterministic, not real time), pipes the frames to ffmpeg, and writes into `bridge/media/<id>/explore/`:

| File | What |
|---|---|
| `b<n>.mp4` | Beat n: 600x600, 30 fps, H.264 yuv420p, `+faststart`, black background, **no text in the picture**. Starts with the move from beat n-1's resting state (about 0.8 s), then the beat's own motion. Target under 1 MB per beat at CRF 18 (raised from 400 KB on 14 Nov: the cap forced visible blocking on busy beats; all 42 clips now fit at CRF 18, largest 929 KB, 13 MB in total) |
| `s<n>.png`, `c<n>.png` | The beat's frame at rest: captioned (for the phone and Android cards) and text-free |
| `tracks.json` | Per beat: `dur`, `loopFrom` (seconds; the player loops `[loopFrom, end]` so continuing motion keeps going), `labels` (part id, side `l` or `r`, and the anchor's screen position sampled at 10 Hz: `[[t, x, y], ...]`), `number` |

The object's `manifest.json` gains a `"<id>.explore"` entry listing these files (the 2D stills export keeps it when it rewrites the manifest). The glasses app plays `b<n>.mp4` from the bridge's `/media` (it arrives in `show.media`), draws the label text and leader lines itself on an overlay from `tracks.json` (so labels translate without re-rendering), and shows caption and number in the DOM. If a video cannot play within 1.5 s, it shows `c<n>.png` with the same overlay. If there is no media at all (offline), the Explore lens is skipped. Unknown objects: the bridge can render a sketch's explore chapter with the same renderer when Chromium is present (`RENDER3D=1`), and otherwise the sketch shows its 2D lenses only.

## Look (Ray-Ban Display, additive: black is see-through)
| Element | Rendering |
|---|---|
| Parts | Glowing edges (silhouette and crease edges, thick anti-aliased lines) with a soft bloom, faces filled very faintly (additive, about 0.05 to 0.12) so solids read as solid, far parts dimmer (depth fade). Filled area stays under about 15% of the frame's brightness budget: black is see-through |
| Colours | Part `role`: `object` white (default), `actor` cyan, `energy` amber, `loss` hot, `answer` green, `other` pink. The DESIGN.md roles and the "at most 3 roles at once" rule hold |
| Focus | Beat `focus` parts draw at full brightness in their role colour; every other part becomes a ghost (dim white edges, no fill) |
| Ghost | Beat `ghost` parts (for example a kettle's body) draw as a faint shell so the inside is visible: an X-ray, not a cut |
| Labels | Text 16 to 18 px soft (focus labels white), in two margin columns (left and right of the stage) with a thin leader line to the part's anchor. Never more than 3 labels per beat. Never overlapping each other or the focus part |
| Camera | Orbit camera: `yaw`, `pitch` (degrees), `zoom` (1 = whole object fills about 70% of the stage height), `target` (part id or [x,y,z]). Moves between beats ease in 0.8 s. `turn` (degrees per second, default 0) slowly turns the object while the beat runs |
| Motion | Explode and camera ease, never bounce. Loops for continuing processes (flow, spin, waves); arrows pulse slowly (under 1 Hz) |
| Still | Every beat's frame at rest (after its camera move, explode done) explains the beat. Stills export uses that frame |

## Screen layout of this lens (600x600)
| Band | Content |
|---|---|
| Top line, ~30 px | `Kettle` in soft 18 px and the beat dots (`● ● ○ ○ ○`) on the right. No lead line, no big title |
| Stage | Everything else: 600 x about 450. The model, labels and effects |
| Number (only on beats with `number`) | Bottom left over the stage: value 44 px green with unit, a 16 px soft label under it |
| Caption, bottom | The beat sentence, 20 px white, at most 2 lines, 24 px margin |
| No dock button | Pinch = next beat (on the last beat: next lens). Left/right = lens as everywhere. Up/down = turn the model 30 degrees |
| Auto-play | Beats advance by themselves after `dur` seconds (default 6). Any input pauses auto-play for 20 s. A thin progress line under the dots shows the time left |

## Data (`chapter.spec` with `scene: "model3d"`)
Units are free (the camera frames the model's bounding sphere); y is up; angles in degrees. Every part is built from one primitive.

```json
{
  "lens": "explore", "scene": "model3d", "title": "How it works",
  "captions": ["beat 1 sentence", "beat 2 sentence", "..."],
  "spec": {
    "parts": [
      {"id": "body", "label": "Body", "prim": "lathe", "profile": [[0,0],[9,0],[10,2],[9.5,18],[7,20]],
       "pos": [0,0,0], "rot": [0,0,0], "role": "object", "explode": [0,0,0]},
      {"id": "element", "label": "Heating element", "prim": "torus", "r": 6, "tube": 0.5,
       "pos": [0,1,0], "rot": [90,0,0], "role": "energy", "explode": [0,-6,0]}
    ],
    "beats": [
      {"camera": {"yaw": 30, "pitch": 20, "zoom": 1, "target": null}, "turn": 8},
      {"camera": {"yaw": 35, "pitch": 25, "zoom": 0.9}, "explode": 1, "labels": ["body", "element", "switch"]},
      {"camera": {"yaw": 20, "pitch": 30, "zoom": 2.2, "target": "element"}, "explode": 0, "ghost": ["body"],
       "focus": ["element"], "fx": [{"type": "heat", "on": "element"}, {"type": "flow", "path": [[0,1,0],[0,15,0],[7,15,0],[7,1,0]], "role": "actor", "label": "warm water rises"}]},
      {"camera": {"yaw": 20, "pitch": 20, "zoom": 1}, "number": {"value": "2000", "unit": "W", "label": "heating power"}}
    ]
  }
}
```

### Primitives (`prim`)
| prim | Fields | Good for |
|---|---|---|
| `box` | `size` [x,y,z], optional `round` (corner radius) | Phone, plates, blocks, switch |
| `cylinder` | `r`, `h`, optional `r2` (top radius: cone or frustum), `segments` | Axles, cans, pegs, cones |
| `sphere` | `r` | Balls, bobs, bulbs |
| `torus` | `r`, `tube` | Rings, coils seen as a loop, tyres |
| `lathe` | `profile` [[radius,y],...] revolved around y | Kettles, bottles, cups, bulbs, spoons' bowls (with `scale`) |
| `extrude` | `shape` [[x,z],...] closed polygon, `h` (along y) | Plates, gears drawn as polygons, guitar body outline, frames |
| `tube` | `path` [[x,y,z],...], `r`, optional `closed` | Cables, strings, chain, handles, pipes, frame tubes |
| `gear` | `teeth`, `r`, `h`, optional `toothDepth` | Chainrings, cogs |
| `helix` | `r`, `h`, `turns`, `tube` | Springs, coils, element wire |

Common fields on every part: `id` (unique, `[a-z0-9_-]{1,32}`), `label` (shown when listed in a beat's `labels`, 24 characters max), `pos`, `rot` [x,y,z] degrees, `scale` (number or [x,y,z]), `role`, `explode` [x,y,z] offset at full explode, optional `parent` (id: the part moves with its parent), optional `anim`:
- `{"spin": {"axis": [0,1,0], "rpm": 30}}` turns the part about its own origin (wheels, gears, motor).
- `{"swing": {"axis": [0,0,1], "deg": 20, "hz": 0.5}}` rocks it (pendulum, key).
- `{"shake": {"axis": [1,0,0], "amp": 0.3, "hz": 4}}` vibrates it (string, speaker cone), drawn with motion blur ghosts.
An `anim` runs only in beats that list the part in `play` (so beat 1 can be still and beat 3 alive).

### Beats (`beats[]`, one per caption)
| Field | Meaning |
|---|---|
| `camera` | `yaw`, `pitch`, `zoom`, `target` (part id, [x,y,z] or null = model centre) |
| `turn` | Degrees per second of slow turning during the beat (0 to 20) |
| `explode` | 0 to 1 (default 0) |
| `focus`, `ghost`, `labels`, `play` | Lists of part ids (labels at most 3) |
| `fx` | Effects, drawn in model space so they turn with the object (list, at most 4) |
| `number` | `{"value": "2000", "unit": "W", "label": "heating power"}` (value is a string so "1/3" or "3.4" render as written) |
| `dur` | Seconds before auto-advance (3 to 12, default 6) |

### Effects (`fx[].type`)
| type | Fields | Shows |
|---|---|---|
| `arrow` | `from` [x,y,z] or part id, `dir` [x,y,z], `len`, `role`, `label` | A force or a velocity (amber force, cyan motion, hot loss). Pulses slowly |
| `flow` | `path` [[x,y,z],...], `role`, `speed` (units/s), `count`, `label`, `closed` | Particles moving along a path: current, water, air, heat, chain, signal |
| `heat` | `on` part id, `role` (`energy` or `loss`) | The part glows and shimmers: heating element, brake, warm chip |
| `waves` | `at` [x,y,z] or part id, `role`, `hz` | Rings expanding from a point: sound, vibration |
| `trail` | `on` part id | A fading trail behind a moving part: pendulum bob, thrown ball |
| `dim` | `on` part id, `text` | A dimension line with text, for example "65 cm" along a string |

### Limits (the bridge validator and the glasses sanitizer both enforce them)
At most 32 parts, 6 beats, 4 fx per beat, 64 points per path or profile, 3 labels per beat; numbers finite and within ±10,000; `segments` 6 to 48; `teeth` 6 to 80; unknown fields ignored; unknown `prim` or `type` skipped (the rest still draws); unknown ids in beat lists ignored. A spec that fails validation falls back to the old 2D lenses; it never blanks the display.

## Translations
`captions` translate as usual. Part `label`s and `number.label` translate through `specText` (PROTOCOL.md, "Translated text inside the drawings"): `{"parts": [{"label": "..."}], "beats": [{"number": {"label": "..."}}]}`, same lengths, `null` where there is nothing.

## Unknown objects (sketches)
The sketch provider asks the model for an `explore` chapter in exactly this format from a short list of primitives, plus the existing 2D chapters. The bridge validates it with the limits above, and the glasses show it with the "Sketch · unverified" tag on every beat.

---

# v2: the realistic style (`spec.style: "real"`), 14 Nov afternoon

Owner decision: the Explore film is **the** explanation. It is now a photo-real, coloured 3D model (real materials, studio light, on black) that comes apart piece by piece, with the glowing physics effects drawn on top. Everything above still holds unless a row here changes it. A spec without `style` renders in the old glowing-line look.

## What changes
| Topic | v2 |
|---|---|
| Look | Physically based materials (metal, glass, plastic, wood, stone, water), image-based studio lighting plus a key and a rim light, filmic tone mapping, black background. No part may render darker than a clearly visible mid-grey on its lit side: black is see-through on the glasses, so "black" plastic and rubber are drawn dark grey with a bright rim |
| Detail | Up to **96 parts**. Model the real thing: screws, vents, seams, coils, buttons, cables. Small parts carry the realism |
| Length | Up to **8 beats**, `dur` 3 to 16 s, `move` 0.5 to 4 s. A film runs 60 to 90 s |
| Explode | Staged: parts leave one after another (`stagger`), not all at once |
| Focus | Focus parts keep their real material at full light with a thin glowing outline in their role colour; other parts dim and lose colour; ghost parts become a faint glass shell |
| Effects | The glowing additive effects (flow, arrows, heat, waves, sine, steam, beams) stay as they are: they are the physics, drawn in light on a real object |
| Brightness budget | The old 15% rule does not apply to `style: "real"` |
| Clip size | Up to 3 MB per beat (CRF from 18) |

## New fields
| Where | Field | Meaning |
|---|---|---|
| spec | `style` | `"real"` or `"lines"` (default) |
| part | `material` | A preset name from the table below. Without it the role decides (`object` grey plastic, `actor` cyan-tinted, `energy` amber emissive, `loss` red emissive, `answer` green emissive) |
| part | `color` | `"#rrggbb"`, overrides the preset's colour |
| part | `roughness`, `metalness` | 0 to 1, override the preset |
| part | `opacity` | 0.05 to 1 (glass-like when under 1) |
| part | `emissive`, `glow` | `"#rrggbb"` and 0 to 3: the part gives off light (LED, hot element, lit pixel) |
| part | `order` | Number: its turn in a staged explode (default: its index in `parts`) |
| part | `anim` | May be a list. New kinds: `{"slide": {"axis": [0,1,0], "amp": 2, "hz": 0.5}}` (back and forth along a line: piston, weight stack, print head) and `{"pulse": {"scale": 1.08, "hz": 2}}` (breathing size: speaker cone) |
| beat | `move` | Seconds of the transition from the previous beat (default 0.8) |
| beat | `stagger` | 0 to 4 s: during the move, parts start travelling to their exploded place one after another in `order`. Use `move` >= `stagger` + 0.8 |
| beat | `explodeOnly` | List of part ids: only these explode in this beat, the rest stay assembled |
| beat | `cut` | `{"normal": [1,0,0], "offset": 0, "parts": ["body", "tank"]}`: slices the listed parts open with a plane (keeps the side the normal points away from), eased in during the move. A real cutaway |

## Materials (`part.material`)
| Group | Names |
|---|---|
| Metal | `steel` (brushed stainless), `chrome` (mirror), `aluminium`, `iron` (dark cast), `copper`, `brass`, `gold` |
| Plastic and rubber | `plastic` (set `color`), `plastic_white`, `plastic_black`, `plastic_grey`, `rubber`, `silicone` |
| See-through | `glass`, `glass_tint` (smoked), `screen` (black glossy display), `water`, `acrylic` |
| Natural | `wood`, `wood_dark`, `stone`, `ceramic`, `fabric`, `foam`, `leather` |
| Electronics | `pcb` (green board), `chip` (black package), `battery` (silver foil cell), `magnet`, `led` (set `color`) |
| Light | `emissive` (set `color`): glowing wire, filament, lit pixel |

## New primitive and effects
| Kind | Fields | Shows |
|---|---|---|
| prim `capsule` | `r`, `h` (length of the straight part, along y) | Pills, earbud stems, rounded bars |
| fx `sine` | `from` [x,y,z], `to` [x,y,z], `amp`, `waves` (number of cycles along the line), `speed` (cycles per second, towards `to`), `phase` (degrees), `up` [x,y,z] (direction of the swing, default y), `decay` (0 to 1: amplitude left at `to`, default 1), `role`, `label` | A travelling wave: sound, noise and anti-noise, light, a signal |
| fx `steam` | `at` [x,y,z] or part id, `radius`, `rise` (height the puffs climb), `role` (default white) | Soft puffs rising and fading: steam, hot air, smoke |
| fx `beam` | `path` [[x,y,z],...], `role`, `width` (1 to 6) | A steady ray of light with brightness travelling along it: projector light, a laser, a reflection path |
| fx `glow` | `on` part id, `role`, `hz` | The part's own light breathes: a chip working, a pixel lit |

## Limits v2 (renderer, bridge validator, glasses sanitizer and Android all use these)
96 parts, 8 beats, 6 fx per beat, 4 labels per beat (24 characters each), 128 points per path or profile, `dur` 3 to 16, `move` 0.5 to 4, `stagger` 0 to 4. Everything else as v1.

## Renderer additions
| Command | What |
|---|---|
| `--strip` | With `--stills-only`: also writes `k<n>.png`, a 3x2 contact sheet (900x600) of six frames over beat n's clip (at 1/3, 2/3 and the end of the move, then 1/4, 1/2 and 3/4 of `dur`), so motion can be reviewed without the video |
| `--max-kb` | Default 3072 for `style: "real"` |
| Warnings | Unknown `material`, `prim` or `fx` names print `WARNING <id>: ...` (material falls back to the role default; prim and fx are skipped) |

## As built (renderer, 14 Nov evening; shadows, panes, glow and halos 14 Nov night)
| Topic | Behaviour |
|---|---|
| See-through | `glass`, `glass_tint`, `water`, `acrylic` and any `opacity` < 1 are drawn additively: reflections, rim and a faint lit tint are added to what is behind (no absorption). That is how glass reads on black and on the additive display |
| Ghost vs focus | A part in `ghost` is a glass shell even on a focus beat (ghost wins over dim). In the line look focus still wins, as in v1 |
| Outline | Focus outline = silhouette and open edges only (no inner creases), thinner on parts that already glow |
| Cut | Inside faces of a cut part are a flat mid-dark grey, and a thin glowing line marks where the plane crosses the part. The cut slides out again on the next beat unless that beat has the same cut |
| `stagger` | Equal `order` values leave together. Effective stagger is capped at `move - 0.4` so every part rests by `loopFrom` |
| `explodeOnly` | Listed parts take the beat's `explode`, the rest 0 (children follow their parent) |
| `anim` | An object keeps v1 behaviour (its first kind); a list runs every entry (up to 4). `pulse.scale` 0.5 to 2 |
| Timing | `move` and `dur` are rounded to whole frames (1/30 s) so loops close exactly |
| New fx in the line look | `sine`, `steam` and `beam` also draw in the line look; `glow` there brightens the part's edges |
| Steam | Puffs are soft and not bloomed; `at` a part id starts at the top centre of the part |
| Shadows (real) | Soft occlusion only, no cast light: where one solid part shades another (lid lip, body into base, an exploded layer onto the one below) its light drops by up to 60%, 30% on focus parts. See-through and ghosted parts neither cast nor receive. No floor shadow (black is see-through on the glasses) |
| Panes (real) | Big flat faces of a thin `glass`, `glass_tint`, `water`, `acrylic` or `screen` part read as dark glossy glass: only bright reflections, one crisp reflected strip, a faint face rim; the pane's edges keep the full rim |
| Glow (real) | Thin emissive parts (wires, under 3% of the model radius across) bloom and outline at 30 to 100%. Focus outlines are softer and bloom at 45% |
| fx over metal (real) | fx lines, flow dots, thin beams and focus outlines draw a soft dark halo under themselves, so they stay readable over bright highlights |

## Beat plan for a v2 film (7 or 8 beats)
| Beat | Job | Typical `dur` |
|---|---|---|
| 1 Meet it | Whole object, hero light, slow turn | 6 |
| 2 Take it apart | Staged explode (`stagger` 2 to 3, `move` 3 to 4), 3 or 4 labels | 9 |
| 3 to 6 The mechanism | One idea per beat, on the part that does the work: focus, ghost or cut, effects | 8 to 10 |
| 7 The number | One number, green | 7 |
| 8 So what | Back together (explode 0), the everyday consequence | 7 |

## v3: live lines (14 Nov evening)

The explanation runs live in three.js on the glasses. Leave `spec.style` absent for the original
glowing-line look. Build 20 to 35 parts and 7 or 8 beats, each with `dur` 4 to 6 s and `move`
about 1 s. Captions contain at most 8 words; the diagram carries the explanation.

A beat may contain `"callouts": [{"to": "element", "text": "Resistance makes heat", "side": "r"}]`.
`to` is a known part id or a model-space `[x,y,z]`; `side` is optional (`"l"` or `"r"`, otherwise
chosen like labels). Text is at most 28 characters. At most 3 callouts and at most 4 labels plus
callouts per beat. Unknown targets warn and are skipped. Callouts have white text in the margin
columns, the same thin leader as labels, and a roughly 6 px arrowhead at the target. All text rows
on either side stay at least 26 px apart. Part anchors follow the same vertex as labels; explicit
points bind to the nearest assembled part and follow its explode/animation, projected each frame
with the camera. `labelTracks()` and `tracks.json` include callouts with `kind` and `text`.

Import `Explore` from `render3d/page/scene.js` and use `new Explore(canvas, {live: true})`, then
`load(spec)` and `renderAt(beat, t)` (zero-based beat, clip time in seconds). Live mode renders
straight to the canvas at pixel ratio 1, without a composer, bloom or an MSAA render target.
Geometry, fills, physics effects and beat motion use the same renderer as offline exports.
`labelsAt(beat, t)` returns `[{kind: 'label'|'callout', text, side, x, y}]`, with current **anchor**
positions in 600x600 pixels; the overlay spreads text rows by 26 px and draws the leaders/arrows.
`setView({yaw: 0, pitch: 0, explode: null})` applies yaw/pitch offsets in degrees and an optional
0..1 explode override (`null` restores the beat's explode). `setView()` resets all overrides.
`plan(beat)` returns clip `dur`, `loopFrom`, `frames`, `loopFrame` and `beatDur`.
