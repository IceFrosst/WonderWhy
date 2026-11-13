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
| Result | Label, concept (from `GET /objects`), optional answer; "Again" / "Done". Confidence <0.5 or `unknown` → "Not sure what this is" |
| Errors | Cards with "Try again" for network, bridge, camera, permission, session stop, glasses off |

## Build
```
export JAVA_HOME=$(ls -d ~/.local/opt/zulu17*) ANDROID_HOME=~/Android/Sdk PATH=$JAVA_HOME/bin:$PATH
echo "sdk.dir=$ANDROID_HOME" > local.properties   # not committed
./gradlew --no-daemon assembleDebug
```
APK: `app/build/outputs/apk/debug/app-debug.apk` (~41 MB, SDK native libs).

## Install and run (mock mode, no glasses)
| Setup | Commands / bridge URL |
|---|---|
| USB phone | `adb install -r app/build/outputs/apk/debug/app-debug.apk`, `adb reverse tcp:8787 tcp:8787`, URL `http://127.0.0.1:8787` |
| Emulator | same install, URL `http://10.0.2.2:8787` (default) |
| Bridge | `cd ../bridge && npm start` |

1. Open the app, allow Bluetooth and Camera (mock uses the phone's back camera as the glasses camera).
2. Keep "Mock glasses" ON, tap Connect. The 600x600 glasses display appears in the app.
3. Tap Pinch (or "Explain what I see"). Use "Take off / put on" and "Battery low" to test device states.

## Real glasses
1. Meta AI app: enable Developer Mode, glasses paired and a Display model.
2. Switch "Mock glasses" OFF and **restart the app** (Wearables is initialised at launch only in real mode).
3. Tap Connect: Meta AI opens for registration, returns via `physicslens://`. Allow camera access when asked.
4. Bridge must be reachable from the phone (same Wi-Fi, laptop IP, plain http is allowed).

## Not done yet
- Speech question input (`question` is always null).
- Animation images / video on the glasses display (text cards only).
- Everything on real glasses is untested: registration deep-link handling, camera permission flow, Inputs, HEIC photo path.
- Not run on a device or emulator at all yet (only built and linted).
- Mock → real without an app restart; app icon; no unit tests.
