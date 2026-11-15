# WonderWhy loaner checks

Use the Samsung on USB, a paired Meta Ray-Ban Display and Neural Band, and a kettle and phone as target objects. The camera simulator runs the same glasses Web App as the deployed display. Start on the actual glasses so the simulator can be compared against a recorded baseline.

| Check | Do on the glasses | Record |
| --- | --- | --- |
| Native camera and cards | Open Physics Lens on Android, leave Film on glasses off, connect, aim at kettle, and short pinch. If the optional question is enabled under Developer, pinch once to skip it. | Band event, photo obtained/uploaded, object and confidence, first content visible. Check Done returns directly to idle. |
| Native camera and video together | On the new APK, let the kettle result play without opening the Web App. Watch for motion. When the clip ends, a still step should appear. Repeat and use Back or a pinch during the clip. | Phone log `Explore film started` or the player error, visible motion, time from result to motion, input during playback, and first card after stop. |
| Glasses Web App alone | Disconnect native app. Open Physics Lens from the glasses app grid and select Kettle. | Check motion, labels, caption visibility, Pause, Play again if stalled, Home, and Back. |
| Band controls | On the kettle film, swipe Right for Inspect. Try one short swipe in each direction, two quick same-direction swipes, a slow short drag, a longer drag, mode up/down, pinch to explode, then Up from Rotate and pinch Back to film. | Record action, visible angle, and whether the glasses give the Web App continuous pointer events. Use `?live3d=0` to compare the 72-angle fallback. |
| Home from Guitar | Open Guitar, advance a beat, swipe Right and pinch. Repeat in the card view. | Home should take focus without another step or lens change. Passed in the simulator after the loaner was returned. |
| Web App capture without switching modes | Leave Film on glasses off, connect from Android, open the glasses Web App, then select Take photo while aiming at a phone or kettle. | Record whether the native session stays STARTED, whether the phone logs `Web App asked for a photo`, and whether the film arrives. If Meta pauses the session, compare with Film mode on and with the 120-second replay handoff. |
| Voice and recovery | Try Listen in the Web App. For native cards select Read explanation on the phone with Bluetooth media routed to the glasses. Try a question after playback. Briefly take the glasses off, put them back on, then retry. | Note audio route, whether the prompt hears its own narration, first response after reconnect, and whether you can exit to Home. |
| Meta AI voice command | Refresh the glasses Web App and say “Hey Meta, show me how a smartphone works in Physics Lens.” Repeat with an electric kettle. | Confirm Meta AI opens the matching animation inside the app. For live 3D, enter the kettle’s Inspect view. Record the spoken response and whether motion starts. |
| In-app dictation | In the glasses Web App, select Ask, pinch the question field, select dictation, and say “How does a phone work?” Confirm the text and select Show visual. | Verify the phone animation starts without a photo. The Ask screen also displays WebMCP registration and whether its open command was received. |

For timing, run three times per route with the same object and model. Write down Wi-Fi, cold or warm load and the request ID if available. On the glasses, use a stopwatch or film the gesture and visible response together. Record **pinch → first feedback**, **photo start → phone has JPEG**, **JPEG → request sent** (includes any question wait), **server recognition**, **result → first still**, and **result → visible motion**. Record failed runs alongside successes. On the simulator, open Settings after a capture to see camera-frame encoding, server model time, capture-to-response, capture-to-preview and capture-to-motion. Those are browser measurements on the same monotonic clock for end-to-end timings. Bluetooth capture and headset decode, transport and panel latency need a physical measurement.

## Where the picture comes from

| What you see | Source |
| --- | --- |
| Native title, caption, buttons and progress | `app/android/app/src/main/java/com/junction2026/lens/Cards.kt`. Android builds these views and sends them via DAT. |
| Native card illustration | The bridge media manifest points to `explore/cN.png`; `tracks.json` supplies label positions. Copies of the stills are bundled for offline cards. |
| Native clip | The same manifest points to `explore/bN.mp4`. DAT receives its HTTPS URL as a full-screen player; the app brings the card back afterward. |
| Web App and camera simulator film | `app/glasses/src/ExploreView.tsx` plays the same `bN.mp4` and overlays captions and label tracks. The simulator frames the actual Web App and sends keyboard and pointer events to it. |
| Kettle Inspect | `InspectView.tsx` loads `liveKettle.js` and the exported `kettle-live.json` for WebGL2. Graphics context loss or `?live3d=0` selects the 72-angle `app/turntable/assembled.webp` and `exploded.webp` fallback. |
| Object, captions and available media | The bridge classifies the photo, maps the result to `app/shared/objects.json`, and includes the media manifest. The deployed bridge reads these from its container. Verify the hosted manifest and clip before assuming a local asset update is live. |

