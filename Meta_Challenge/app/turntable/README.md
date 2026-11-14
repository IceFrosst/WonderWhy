# Kettle turntable proof

Open `index.html` in a desktop browser. Select Rotate, Zoom or Pan, then drag the view or use the minus and plus buttons. Explode shows the same angle with the parts separated. Listen previews a short line with the browser’s speech voice. This isolated proof makes no network requests outside its own folder and does not capture a photo or connect to the band on a desktop.

`assembled.webp` and `exploded.webp` are 9 × 8 atlases of 240 px tiles. The tiles are ordered clockwise by the renderer's yaw, starting at −30° and advancing 5° per tile; the demo reports the relative angle. Moving the view does not seek or decode video. There is a single pitch per atlas; pan and zoom are image transforms.

To regenerate, install the `app/render3d` dependencies and run `node Meta_Challenge/app/render3d/turntable.mjs` from the repository root. Requires ffmpeg with libwebp and Google Chrome, or set `LENS_CHROMIUM` to a compatible Chromium executable. An optional positional argument sets the output directory.
