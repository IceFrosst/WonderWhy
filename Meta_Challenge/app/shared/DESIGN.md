# Physics Lens: one visual direction (glasses, phone page, Android cards)

Owner: `desktop` brain. `friend` follows this for the Android cards and asks for changes in its outbox. Written fresh at the event; the reference projects in DESIGN_REFERENCES *(internal note, not in this repo)* set the bar for taste only.

## Who and what feeling
| | |
|---|---|
| Who | A curious person looking at an everyday object. Reads for 5 to 40 seconds, standing, in daylight |
| Feeling | A calm, precise sketch drawn in light over the real thing. A good teacher's whiteboard, not a game HUD |
| One rule | **The drawing explains; the words name.** If a step needs more than one sentence, the drawing is wrong |

## Hard limits (glasses)
| Limit | Value |
|---|---|
| Canvas | 600x600. Additive display: **black is see-through**, so only bright marks on black |
| Text | 16 px or more, in the DOM (toolkit `TextView`). Labels drawn in the canvas: 16 px or more |
| Filled areas | Under about 15% of the stage. Big fills glow and hide the world. Draw outlines |
| Frame rate, size | 30 fps. First load under 300 KB gzipped, under 15 requests. Canvas 2D only |
| Input | D-pad, pinch, back. Nothing needs a pointer or a keyboard |
| Safe margin | 24 px from every edge of the 600x600 |

## Colour: each one means one thing (`glasses/src/scenes/palette.ts`)
| Role | Colour | Used for | Never for |
|---|---|---|---|
| Object | white `#ffffff` | The outline of the real thing, titles, the caption | Decoration |
| Label | soft `#c9d4ff` | Secondary text, part names, axis labels | Moving things |
| Actor 1 | cyan `#4df0ff` | The thing that moves or flows: the ball, the wave, the water, the signal | Static frames |
| Actor 2 | amber `#ffc247` | Force, energy, heat going in: gravity arrow, the element, tension | Warnings |
| Answer | green `#6dff9c` | The one value or mark that answers the question | A generic "ok" |
| Other one | pink `#ff7ad9` | The second object in a comparison | Anything when there is no comparison |
| Loss | hot `#ff8a4d` | Energy lost: heat, drag, sound. Also error cards | Normal heat going in (that is amber) |
| Guide | dim / faint white | Grids, ghosts ("no air" path), past positions | Text |

- At most 3 roles on screen at once, plus white and guides.
- **Nothing is told by colour alone.** Every coloured mark has a name next to it or a shape of its own (arrow = force, dashed = ghost, dot trail = path).
- The word in the caption takes the colour of the mark it names when that helps ("the <cyan>ball</cyan>"). No legends.

## Type
| Where | Face | Sizes | Notes |
|---|---|---|---|
| Glasses | Toolkit default | Title `BODY2_EMPHASIZED`, answer line `META1`, caption `META1`, hint and readouts `META2`. Never under 16 px | Numbers use tabular figures and always carry a unit |
| Phone page, Android | System (Roboto / `system-ui`) | 14 for tags, 16 body, 20 card title, 28 the big number | Line height 1.4. Weights 400 and 600 only |

## Words (word caps are part of the design)
| Text | Cap | Example |
|---|---|---|
| Title | 4 words | "Thrown ball · Bounce" |
| One-line answer | 12 words | "Gravity bends the path into a curve." |
| Step caption | 24 words, one idea, high-school level | |
| Hint | 8 words | "Left/right: angle. Up/down: speed." |
| State card | Title 3 words, body 8 words, and it says what to do | "Not sure" / "Look again, a bit closer." |

Plain words, no exclamation marks, no "Oops". Units always. Formulas only on step 2 or later.

## Layout of an explainer (600x600, top to bottom)
| Band | Height | Content |
|---|---|---|
| Head | ~64 | Title, one-line answer |
| Stage | the rest, at least 300 | The canvas. One hero object, centred, labels inside the drawing |
| Readouts | ~28 | Up to 3 live values: label in soft, value in white |
| Caption | up to 3 lines | "Step 2/3." then the sentence |
| Hint, lens bar | ~24 | What the D-pad does here; the lens dots |
| Dock | ~56 | One button. Pinch always does the obvious next thing |

## Lenses
| Kind | Name on screen | Mark |
|---|---|---|
| `motion` | Motion | curved arrow |
| `inside` | Inside | stacked layers |
| `cutaway` | Cutaway | half circle |
| `flow` | Flow | chain of dots |
| `zoom` | Zoom | rings |
| `whatif` | What if | fork |
| `compare` | Compare | two bars |
| `number` | The number | `#` |

Lens bar: one dot per lens, the current one filled and named. Swipe (left/right on the lens bar) changes lens, pinch goes deeper. The bar never shows more than 5 dots.

## Motion
| Rule | Value |
|---|---|
| Continuing processes | Loop (a wave, a swing, convection) |
| Results | Play once, then rest on the last frame |
| Step change | 200 to 300 ms ease, no bounce |
| **Every step has a meaningful still** | The frame at rest must explain the step by itself. The stills export depends on it |
| Never | Flashing faster than 3 per second, moving text, wobble, decoration that explains nothing |
| Reduced motion (phone, Android) | Show the still for each step |

## Where an answer comes from (always shown)
| Tag | Meaning | Look |
|---|---|---|
| Library | A prerendered, checked explanation | No tag on the glasses; "Library" tag on the phone |
| Model | Text the model wrote for this photo | "Model answer" tag in soft |
| Sketch | A generated scene for an unknown object | "Sketch · unverified" tag in hot, on every step |

## States every surface must have
| State | Glasses | Phone page / Android card |
|---|---|---|
| Home | Title, 6 object buttons, bridge status | Camera, pinch button, object buttons |
| Looking | "Looking…" centred, leaves by itself after `timeoutMs` | Spinner in the photo frame |
| Explainer | Layout above | Card: title, one-line answer, steps, lens buttons |
| Not sure (`lowConfidence`) | Card "Not sure" / "Maybe: label. Look again, a bit closer." | Same words, with a "Use it anyway" action |
| Unknown | Model text, "Model answer" tag, Done | Same |
| Took too long | Card, 4 s | Card with "Try again" |
| Bridge offline / locked | Card; built-in demos still work | Banner with what to do |
| First-run consent, camera denied | Card | Full card with one action |
| Battery low, hot, offline | Card, 6 s | Card |
| Glasses taken off | Display blank | "Glasses are off" card |

Card anatomy everywhere: **title (what happened), one line (what to do), at most 2 actions.** Dismiss with Back. Error cards auto-dismiss; cards that need a decision do not.

## Phone page and Android: same language on a dark ground
| Role | Value |
|---|---|
| Ground | `#0b0d10`; cards `#14181d` with a 1 px `#2a3038` border, radius 12 |
| Text | `#eef1f5`; muted `#9aa3ad` |
| Accent | cyan `#4df0ff` for the one primary action per screen; the other palette colours keep their meaning from the table above |
| Spacing | 8 px base: 8 / 16 / 24. Touch targets 48 px |
| Contrast | 4.5:1 or better for all text |

## Check before a UI task is done
- Screenshot at 600x600 on black (and the phone card at 390 wide). Hold it against this file.
- Can a stranger say what the step shows with the caption covered? If not, fix the drawing.
- Count the colours. Count the words. Check the still.
