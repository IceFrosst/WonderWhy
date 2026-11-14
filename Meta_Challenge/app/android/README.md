# Physics Lens: Android app (Meta DAT 1.0.1)

Phone app that drives Meta Ray-Ban Display glasses (or the SDK's Mock Device Kit). Pinch → one photo → bridge `/detect` → result card on the glasses.

## What it does
| Step | Behaviour |
|---|---|
| Connect | Real: register with Meta AI, then device session. Mock: enable Mock Device Kit, pair a fake Ray-Ban Display |
| Idle | Card "Look at something and pinch" |
| Trigger | Pinch (`Select`), capture button, phone button "Explain what I see", or "Again" on the glasses |
| Capture | Camera starts, ONE photo, camera released in `finally` (never stored on disk) |
| Detect | JPEG (≤896 px, q80) → `POST {bridge}/detect` with `lang` and `waitSketch: true`; "Looking..." card meanwhile |
| Result | v1 answer: overview card, then step cards with the scene still. Real stills from `/media/` are whole 600x600 frames with their own English title and caption, so the app cuts out the drawing (between the head and the caption block) and shows it in a black band whose height follows the caption length (228 px for one line down to 96 px), so title, still, caption, lens line and two buttons fit the 600x600 card. Demo fixture stills keep the 3:1 band. Pinch = next, D-pad left/right = lens, up/down = step, Back = one step back, then overview, then idle. Old answer: label, concept, "Again" / "Done". `lowConfidence` → "Not sure"; `unknown` or confidence <0.5 → "Not sure what this is" |
| Token | Optional "Bridge token" field (masked, saved in app prefs, no default). Sent as `X-Lens-Token` on `/detect`; blank = no header. A 401 shows "Wrong bridge token. Set it in the app." |
| Offline | Bridge unreachable (no connection, or a proxy's 502-504 with no bridge body; not a 401, not a bridge error with a body): "Offline" card with the 6 bundled library objects (`shared/objects.json`). Left/right picks (counter "2/6"), pinch opens the same explainer from saved data, marked "Offline: showing a saved card". "Try again" is on the card; Back from a saved overview returns to the picker |
| Language | Phone screen picker "Language": Phone language (default) or English, Suomi, Svenska, Deutsch, Español, Français (`Lang.SUPPORTED`), saved in prefs. The tag goes as `lang` on `/detect` and `/ask`, so the bridge sends the library text (label, summary, lenses, steps) in that language. Fixed card strings (idle, looking, buttons, step, offline, token, not sure, sketch tag) are English and Finnish only; other languages fall back to English for them |
| Library | On connect and on a language change: `GET /objects?lang=<tag>`. Kept in memory and in an app-private file `files/library/objects_<tag>.json` (library text, not user data), so a later offline start still has the translated saved cards. Order: bridge answer in that language, saved copy, bridge answer in English, bundled English `objects.json` |
| Follow-up question | Phone field "Ask about it" + Ask, or a spoken question on the glasses (below), after a result: `POST /ask {question, aboutObjectId, lang}`. "Looking...", then an answer card: object (4 words), "Q: question" (12 words), answer (24 words); the primary button (and pinch) opens the `lensHint` lens and step, e.g. "Projectile motion 1/3"; without a hint, "Show steps". Back = the object's overview. Errors: 401 token card, `detect_timeout` "Took too long", `bad_request` "Can't ask that", other "Couldn't answer"; all with Try again (asks again) and Done. A bridge with no `/ask` (404) or no bridge: the phone answers by itself with PROTOCOL's mock rule (word overlap with the captions), tagged "Answer from saved cards". Demo data and saved offline cards always answer on the phone. Unknown objects and sketches: "Can't ask yet" card (PROTOCOL refuses them) |
| Voice question | `DeviceSession.addSpeech()` (mwdat-speech 1.0.1). The microphone listens only while a library result or an answer is on screen (stopped on idle, during capture and asking). A final `Speech.transcriptions` result goes through the same `/ask` path |
| Sketch | Unknown object with `show.sketch` (bridge `SKETCH_PROVIDER` on): the sketch's label and answer on the overview, its chapters as lenses, text only (no drawings yet), and the text tag "Sketch · unverified" on the overview and on every step card. `sketchError` or no sketch: the "Not sure what this is" card as before |
| Device states | Own card per DESIGN.md states table: taken off / folded (glasses blank, phone card), battery low and hot (glasses card that leaves after 6 s, phone card), Bluetooth drop (phone card, session recreated when the link is back), another app took the glasses (phone card, Connect takes them back), camera denied (decision card on glasses and phone, "Try again") |
| Errors | Cards with "Try again" for bridge errors, camera errors, timeouts |

## Build
```
export JAVA_HOME=$(ls -d ~/.local/opt/zulu17*/Contents/Home) ANDROID_HOME=~/Android/Sdk PATH=$JAVA_HOME/bin:$PATH
echo "sdk.dir=$ANDROID_HOME" > local.properties   # not committed
./gradlew --no-daemon assembleDebug
```
APK: `app/build/outputs/apk/debug/app-debug.apk` (~41 MB, SDK native libs).

## Tests
`./gradlew --no-daemon -q testDebugUnitTest` (94 JVM tests: token header and error mapping, `/detect` parser, explainer state, offline library and picker, device-state mapping, word caps, still band; since 14 Nov also the request bodies (`lang`, `waitSketch`, `forceObjectId`, `/ask`), the picker's language rule, `/ask` response parsing with `lensHint`, the phone's own answer, answer word caps, sketch parsing with the bridge's recorded stapler sketch, the library refresh choice, and the still crop run on every real still in `bridge/media/`).
Two older tests were updated on 14 Nov because `shared/objects.json` now has 5 ball lenses (was 2).

## Install and run (mock mode, no glasses)
| Setup | Commands / bridge URL |
|---|---|
| USB phone | `adb install -r app/build/outputs/apk/debug/app-debug.apk`, `adb reverse tcp:8787 tcp:8787`, URL `http://127.0.0.1:8787` |
| Emulator | same install, `adb shell pm grant com.junction2026.lens android.permission.CAMERA` (and `BLUETOOTH_CONNECT`), URL `http://10.0.2.2:8787` (the default URL is the hosted bridge) |
| Bridge | `cd ../bridge && DETECT_PROVIDER=mock npm start` (token test: `LENS_TOKEN=test PORT=8788 npm start`; sketch test: `SKETCH_PROVIDER=fixture DETECT_PROVIDER=mock PORT=8789 npm start`) |

1. Open the app, allow Bluetooth and Camera (mock uses the phone's back camera as the glasses camera).
2. Keep "Mock glasses" ON, tap Connect. The 600x600 glasses display appears in the app.
3. Tap Pinch (or "Explain what I see").

### Phone screen
| Control | What it does |
|---|---|
| Mock glasses (no hardware) | Mock Device Kit instead of real glasses (restart the app after switching it off) |
| Demo data (no bridge) | Saved in prefs. No camera, no network: each trigger answers with the next fixture (ball, guitar, low confidence) and stills from `assets/fixture/` |
| Language | Picker: "Phone: <language>" (default) or one of the 6 languages. Saved; does not change the system locale |
| Ask about it + Ask | Follow-up question about the object on screen (same path as a spoken one) |
| Say: "why does it curve?" (mock) | Mock Device Kit `services.speech.simulateTranscription(text, isFinal = true, 0.95)`: the kit only delivers it while the app is listening (a result on screen), otherwise the log says so |
| Glasses input (mock) | Pinch (through the kit's input API), Back, Left, Up, Down, Right (call the controller's `onBack` / `onNav` directly) |
| Device states (mock) | Take off / Put on (`doff/don`), Fold / Unfold (`fold/unfold`), Battery low / full (`setBatteryLevel`), Overheat / Cool down (`setThermalLevel SEVERE`), Bluetooth drop / back (`powerOff/powerOn`), Deny / Allow camera (`permissions.set/setRequestResult`). All real Mock Device Kit 1.0.1 calls |
| Simulate: other app takes over | No kit API exists for this: feeds the session state the SDK reports (PAUSED, then STARTED) into the same handler the real state flow uses, and clears the display in place of the other app |
| State card | Below the buttons when a device state is active: title, what to do, one action (Connect or Try again) |
| Bridge | URL and token (set once), "Force object id (dev test, not saved)": sent as PROTOCOL `forceObjectId` so a bridge without a model key answers with that library object (how the stills and `/ask` were tested). Then status lines (now with Speech), last photo sent, log |

## Real glasses
1. Meta AI app: enable Developer Mode, glasses paired and a Display model.
2. Switch "Mock glasses" OFF and **restart the app** (Wearables is initialised at launch only in real mode).
3. Tap Connect: Meta AI opens for registration, returns via `physicslens://`. Allow camera access (and microphone, for spoken questions) when asked.
4. Bridge must be reachable from the phone (same Wi-Fi, laptop IP, plain http is allowed).

## Not done yet
- The bridge has no `POST /ask` yet (404, 14 Nov): with it the app falls back to its own word-overlap answer. The bridge answer path, `lensHint` and the error cards were run against a test stub that follows PROTOCOL, not against the real bridge.
- Sketches are text only: the `spec` drawings (`flow`, `number`, `curve`) are not drawn on the phone app's cards.
- The `/detect` `question` field is still always null (questions go to `/ask`).
- Fixed card strings in Swedish, German, Spanish and French (they fall back to English); the hint lines ("Pinch: 3 steps", "Lens 1/5 ... Left/right: lens"), the offline card text and the object tagline stay English in every language. Stills keep their English labels (the bridge's media is English only).
- The still band height comes from a caption-length estimate measured on the mock display; a caption that wraps more than estimated could still push the card past 600 px.
- Scene clips / video on the glasses display (stills only).
- Everything on real glasses is untested: registration deep-link handling, camera and microphone permission flows, Inputs, speech (real ASR, its latency and locale; only the kit's injected transcription was run), HEIC photo path, and how real glasses report fold, heat, link loss and a session taken by another app (the state handling is built from the SDK's types and the mock's behaviour).
- Offline cards have no stills (text steps only); the language table has English and Finnish only.
- Mock → real without an app restart; app icon.

## Emulator run (14 Nov, emulator, Mock Device Kit)
Pixel 8 profile emulator (Android 15, arm64, headless, emulated back camera), Mock Device Kit, local bridge in mock mode. Driven with `uiautomator dump` + `input tap`; screenshots in `docs/screens/`.

| Path | Result | Screens |
|---|---|---|
| Connect in mock mode, idle card | Works | `02` |
| Demo data: ball overview, steps with stills, D-pad right to lens 2, Back to overview, Back to idle | Works | `03`-`08` |
| Demo data: guitar (one lens, still), low confidence "Not sure" | Works | `09`-`11` |
| Bridge `http://10.0.2.2:8787`: pinch, "Looking...", emulated-camera photo (6 KB), mock provider answer "Not sure what this is" | Works | `12`-`14` |
| Bridge stopped / wrong URL: Offline picker, 2/6, open saved card, step, Back to picker, Try again (still offline, then bridge back) | Works | `15`-`22` |
| Token bridge (`LENS_TOKEN=test`, port 8788): no token → token card, token `test` → answer | Works | `23`-`25` |
| Take off / put on, fold / unfold (session ends, recreated after unfold), battery low (auto-dismiss), hot, Bluetooth drop / back (session recreated), other app (simulated), camera denied / allowed | Works | `30`-`44` |
| Finnish phone language: "Valmis" on the step card | Works | `45` |

### 14 Nov, second run (emulator, Mock Device Kit)
Same emulator. Bridges: `8787` (today's code, `provider: mock`, auth off, sketch off), `8789` (`SKETCH_PROVIDER=fixture DETECT_PROVIDER=mock`), and a test stub on `8790` (scratch file, not in git) that answers `POST /ask` the way PROTOCOL describes and passes everything else to 8787.

| Path | Result | Screens |
|---|---|---|
| Phone controls: Language picker, Ask field, Say button | Works | `50` |
| Picker to Suomi: idle card in Finnish, library refreshed (`/objects?lang=fi`, saved to the app's files) | Works | `51`, `52` |
| Forced `ball` on 8787 with `lang: fi`: Finnish label, summary, lens titles, captions and buttons (`show.lang = fi`) | Works | `53` |
| Real stills from `/media/ball/`: drawing cut from the 600x600 frame, fits with 3- and 4-line captions (motion, bounce step 2, the number) | Works after a fix (below) | `54`-`56` |
| Ask on 8787 ("why does it curve?"): bridge answers 404, phone answer from the captions, primary "Projectile motion 1/3", pinch opens it with its still | Works (fallback) | `57`, `58` |
| Say button on 8787: kit transcription → "Heard" → same `/ask` path | Works (fallback) | `59` |
| Say button on the stub: "Looking...", bridge answer, `lensHint` ball.motion 1 | Works (stub) | `60`, `61` |
| Ask field on the stub: "why is each bounce lower" → `lensHint` ball.compare 2, pinch opens Bounce step 2/3 | Works (stub) | `62`, `63` |
| `/ask` errors from the stub: `detect_timeout`, `detect_failed`, 401, `bad_request` | Cards shown (stub) | `64`-`67` |
| Sketch on 8789 (real emulator photo, no force): overview "Desk stapler" + "Sketch · unverified", steps of both lenses tagged | Works | `69`-`71` |
| Ask about the sketch: "Can't ask yet" card; Say while not listening: log only | Works | `72` |
| Offline start (bridge unreachable, Suomi): saved Finnish library from the app's file, offline picker "Kitaran kieli" | Works | `73` |
| Old path again: connect, demo data, pinch, steps with fixture still, Back to overview, Back to idle | Works | `74`-`78` |

On the wire (logged by the stub): `/detect` carried `"lang":"en","waitSketch":true` (and `forceObjectId` when set); `/ask` carried `{reqId, question, aboutObjectId, lang}`.
Fixed on the emulator: a saved language crashed the app at start (the language was applied before the log view existed); a 2:1 still band with a 4-line Finnish caption pushed the title off the 600x600 card, so the band height now follows the caption.

Found on the emulator (first run): after the kit's `powerOff()` the old session still says STARTED but cannot draw, so the app ends it and recreates it when the link is back. After that power cycle the kit's simulated pinch (`input.select`) did not reach the new session in 4 of 5 tries (no SDK log); the phone's Explain, D-pad and Back buttons and the display buttons still work, and Disconnect + Connect restores the pinch. The emulated camera gives very small photos (about 6 KB).

## Testing notes (14 Nov, Pixel 8, mock mode)
- The full loop runs on a Pixel 8 (Android 17) in mock mode: connect, pinch, photo, bridge, result card.
- There is no live camera preview by design (the glasses have no viewfinder and the camera is only on when asked). The phone screen shows **"Last photo sent"**: the exact picture that went to the bridge. It is not saved.
- In mock mode the phone's back camera stands in for the glasses camera; sideways frames are turned upright.
- Bridge URL: `http://127.0.0.1:8787` with `adb reverse tcp:8787 tcp:8787` (USB), or the hosted bridge `https://lens.167-71-139-39.sslip.io` (no cable needed).
- Recognition without an API key: start the bridge with `DETECT_PROVIDER=pi` (dev only, about 7 s per photo).
