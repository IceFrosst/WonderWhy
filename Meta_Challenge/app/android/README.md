# Physics Lens: Android app (Meta DAT 1.0.1)

Phone app that drives Meta Ray-Ban Display glasses (or the SDK's Mock Device Kit). Pinch → one photo → bridge `/detect` → result card on the glasses.

## What it does
| Step | Behaviour |
|---|---|
| Connect | Real: register with Meta AI, then device session. Mock: enable Mock Device Kit, pair a fake Ray-Ban Display |
| Idle | Card "Look at something and pinch" |
| Trigger | Pinch (`Select`), capture button, phone button "Explain what I see", or "Again" on the glasses |
| Capture | Camera starts, ONE photo, camera released in `finally` (never stored on disk) |
| Detect | JPEG (≤896 px, q80) → `POST {bridge}/detect`; "Looking..." card meanwhile |
| Result | v1 answer: overview card, then step cards with the scene still (in a 3:1 band so the card fits 600x600). Pinch = next, D-pad left/right = lens, up/down = step, Back = one step back, then overview, then idle. Old answer: label, concept, "Again" / "Done". `lowConfidence` → "Not sure"; `unknown` or confidence <0.5 → "Not sure what this is" |
| Token | Optional "Bridge token" field (masked, saved in app prefs, no default). Sent as `X-Lens-Token` on `/detect`; blank = no header. A 401 shows "Wrong bridge token. Set it in the app." |
| Offline | Bridge unreachable (no connection, or a proxy's 502-504 with no bridge body; not a 401, not a bridge error with a body): "Offline" card with the 6 bundled library objects (`shared/objects.json`). Left/right picks (counter "2/6"), pinch opens the same explainer from saved data, marked "Offline: showing a saved card". "Try again" is on the card; Back from a saved overview returns to the picker |
| Language | Fixed card strings (idle, looking, again, done, try again, offline, token, not sure) follow the phone language via `Lang` (English and Finnish today) |
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
`./gradlew --no-daemon -q testDebugUnitTest` (62 JVM tests: token header and error mapping, `/detect` parser, explainer state, offline library and picker, device-state mapping, word caps, still band).

## Install and run (mock mode, no glasses)
| Setup | Commands / bridge URL |
|---|---|
| USB phone | `adb install -r app/build/outputs/apk/debug/app-debug.apk`, `adb reverse tcp:8787 tcp:8787`, URL `http://127.0.0.1:8787` |
| Emulator | same install, `adb shell pm grant com.junction2026.lens android.permission.CAMERA` (and `BLUETOOTH_CONNECT`), URL `http://10.0.2.2:8787` (the default URL is the hosted bridge) |
| Bridge | `cd ../bridge && DETECT_PROVIDER=mock npm start` (token test: `LENS_TOKEN=test PORT=8788 npm start`) |

1. Open the app, allow Bluetooth and Camera (mock uses the phone's back camera as the glasses camera).
2. Keep "Mock glasses" ON, tap Connect. The 600x600 glasses display appears in the app.
3. Tap Pinch (or "Explain what I see").

### Phone screen
| Control | What it does |
|---|---|
| Mock glasses (no hardware) | Mock Device Kit instead of real glasses (restart the app after switching it off) |
| Demo data (no bridge) | Saved in prefs. No camera, no network: each trigger answers with the next fixture (ball, guitar, low confidence) and stills from `assets/fixture/` |
| Glasses input (mock) | Pinch (through the kit's input API), Back, Left, Up, Down, Right (call the controller's `onBack` / `onNav` directly) |
| Device states (mock) | Take off / Put on (`doff/don`), Fold / Unfold (`fold/unfold`), Battery low / full (`setBatteryLevel`), Overheat / Cool down (`setThermalLevel SEVERE`), Bluetooth drop / back (`powerOff/powerOn`), Deny / Allow camera (`permissions.set/setRequestResult`). All real Mock Device Kit 1.0.1 calls |
| Simulate: other app takes over | No kit API exists for this: feeds the session state the SDK reports (PAUSED, then STARTED) into the same handler the real state flow uses, and clears the display in place of the other app |
| State card | Below the buttons when a device state is active: title, what to do, one action (Connect or Try again) |
| Bridge | URL and token (set once), then status lines, last photo sent, log |

## Real glasses
1. Meta AI app: enable Developer Mode, glasses paired and a Display model.
2. Switch "Mock glasses" OFF and **restart the app** (Wearables is initialised at launch only in real mode).
3. Tap Connect: Meta AI opens for registration, returns via `physicslens://`. Allow camera access when asked.
4. Bridge must be reachable from the phone (same Wi-Fi, laptop IP, plain http is allowed).

## Not done yet
- Speech question input (`question` is always null).
- Scene clips / video on the glasses display (stills only).
- Everything on real glasses is untested: registration deep-link handling, camera permission flow, Inputs, HEIC photo path, and how real glasses report fold, heat, link loss and a session taken by another app (the state handling is built from the SDK's types and the mock's behaviour).
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

Found on the emulator: after the kit's `powerOff()` the old session still says STARTED but cannot draw, so the app ends it and recreates it when the link is back. After that power cycle the kit's simulated pinch (`input.select`) did not reach the new session in 4 of 5 tries (no SDK log); the phone's Explain, D-pad and Back buttons and the display buttons still work, and Disconnect + Connect restores the pinch. The emulated camera gives very small photos (about 6 KB).

## Testing notes (14 Nov, Pixel 8, mock mode)
- The full loop runs on a Pixel 8 (Android 17) in mock mode: connect, pinch, photo, bridge, result card.
- There is no live camera preview by design (the glasses have no viewfinder and the camera is only on when asked). The phone screen shows **"Last photo sent"**: the exact picture that went to the bridge. It is not saved.
- In mock mode the phone's back camera stands in for the glasses camera; sideways frames are turned upright.
- Bridge URL: `http://127.0.0.1:8787` with `adb reverse tcp:8787 tcp:8787` (USB), or the hosted bridge `https://lens.167-71-139-39.sslip.io` (no cable needed).
- Recognition without an API key: start the bridge with `DETECT_PROVIDER=pi` (dev only, about 7 s per photo).
