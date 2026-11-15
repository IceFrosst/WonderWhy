# WonderWhy design handoff

November 14, 2026 · Loaner session complete. Use this page for the current baseline, [Loaner_Test.md](team-notes/Loaner_Test.md) for timings and retests, and [render3d/README.md](app/render3d/README.md) for the asset pipeline. The product is **WonderWhy**. Its first working name was **Physics Lens**, and the Android app label, the glasses Web App's installed name, the "Hey Meta" tool name and the install deep link in the loaner builds still say Physics Lens.

## What the loaner established

| Flow | Result |
| --- | --- |
| Band pinch → real glasses photo → Android → Gemini → display | Verified. In the successful phone run, Android received the JPEG in 5,594 ms and began upload 9 ms later. The bridge recognized Smartphone at 99% in 5,083 ms (the model setting of that day) and Android acknowledged the display. Today the live bridge uses `gemini-3.6-flash` (since 15 Nov about 08:25; before that `gemini-3.5-flash`, deprecated and routed to 3.6-flash by Google), which measured about 1.6 to 2.2 s detect time on the server for the sauna and printer photos (team benchmark; 1.4 to 2.1 s on 3.5-flash); end to end depends on the network. Other attempts lost Bluetooth immediately after JPEG delivery, including after the upload change. Android reconnected in one observed retry. |
| Kettle film and live Inspect | The wearer confirmed that live Inspect displayed and responded. They reported **1,133 ms to film motion** and **1,546 ms to Inspect** in one run. Continuous drag, rendered frame rate and long-session performance still need device measurements. |
| Spoken follow-up in Android | The glasses microphone transcribed speech. One bridge follow-up returned HTTP 502 and the wearer reported the retry worked. Narration quality and audio routing still need a listening test on the glasses. |
| Ask in the glasses Web App | The wearer reported that Ask opened the phone visual. This uses the existing six-beat smartphone animation. The direct “Hey Meta” trial produced a spoken answer without opening a visual. WebMCP registration and the callable handler were verified in Chromium. |
| Camera relay while the Web App is in front | Available in the code. Bluetooth and session interruptions prevented a confirmed end-to-end run with the same settings across both experiences. Native MP4 playback also needs a visible-motion check. |
| Guitar → Home | The wearer reported that a Right swipe kept changing the explanation instead of reaching the controls. The Web App now focuses **Home** with Right in guitar film and card views. Pinch selects it. Confirm on the next loaner. |

## Review the design without a loaner