The verified hardware evidence includes a Neural Band pinch arriving as a short `Drag DOWN → UP`, plus some gestures also emitting `Select`, and separate `Nav` events. Actual glasses camera → bridge → Android card rendering succeeded. The wearer reported 1,133 ms to kettle film motion and 1,546 ms to Inspect. Continuous Web App drag, native MP4 playback and audio routing still need live acceptance. The camera simulator uses the same live Three.js renderer and the same fallback atlases.

## Evidence captured on November 14

- Native pinch emitted a short `Drag DOWN → UP` followed by `Select`. The sampled pinches lasted 110–311 ms with reported movement of at most 0.01. The Skip action fired once on a 212 ms pinch. Right swipes arrived as discrete `Nav RIGHT` events. The Web App uses repeat timing for those and pointer distance when it receives continuous drag events.
- A real glasses photo ran through Gemini and Android acknowledged the Smartphone card. On another run the phone obtained a JPEG but reported a bridge connection error before recognition. In a later camera-only attempt the phone obtained a JPEG and the session stopped before the complete flow was observed.
- In a later native capture Android received a 91 KB JPEG in 9,147 ms. The SDK reported a Bluetooth disconnect 3,530 ms after the JPEG arrived, before submission began. The hosted Web App remained online. The updated Android build defaults to immediate submission and exposes the optional pre-upload question under Developer.
- After installing the updated APK, Android received a JPEG in 5,594 ms and began submission 9 ms later. Gemini identified the phone at 99% confidence and the native display acknowledged rendering. A subsequent spoken follow-up returned HTTP 502 from the model provider on the first try. The wearer reported the retry worked. Another capture reached submission in 10 ms after JPEG receipt, followed by a Bluetooth drop.
- In Chromium, a simulated WebMCP host called the voice tool and played both films without photo detection. On the headset, the wearer heard a normal Meta AI response and reported no visual opened. After the Ask form was added, the wearer reported that it opened the new-to-them phone visual. Browser tests verified the route from submitted text to motion with WebMCP absent, and the simulated tool route with WebMCP present. The exact composer input steps and direct wake-word routing still need a repeatable live check.
- Simulator fixture on this laptop recorded 32 ms to get and encode the frame, 56 ms to the local server response, 104 ms to preview, and 134 ms to motion. Recognition was forced to Kettle in this test. The separate hosted sample run recognized Kettle with Gemini and took about 40 s for recognition. Real Smartphone runs took roughly 7–34 s for recognition.
- The hosted kettle still and film use the original line-art design. The rotation frames are denser renders of that same model. The photoreal work from the interrupted Claude session has no finished kettle clips in the files checked.

## Final playback and package measurements

| Measure | Verified result |
| --- | --- |
| Samsung debug APK | 52.24 MiB, including about 11.68 MiB of offline images and metadata and 19.92 MiB of native libraries for four CPU architectures. The APK contains no MP4s. |
| Hosted Web App cold boot | Chromium measured about 249 KB across the two CSS/JS requests, plus about 399 bytes for the HTML response. Rotation images load only in Inspect. |
| Kettle Inspect | 173,116-byte assembled atlas and 181,298-byte exploded atlas. Each holds 72 angles. |
| Hosted kettle film | 1,508,039 bytes total for six 6.8-second H.264 clips. Each clip is 600 × 600 at 30 fps and decodes to 204 frames. The first clip is 263,106 bytes. A range request returned HTTP 206 with 1,024 bytes. |
| Hosted playback in Chromium | Three fresh contexts reached first motion in 413–641 ms from library selection and reached the second beat in 7.22–7.43 s. Each sampled 52 frames of the first clip with zero drops. Measurements were made from the laptop. |
| Stall recovery | Forced a mid-clip stall in Chromium. The still and Play again appeared, replay resumed motion, and the next beat played. |
| Final simulator fixture | Measured 24 ms to encode, 42 ms to response, 88 ms to preview and 119 ms to motion. This run forced Kettle on the local bridge. |

When Film on glasses is enabled, Android opens a camera-only session and the Web App draws the result. When it is disabled, a native capture can play the first hosted Explore clip and return to the still cards. The updated APK also accepts a Web App capture request with Film off if the device session remains active and routes that result back to the Web App. The last phone-as-target test verified a JPEG in 7.36 seconds and a Gemini Smartphone result at 98% while camera-only mode was enabled. Native moving playback must be checked separately with Film off.
