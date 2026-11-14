---
tags:
  - type/storyboard
  - topic/junction-2026
updated: 2026-11-14
---

# 3D explanations for the six demo objects ("live lines")

> [!summary]
> Same look as the kettle and phone: glowing lines on black, drawn **live** on the glasses with three.js (no videos). Keep the detail that explains (the parts, the take-apart, the effects), drop the polish (seams, screws, vent holes). 20 to 35 parts. 7 or 8 beats of 4 to 6 s, about 1 s moves: 35 to 45 s per object.
> Text: a **caption** under the picture of at most 8 words, and up to 3 **callouts** of at most 5 words beside the picture with a line and arrow to the part or effect. Format: [MODEL3D](app/shared/MODEL3D.md), section "v3: live lines".

| Object | Beats | State |
|---|---|---|
| Earbuds | 7 | To build (simplify `earbuds_v2.py`) |
| Phone | 7 | To build (rework `phone_explore.py`; new finger) |
| 3D printer | 7 | To build |
| Sauna stove | 7 | To build |
| Spin bike | 7 | To build |
| Display glasses | 8 | To build |

Roles (colours): object white, actor cyan, energy amber, loss red, answer green, other pink.

## 1. Earbuds (id `earbuds`)
White bud with stem and tip, ear slice (bowl into canal, eardrum disc) from beat 3. Parts: 2 shell halves, stem, tip, nozzle, outer mic, inner mic, board, chip, battery, speaker (magnet, coil helix, cone), ear slice, eardrum.
| # | Caption | Callouts → target | Picture |
|---|---|---|---|
| 1 | How do earbuds cancel noise? | none | Bud turning |
| 2 | Inside: mics, chip, speaker. | Outer mic · Chip · Speaker · Ear tip (part names) | Staged take-apart along the nozzle axis |
| 3 | The tip seals your ear. | "Blocks high sounds" → tip | Back together in the ear; short pink waves bounce off the tip |
| 4 | The outer mic hears the hum. | "Room hum" → amber wave · "Outer mic" → mic | Amber sine rolls in to the mic |
| 5 | The chip flips it upside down. | "Anti-noise" → cyan wave · "Chip" → chip | Ghost shell; chip glows; cyan sine below amber, phase 180 |
| 6 | Peak meets dip: silence. | "Flat at the eardrum" → green line · "Speaker" → speaker | Amber in from the room, cyan from the speaker, flat green line in the canal |
| 7 | **30 dB** quieter on a steady hum. | "Voices still get through" → pink wave | Number beat; spiky pink voice wave passes |

## 2. Phone (id `phone`)
Black phone with rim; layers: cover glass, touch grid, screen, mid frame, board with chip, battery, back. **Finger:** a fingertip (rounded capsule with a nail outline) comes in from the lower right at a shallow angle and rests on the glass. Never a pole from above.
| # | Caption | Callouts → target | Picture |
|---|---|---|---|
| 1 | What is inside a phone? | none | Phone turning |
| 2 | Seven thin layers. | Touch grid · Screen · Board · Battery | Layers lift off in order |
| 3 | Your finger bends the electric field. | "Touch grid" → crossing under the finger | Finger on the glass; rings from the crossing |
| 4 | Each pixel: three tiny lamps. | "Red, green, blue" → lit pixel · "Off = black" → dark pixel | Zoom on sub-pixels |
| 5 | The chip turns power into heat. | "Processor" → chip · "Heat spreads" → frame | Chip glows, heat flows into the frame |
| 6 | Charging moves lithium ions. | "Lithium ions" → ion flow | Battery opened, ions drift |
| 7 | **15 Wh** in a full battery. | "A kettle uses it in 27 s" → number | Number beat |

