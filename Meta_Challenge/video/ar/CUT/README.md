# CUT: rough-cut renderer (animatic with real clip audio)
`edl.json` is the single source of truth: `meta { title, fps, debug, sheet }` + `shots[]`, played back to back, hard cuts. `build.mjs` turns it into `config.json` and `STORYBOARD.md`.
Shot fields: `id, label, raw, in, dur, speed=1, frame` (`fit` portrait whole over a blurred copy, default | `fill` 16:9 cover crop | `asset` landscape video, `raw` relative to Meta_Challenge/ | `card` black title card with `card {text, sub}`), `focusY=0.5, zoom=1, push=0` (slow zoom), `cut: "whip"`, `gain`, `mute`.
`grade: [[t, sat, warm?]]` shot-local keyframes (sat 0 grey, 1 colour, warm 0..1 gold tint).
`text: [{ t, dur, text, style: child|grey|big|label|caption|tag, pos: top|center|bottom|lower-left|lower-right|upper-left|...}]`.
`boxes: [{ t, dur, x, y, w, h, label, sub }]` dashed placeholder for a graphic to come (1920x1080 px).
`meta.debug: true` burns timecode + shot label top-left (turn off for the final).
Commands (from video/ar):
```
node CUT/build.mjs
WONDERWHY_RAW=<proxies> node lib/render.mjs CUT --at 1,3.5   # stills -> out/snap/CUT_*.jpg
WONDERWHY_RAW=<proxies> node lib/render.mjs CUT               # -> out/CUT.mp4 (silent)
WONDERWHY_RAW=<proxies> node lib/audio.mjs CUT                # real clip audio (from $WONDERWHY_RAW/.src) -> out/CUT_audio.mp4
```
Optional `meta.music: { path, gain }` (path relative to Meta_Challenge/) goes under the clip audio. Audio is loudnorm'd to about -16 LUFS.
