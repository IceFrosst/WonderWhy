# Act 1 opening: three variants (6.0 s each, 1920x1080, 30 fps, silent)

Each variant covers Act 1 (the child's two questions) and the cut into Act 2's first grey beat ("You used to ask why.").
Every frame is a pure function of `t`: each page exposes `window.renderFrame(t)`, with no clocks and no random numbers.

| | Variant | Folder | Output | Contact sheet |
|---|---|---|---|---|
| A | Drawn memory: glowing line art on black, drawn live, handwriting | `A/` | `out/A.mp4` | `out/A_sheet.png` |
| B | Kinetic questions: big type on a 100 BPM grid, gold ground, hard flip to grey | `B/` | `out/B.mp4` | `out/B_sheet.png` |
| C | Real grass + type: real footage, typed questions, code-drawn seeds and light | `C/` | `out/C.mp4` | `out/C_sheet.png` |

## Render

```
./A/render.sh            # or B, C: full render -> out/<V>.mp4 + out/<V>_sheet.png + out/<V>.render.json
./B/render.sh --at 0,1.2,4.2   # stills only -> out/snap/
./C/prepare_footage.sh   # C only: cut the two real clips from the raw phone footage into C/footage/
```

`lib/render.mjs` serves this folder, opens `<V>/index.html` in `/usr/bin/chromium` through playwright-core
(resolved from `../../app/glasses/node_modules`, or `npm install playwright-core` in `video/`), steps
`renderFrame(k / 30)`, and pipes the frames into ffmpeg (H.264 High, CRF 17, yuv420p, bt709, faststart).

## Files

- `<V>/index.html`: the page. `<V>/config.json`: timings, text, colours, footage slots, audio cue list, contact-sheet times.
- `lib/kit.js`: shared helpers (easing, seeded hash and noise, glow, grain, sub-frame motion blur, footage slots,
  placeholder frame, dandelion seed, the grey plate and title).
- `fonts/`: Archivo (variable, from the Kinetic Film skill) and Caveat, both OFL, licences alongside.
- `out/`, `*/frames/`, `C/footage/`: generated or real media, ignored by git (`.gitignore`).

## Footage slots

A slot is an entry in `config.footage`: `{ path, in, speed, start, duration, label, sub }`. Before rendering,
`render.mjs` extracts each slot whose file exists to `<V>/frames/<key>/%05d.jpg` at 30 fps (cover-fit to 1920x1080)
and the page plays those frames. If the file is missing the page draws a dark frame with the slot's label
(for example "FOOTAGE: earbuds going in"), so the film still renders.

- A and B: one slot, `earbuds_in` (grey beat). No file yet, so they show the placeholder. To use the clip C has:
  set `"path": "../C/footage/earbuds_in_grass.mp4"`.
- C: `b1_grass` and `earbuds_in` both play real clips cut by `C/prepare_footage.sh` from
  `~/Videos/wonderwhy/raw/mrnetwork/` (read-only): a 16:9 window of the 4K portrait frame, scaled to 1080p.

## Audio

Rendered silent. Each `config.json` has `cues`: `{ t, sound, line }` for the child's voice, music and SFX.