## 3. 3D printer (id `printer3d`)
Open-frame printer: base, bed with a half-printed part (stacked layers), frame, gantry, print head, spool, motors. Head: drive gear, heat sink fins, heater block, nozzle, fan.
| # | Caption | Callouts → target | Picture |
|---|---|---|---|
| 1 | How does a 3D printer build things? | none | Printer turning |
| 2 | The print head, taken apart. | Drive gear · Heater · Nozzle · Fan | Head explodes downward |
| 3 | A gear pushes the plastic in. | "Filament" → filament · "Drive gear" → gear | Gear spins, filament flows down |
| 4 | Melted at 210 °C. | "Heater block" → heater · "0.4 mm nozzle" → nozzle | Heater glows amber, bead flows out |
| 5 | It draws one slice at a time. | "One layer" → path | Head slides, drawing the outline |
| 6 | Each hot line welds to the last. | "Hot new line" → top layer · "Fan cools it" → airflow | Close on the layers |
| 7 | **0.2 mm** per layer. | "10 cm = 500 layers" → part | Number beat |

## 4. Sauna stove (id `sauna`)
Electric kiuas: steel cage, 3 looped elements, many separate stones on top, knobs; bucket and ladle beside it.
| # | Caption | Callouts → target | Picture |
|---|---|---|---|
| 1 | Why does sauna steam bite? | none | Stove turning |
| 2 | Elements under a pile of stones. | Heating elements · Stones · Ladle | Stones lift away |
| 3 | The stones store heat. | "About 300 °C" → stones | Heat flows from elements into stones |
| 4 | Water flashes into steam. | "1 ladle = 170 L steam" → steam | Ladle tips, steam bursts up |
| 5 | Steam rolls down over you. | "Hot steam" → steam | Steam rises, spreads, rolls down |
| 6 | On skin it turns back to water. | "Hidden heat released" → skin | Skin patch: droplets, amber arrows in |
| 7 | **2260 kJ/kg** from condensing steam. | "5× heating cold water" → number | Number beat |

Physics: 1 dl = 100 g = 5.6 mol, about 170 L of steam at 100 °C. 2260 / 418 = 5.4.

## 5. Spin bike (id `spinbike`)
Spin bike: frame, saddle, bars, pedals and cranks, belt, heavy flywheel at the front, magnet arm with magnets beside the rim, resistance knob.
| # | Caption | Callouts → target | Picture |
|---|---|---|---|
| 1 | How does it brake without touching? | none | Bike turning |
| 2 | Flywheel, belt and magnets. | Flywheel · Belt · Magnets · Knob | Cover off, parts apart |
| 3 | Pedals spin a heavy flywheel. | "Belt drive" → belt | Pedals, belt and flywheel turn |
| 4 | The knob brings magnets close. | "Small gap, no touch" → gap | Magnet arm swings in |
| 5 | Swirling currents appear in the metal. | "Eddy currents" → loops | Cyan loops in the rim under the magnets |
| 6 | They push back and slow it. | "Drag" → amber arrow | Amber arrow against the spin |
| 7 | **200 W** of effort becomes heat. | "Warms the flywheel" → rim | Number beat; rim warms |

## 6. Display glasses (id `glasses`)
Thick-framed glasses (no logos): frame, 2 lenses (right one with a waveguide plate, in- and out-grating), arms with hinges, projector in the right temple, camera, speakers, batteries; an eye behind the right lens; the wristband with electrode pads.
| # | Caption | Callouts → target | Picture |
|---|---|---|---|
| 1 | How do these glasses show a picture? | none | Glasses turning |
| 2 | Projector, lens, camera, battery. | Projector · Waveguide · Camera · Battery | Frame comes apart |
| 3 | A tiny projector makes the image. | "Projector" → light engine | Beam leaves the projector |
| 4 | A grating bends light into the lens. | "In-grating" → grating | Beam turns into the lens |
| 5 | Light zig-zags inside the glass. | "Trapped light" → zig-zag | Zig-zag beam along the lens |
| 6 | A second grating aims it at your eye. | "Out-grating" → grating · "Your eye" → eye | Beam out to the eye |
| 7 | The band reads your finger muscles. | "Muscle signals" → electrodes | Band pads light up as fingers pinch |
| 8 | **600 × 600** pixels in one lens. | "World passes through" → lens | Number beat |
