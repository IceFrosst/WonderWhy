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
| `b<n>.mp4` | Beat n: 600x600, 30 fps, H.264 yuv420p, `+faststart`, black background, **no text in the picture**. Starts with the move from beat n-1's resting state (about 0.8 s), then the beat's own motion. Target under 400 KB per beat |
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
