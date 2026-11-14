# WonderWhy · final 30 minutes with the glasses

The loaner session has ended. See the [design handoff](Design_Handoff.md) and [loaner evidence](Loaner_Test.md) for the results and what to retest.

Use the installed Android APK and the already installed Physics Lens Web App. Keep the existing Meta AI pairing, Developer Mode, and permissions. For the first pass leave **Film on glasses off**. Android needs to stay connected for the glasses camera. The Web App runs the film and live Inspect. If the camera permission or photo consent has already been granted, there should be no settings change during the walkthrough.

| Time | Action | Pass / record |
| --- | --- | --- |
| 0–4 min | Wear the glasses, keep the Samsung unlocked and on USB, tap **Connect glasses** in Physics Lens. Open **Physics Lens** from the glasses app grid. Open **Kettle** directly. | The library film starts and changes beats. Record first motion and whether the Web App causes Android's session to pause. |
| 4–10 min | In the film, **swipe Right once**. Swipe left/right, repeat quickly, then pinch and drag horizontally and vertically. Pinch to separate the parts, then Back. | A horizontal drag turns the kettle and a vertical drag tilts it in live Inspect. Up/Down changes modes for zoom and pan. Note whether the continuous gesture works or only discrete swipes arrive. Record visible stutter and whether you return to the same beat. The first headset run reported 1,133 ms to film motion and 1,546 ms to Inspect. Later builds keep the timings in the screen’s data attributes. |
| 10–18 min | In the glasses Web App, go Home → **Take photo**. Aim at a smartphone if that is all you have. Repeat once. | Phone log should show `Web App asked for a photo`, JPEG timing, and recognized object. The glasses should start the same object's film. This validates one Web App with no settings change while in use. The kettle library item is the live rotation test target. |
| 18–24 min | If capture failed, keep the phone app connected and retry once from the Android **Explain what I see** button. For the native playback check, close the Web App and repeat with Film off. | Separate Web App relay failure from real camera failure. Native path is photo → recognition → first MP4 beat in the same session → card. Record `Explore film started` or the player error. If opening the Web App pauses the native session, try Film on once as a diagnostic. |
| 24–30 min | Check **Listen** in the glasses Web App, then Done/Home and one repeat capture. Save one short recording and the logs. | Record output device, recognizer time, video startup, and any blank screen. Prioritize evidence of the photo-to-film path over a second polished recording. |

The live viewer is a Three.js WebGL2 outline preview of the existing kettle geometry. Its roughly 139 KB compressed module is loaded on entry to Inspect and drawn locally. The simulator test verified actual WebGL2, rotation, tilt, explode, and fall back to the image views on graphics context loss. There is no motion video or interval between canned camera angles in that viewer. The narrated film still uses the pre-rendered clips. For comparison, append `?live3d=0` to the glasses Web App URL to load the existing turntable. The camera simulator runs the same app and can replay touch drags, arrows, pinch, and Back. Its real camera uses the device running the browser. Bluetooth transfer, Meta session ownership, and physical display and audio behavior need the loaner.

## Commands from the repo root

```bash
curl -fsS https://lens.167-71-139-39.sslip.io/health
adb devices -l
adb -d logcat -v time -s PhysicsLens:I
npm --prefix Meta_Challenge/app/glasses run build
node Meta_Challenge/app/glasses/scripts/live-kettle-smoke.mjs
node Meta_Challenge/app/render3d/export-kettle-live.mjs
```

The first three are enough for the hardware slot. The smoke script runs against a local mock bridge with Chrome and an installed glasses build. Run the build to check UI changes and the exporter only when the kettle geometry changes. Start the [hosted camera simulator](https://lens.167-71-139-39.sslip.io/emulator) using the team’s private bridge credential for recognition. Use Settings for encoder, server, response, preview, and motion timings. See [previous measured results and asset paths](Loaner_Test.md).
