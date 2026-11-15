# AR shots: our 3D objects in the real world (10 versions)

Ten 6-8 s versions of one idea: **our own 3D objects (the ones the glasses app shows) appear in front of a real person or a real object in the event footage.** The user watches all ten, picks a direction, and that look goes into the WonderWhy film ([Video_Script.md](../../Video_Script.md)).

| | Version | Footage (raw name) | Object |
|---|---|---|---|
| V01 | The printer prints its own hologram | `printer_1_core_one.mp4` (POV at the Prusa) | `printer3d` |
| V02 | X-ray peel: the hologram snaps onto the printer, then explodes towards camera | `printer_2_side_by_side.mp4` | `printer3d` |
| V03 | Over the shoulder: the model floats in the wearer's eyeline, plus the honest in-eye panel | `printer_1_core_one.mp4` | `printer3d` |
| V04 | "Wait, how do these even work?": the glasses explode out of the friend's hands | `share_scene_glasses_friend.mp4` | `glasses` |
| V05 | Colour spreads out from the lenses; the glasses model turns beside the head | `IMG_5557.MOV` | `glasses` |
| V06 | Grey world; colour comes back only where the hologram's lines have passed | `printer_2_side_by_side.mp4` | `printer3d` |
| V07 | The earbuds come out of his ear and show the anti-noise trick | `A001_11141516_C098 2.MOV` (grass, earbuds in) | `earbuds` |
| V08 | Notebook margins: handwritten notes and arrows around the hologram | `IMG_5561.MOV` (at the table, glasses on) | `glasses` or `printer3d` |
| V09 | Through the glasses: lens edge, the fixed display panel right of centre, a faint world ghost | `printer_1_core_one.mp4` | `printer3d` |
| V10 | Beat montage: printer, earbuds, glasses pop in on the beat as grey turns gold | three clips | all three |

## The feel
- **Personal and real.** Hackathon footage of our own team, phone-shot, a bit shaky. Don't over-polish it into an ad.
- **Funny, not dumb.** Dry, honest, self-aware. A wry caption or a well-timed beat (a sceptical face, a pause before the reveal) beats a joke. No memes, no emoji, no sound-effect gags.
- **Grey to colour.** The story: life goes muted and grey as you stop asking why, and gets brighter when you get curious again. Every version starts muted or cold and lets colour come back with the hologram. Palette: cyan `#4df0ff`, amber `#ffc247`, green `#6dff9c`, gold for warmth.
- **Honesty.** The real glasses show a fixed panel in one eye; the lines are not stuck to objects. A world-locked hologram is fine as "what it feels like", but small print such as *Visualised. On the glasses it's a panel in your view.* keeps judges from calling it fake. V03 and V09 show the real panel.

## Lessons from the Stoa film (FILMMAKING.md *(internal note, not in this repo)*)
- Open on a person and a want. The first 3 s must read muted on a phone.
- Transitions are moves (whip, push, zoom-through), not fades. Nothing static for more than 0.6 s; aim for at least 2.5 px/frame of motion.
- Give text time: a label needs about 0.5 s more than you think. Text stays inside the frame and its box at every frame.
- Write like a person: no "not X but Y", no lists of three, no slogan fragments. Never use the words seamless, unlock or delve.
- Hologram look: thin emissive edges, calm glow. Heavy bloom looks cheap.
- Labels say what is really there (Prusa Core One, its real parts), never made-up specs.
- Every cut wants a sound: list it in `cues`.

## How a version works
Each version is a folder `V<nn>/` with `index.html`, `config.json` and `NOTES.md`. Start by copying [_template/](_template/).
- **Page:** `window.renderFrame(t)` (may be async) draws the frame at time `t`. It must be a pure function of `t`: no clocks, no `Math.random` (use `K.hash`, `K.noise`, `K.mulberry`). Set `window.ready = true` when loaded.
- **Kit:** [lib/holo.js](lib/holo.js) loads any object from `app/shared/objects.json` onto its own canvas (`hologram(id, { scale: 2 })`, then `h.draw(beat, t, { yaw, pitch, explode })`, `h.labels(beat, t)`, `h.plans[beat]`). It's black where there's no object, so composite with `'screen'` or `'lighter'`. `/video/act1/lib/kit.js` (global `K`) has easing, noise, glow, grain, vignette, footage frames, `K.cover`, `K.placeholder`. Fonts: Archivo and Caveat (`K.loadFonts()`).
- **Footage:** `config.footage.<key> = { raw, in, speed, start, duration, vf, label, sub }`. `raw` is a file name in the footage folder (`$WONDERWHY_RAW`, default `~/Videos/wonderwhy/raw`). Build that folder from git with [lib/prepare_footage.sh](lib/prepare_footage.sh): it pulls `DemoVideos/Objects/` (origin/main) and `DemoVideos/` (origin/friend-next), joins split parts, and makes every clip SDR portrait at one size (2160x3840 on the PC, 1080x1920 for laptop proxies). `vf` crops a 16:9 window with relative numbers only (`crop=iw:iw*9/16:0:ih*0.30`). With no footage the page draws the labelled placeholder.
- **Placement:** keep every screen position of the object in `config.anchor` keyframes (`{ t, x, y, w, rot, ... }` in 1920x1080 px). The PC session, which can see the footage, tunes these numbers. Don't hard-code positions in the page.
- **Render:** `node lib/render.mjs V01 --at 0.5,3,6` writes stills to `out/snap/`. A full render (`node lib/render.mjs V01`) makes `out/V01.mp4` + `out/V01_sheet.png`; that runs on the big PC, not this laptop.

## The objects (read their specs in `app/shared/objects.json`, chapter `lens: "explore"`)
`printer3d` (Prusa-style, filament path, layer stack), `glasses` (frame, waveguide, display, band), `earbuds`, `sauna`, `spinbike`, `kettle`, `ball`, `bicycle`, `guitar`, `pendulum`, `phone`, `spoon`. Each has beats (camera moves, explode states, highlighted parts, labels).

## Render all ten (big PC)
```
bash lib/prepare_footage.sh                 # once: SDR 2160x3840 clips from git -> ~/Videos/wonderwhy/ar
export WONDERWHY_RAW=~/Videos/wonderwhy/ar
node lib/render.mjs V01 --at 1,3,5,7        # stills first: check the 3D object sits on the real thing, tune config.anchor
node lib/render.mjs V01                     # -> out/V01.mp4 + out/V01_sheet.png
```
Each `V<nn>/NOTES.md` says what to tune. Renders are ignored by git; copy the finished MP4s and sheets to `renders/` to commit them.