- Open the [hosted glasses app](https://lens.167-71-139-39.sslip.io/) at 600 × 600 for library playback, or the [camera simulator](https://lens.167-71-139-39.sslip.io/emulator) to use the same app with mouse, keyboard, and the browser camera. The live bridge is open for judging with a per-IP rate limit (no credential needed) and will be re-locked after judging. Library art can be reviewed directly by selecting the object, with no model call.
- **Guitar and phone films** use the stage pinch to step. Right focuses **Home** and Down focuses the film controls. In cards, Right focuses **Home** and pinch selects it. Left from Home returns focus to the step button. Use **Listen** in film controls to check the timing of a caption against the visuals.
- **Kettle** uses Right from the film to enter **Inspect**. Drag horizontally to rotate and vertically to tilt. Pinch in Rotate mode to explode or reassemble. The other modes are Zoom and Pan. From Rotate, press Up then pinch **Back to film**. Repeat with `?live3d=0` on the direct Web App URL to compare the two pre-rendered 72-angle atlases. The simulator accepts keyboard arrows and Enter as well as pointer input.
- **Ask** opens the existing phone and kettle visuals from a question. In a desktop browser, type the question and select **Show visual**. On the glasses, pinch the text field to use their dictation composer. The status line shows whether the wake-word tool registered or received a command.

For the first design pass, review **Kettle** for scale, framing, silhouettes and how easily parts separate, **Phone** for the layer order, **Guitar** for the wave motion and the Home route. Check the first still and first motion at full display size, action focus, labels when parts overlap, caption density, narration at the point where the relevant part moves, and whether the wearer can return to the same beat after Inspect. Record object, beat, screenshot, and the change to make. Ask a second reviewer to run the same sequence using only arrows and Enter.

The simulator measures browser encoder, response, preview and first motion. One forced-kettle run measured **24 / 42 / 88 / 119 ms** respectively. Those timings describe that fixture run. Compare live camera transfer, display and audio to the loaner measurements separately.

## Edit and preview

| Change | Source and output |
| --- | --- |
| Shapes, positions, colours, explode offsets, camera angles and motion | `app/render3d/specs/*_explore.py` contains the authored object specs. Run the edited object’s generator to update its Explore chapter in `app/shared/objects.json`, then render. The kettle generator takes the path to `objects.json` as an argument. See the [model schema](app/shared/MODEL3D.md). |
| Film and stills on the glasses | `app/render3d/render.mjs` writes `app/bridge/media/<id>/explore/bN.mp4`, clean `cN.png`, annotated `sN.png` and `tracks.json`. The object’s `manifest.json` points both apps at those files. The Web App uses the clean view and overlays the labels and captions. Android also bundles offline stills at build time. |
| Kettle live geometry | Run `node Meta_Challenge/app/render3d/export-kettle-live.mjs` from the repository root after changing the kettle spec. It generates `app/glasses/src/kettle-live.json` from the same model. `InspectView.tsx` and `liveKettle.js` load and draw it in a lazy Three.js module. Regenerate both atlases with `app/render3d/turntable.mjs` after changing the kettle geometry. |
| Film UI, text and audio controls | `app/glasses/src/ExploreView.tsx` plays the film and positions labels from tracks. `Explainer.tsx` handles film/card navigation and `styles.css` controls type and framing. The **Listen** control uses browser speech synthesis. Review the delivery and route before recording a final voice track. |
| Camera, consent and recognition | Android `MainActivity.kt` and `GlassesController.kt` own the DAT session, input and capture. The hosted bridge handles recognition and serves assets. Camera experiments can use the existing path while the design team works against the linked library in parallel. |

Run these from the repository root. Install dependencies with `npm ci` in each Node package as needed. The renderer uses FFmpeg and the simulator smoke test uses Chrome.

```bash
python3 Meta_Challenge/app/render3d/specs/phone_explore.py
npm --prefix Meta_Challenge/app/render3d run render -- --only phone --stills-only
npm --prefix Meta_Challenge/app/render3d run render -- --only phone
npm --prefix Meta_Challenge/app/glasses run build
node Meta_Challenge/app/glasses/scripts/live-kettle-smoke.mjs
```

The first two commands pack the phone spec and rewrite its stills for visual iteration. Run the full object render before reviewing changes to motion or label timing. For a fresh Android build run `./gradlew assembleDebug testDebugUnitTest` from `app/android` with JDK 17 and the Android SDK, then use the APK at `app/android/app/build/outputs/apk/debug/app-debug.apk`. For another device slot, use the [loaner checklist](team-notes/Loaner_Test.md). It includes pairing context, camera modes, voice, and measured timing stages. The hosted bridge runs Gemini. It is open for judging and will be re-locked afterwards; when it is locked, the token stays in the team’s private channel.

## Baseline to compare against

- Android debug APK built for the Samsung test and passed **172 JVM unit tests**. The bridge passed **93 tests** at handoff. The expanded browser state suite had failures in the home/demo scripts and was stopped. The focused smoke test passed the camera fixture, kettle Inspect, fallback on WebGL context loss, and Home from Guitar and Phone films and Guitar cards.
- The deployed kettle film contains six 6.8-second 600 × 600 clips at 30 fps, **1.51 MB** in total. The live Inspect module is **139 KB gzip** and loads on entry. The two 72-angle fallback sheets are about **354 KB** combined.
- Phone’s six 3D animations were finished and re-encoded at higher video quality on November 14. The six hosted MP4s matched the local renders. Ask opens this film at beat one. Interactive live 3D is implemented in kettle Inspect. No new art was produced in the loaner wrap-up.
