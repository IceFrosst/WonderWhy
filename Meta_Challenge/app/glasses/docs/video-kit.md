# Physics Lens video kit

The video kit renders product-accurate footage and stills for the two-minute pitch edit.
Run it from `Meta_Challenge/app/glasses` with `npm run export:video`.
Use `npm run export:video -- --only kettle` for a faster one-object preview.
The full export can take tens of minutes because every video frame is rendered in the browser.
Captioned clips show the exact card layout, animated scene, changing caption, and lens name.
Clean clips contain only the animated scene for editor-supplied titles.
Stills are captioned product cards, one PNG for every lens step.
`contact-sheet.png` is a readable overview made from every 600x600 card still.
`index.md` lists the media durations and three suggested 15-second edit sequences.
The default is 1080x1080 at 30 fps with four seconds per step.
Flags are `--only`, `--size`, `--seconds`, `--no-clean`, and `--out`.
FFmpeg must be available on PATH; Vite and Playwright come from the project install.
The `video-kit/` output folder is ignored and its large generated files are not committed.
