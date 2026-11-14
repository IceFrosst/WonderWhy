# Physics Lens: Android app (Meta DAT 1.0.1)

Phone app that drives Meta Ray-Ban Display glasses (or the SDK's Mock Device Kit). Pinch → one photo → bridge `/detect` → result card on the glasses.

## What it does
| Step | Behaviour |
|---|---|
| Connect | Real: register with Meta AI, then device session. Mock: enable Mock Device Kit, pair a fake Ray-Ban Display |
| Idle | Card "Look at something and pinch" |
| Trigger | Pinch (`Select`), capture button, phone button "Explain what I see", or "Again" on the glasses. One gate (`TriggerGate`) decides: not connected, glasses off / folded / disconnected / taken over (refused, the log says what to do), display still starting (the trigger waits up to 8 s for it, then runs), first photo (consent card), or run |
| First-run consent | Before the first photo ever (not in demo data mode, which takes none): glasses card "Before you start / Each pinch sends one photo to a model. / Through our bridge. Not saved on the phone." with Agree (= pinch) / Not now (= Back), in English and Finnish; the phone shows the same as a full card with Agree. Agreement is kept in app prefs; Not now goes back to the idle card and the next trigger asks again. Phone dev button "Reset consent" |
| Capture | Camera starts, ONE photo, camera released in `finally` (never stored on disk) |
| Detect | JPEG (≤896 px, q80) → `POST {bridge}/detect` with `lang` and `waitSketch: true`; "Looking..." card meanwhile |
| Result | v1 answer: overview card, then step cards with the scene still. Real stills from `/media/` are whole 600x600 frames with their own English title and caption, so the app cuts out the drawing (between the head and the caption block) and shows it in a black band whose height follows the caption length (228 px for one line down to 96 px), so title, still, caption, lens line and two buttons fit the 600x600 card. Demo fixture stills keep the 3:1 band. Pinch = next, D-pad left/right = lens, up/down = step, Back = one step back, then overview, then idle. Old answer: label, concept, "Again" / "Done". `lowConfidence` → "Not sure"; `unknown` or confidence <0.5 → "Not sure what this is" |
| Token | Optional "Bridge token" field (masked, saved in app prefs, no default). Sent as `X-Lens-Token` on `/detect`, `/ask` and `/rendered`; blank = no header. A 401 shows "Wrong bridge token. Set it in the app." Bridge URL and token apply to the next request as typed (no Disconnect + Connect); the log says "Bridge: now using ..." when the address changed |
| Latency ack | After a bridge result or answer card is on the display: `POST /rendered {reqId, renderMs}` (PROTOCOL "Phone-only latency"; renderMs = HTTP response received → card shown). Fire-and-forget, never blocks the card; the log says "Rendered ack N ms: logged by the bridge". Not sent for demo data, saved cards or phone answers |
| Offline | Bridge unreachable (no connection, or a proxy's 502-504 with no bridge body; not a 401, not a bridge error with a body): "Offline" card with the library objects (`shared/objects.json`, 7 on 14 Nov; the counter follows the library, e.g. "3/7"). Left/right picks (wraps), pinch opens the same explainer from saved data, marked "Offline: showing a saved card". "Try again" is on the card; Back from a saved overview returns to the picker |
| Language | Phone screen picker "Language": Phone language (default) or English, Suomi, Svenska, Deutsch, Español, Français (`Lang.SUPPORTED`), saved in prefs. The tag goes as `lang` on `/detect` and `/ask`, so the bridge sends the library text (label, summary, lenses, steps) in that language. Fixed card strings (idle, looking, buttons, step, offline card, overview hint, consent, token, not sure, sketch tag) are English and Finnish only; other languages fall back to English for them |
| Lenses | Up to 5 lenses (DESIGN.md). Step cards carry a text lens bar "○●○○○ 2/5 Bounce" (dots plus counter, never colour alone). D-pad left/right changes lens and wraps (PROTOCOL nav: "previous / next, wrapping"); up/down steps; pinch goes deeper, then "Next: <lens>", then Again |
| Library | On connect and on a language change: `GET /objects?lang=<tag>`. Kept in memory and in an app-private file `files/library/objects_<tag>.json` (library text, not user data), so a later offline start still has the translated saved cards. Order: bridge answer in that language, saved copy, bridge answer in English, bundled English `objects.json` |
| Follow-up question | Phone field "Ask about it" + Ask, or a spoken question on the glasses (below), after a result: `POST /ask {question, aboutObjectId, lang}`. "Looking...", then an answer card: object (4 words), "Q: question" (12 words), answer (24 words); the primary button (and pinch) opens the `lensHint` lens and step, e.g. "Projectile motion 1/3"; without a hint, "Show steps". Back = the object's overview. When nothing matches, the bridge sends `answer: ""` and no hint: the card shows the object's summary and "Show steps". Errors: 401 token card, `detect_timeout` "Took too long", `bad_request` "Can't ask that", other "Couldn't answer"; all with Try again (asks again) and Done. Only a bridge with no `/ask` (404 with no body or `not_found`) or no bridge at all makes the phone answer by itself with PROTOCOL's mock rule (word overlap with the captions), tagged "Answer from saved cards". Demo data and saved offline cards always answer on the phone. Unknown objects and sketches: "Can't ask yet" card (PROTOCOL refuses them) |
| Voice question | `DeviceSession.addSpeech()` (mwdat-speech 1.0.1). The microphone listens only while a library result or an answer is on screen (stopped on idle, during capture and asking). A final `Speech.transcriptions` result goes through the same `/ask` path |
| Sketch | Unknown object with `show.sketch` (bridge `SKETCH_PROVIDER` on): the sketch's label and answer on the overview, its chapters as lenses, text only (no drawings yet), and the text tag "Sketch · unverified" on the overview and on every step card. `sketchError` or no sketch: the "Not sure what this is" card as before |
| Device states | Own card per DESIGN.md states table: taken off / folded (glasses blank, phone card "Glasses are off"; every trigger is refused with "No photo: the glasses are off. Put them on first"; the SDK stops Inputs while the glasses are off, so the app adds them again when they are put on and restores the last card), battery low and hot (glasses card that leaves after 6 s, or at once with pinch / OK / Back; phone card), Bluetooth drop (phone card, session recreated when the link is back), another app took the glasses (phone card, Connect takes them back), camera denied (decision card on glasses and phone, "Try again") |
| Errors | Cards with "Try again" for bridge errors, camera errors, timeouts |

## Build
macOS (the paths that work on the team Mac; JDK 17, Gradle 8.14.1 via the wrapper):
```
export JAVA_HOME=$(ls -d ~/.local/opt/zulu17*/Contents/Home)
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
echo "sdk.dir=$ANDROID_HOME" > local.properties   # not committed
./gradlew --no-daemon assembleDebug
```
Windows: `local.properties` needs **forward slashes**, e.g. `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk` (a `C:\Users\...` value fails with "The filename, directory name, or volume label syntax is incorrect"); run `gradlew.bat`. JDK 17 or 21 both build.

APK: `app/build/outputs/apk/debug/app-debug.apk` (~48 MB, SDK native libs).

## Tests
`./gradlew --no-daemon -q testDebugUnitTest` (112 JVM tests on 14 Nov evening. Added then: the trigger gate (display not ready, glasses off, consent order), bridge URL/token cleaning, the `/rendered` body, the `/ask` fallback rule, two `/ask` answers recorded from the real bridge (`src/test/resources/`), consent words within the state-card caps in English and Finnish, the lens bar, lens wrap, and a height estimate (`CardFit`) of every library card (overview, every step, offline picker, steps with stills) in English and Finnish against the 600x600 display. Library tests now assert "contains" / "at least", never exact object or lens counts. Earlier: token header and error mapping, `/detect` parser, explainer state, offline library and picker, device-state mapping, word caps, still band; since 14 Nov also the request bodies (`lang`, `waitSketch`, `forceObjectId`, `/ask`), the picker's language rule, `/ask` response parsing with `lensHint`, the phone's own answer, answer word caps, sketch parsing with the bridge's recorded stapler sketch, the library refresh choice, and the still crop run on every real still in `bridge/media/`).
Emulator smoke walk (no instrumentation): `tools/emulator_smoke.sh` builds, installs, clears the app data, grants permissions, launches, and walks consent → Not now → demo data → Connect (mock) → Pinch → Pinch → Right → Back → Back → Disconnect, finding every control by its text in `uiautomator dump` and reading the glasses card from the phone's "Glasses show: ..." line. Exits 1 with the step, the expected text and the screen's texts (plus a screenshot path) when something does not appear or the app crashes (FATAL in logcat). `SKIP_BUILD=1` reuses the APK.

## Install and run (mock mode, no glasses)
| Setup | Commands / bridge URL |
|---|---|
| USB phone | `adb install -r app/build/outputs/apk/debug/app-debug.apk`, `adb reverse tcp:8787 tcp:8787`, URL `http://127.0.0.1:8787` |
| Emulator | same install, `adb shell pm grant com.junction2026.lens android.permission.CAMERA` (and `BLUETOOTH_CONNECT`), URL `http://10.0.2.2:8787` (the default URL is the hosted bridge `https://lens.167-71-139-39.sslip.io`) |
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
| Glasses show: ... | The card on the glasses as one line of text (title, lines, [buttons]), "(blank)" when cleared. For people without the preview (real mode) and for the smoke script |
| Glasses input (mock) | Pinch (through the kit's input API), Back, Left, Up, Down, Right (call the controller's `onBack` / `onNav` directly) |
| Device states (mock) | Take off / Put on (`doff/don`), Fold / Unfold (`fold/unfold`), Battery low / full (`setBatteryLevel`), Overheat / Cool down (`setThermalLevel SEVERE`), Bluetooth drop / back (`powerOff/powerOn`), Deny / Allow camera (`permissions.set/setRequestResult`). All real Mock Device Kit 1.0.1 calls |
| Simulate: other app takes over | No kit API exists for this: feeds the session state the SDK reports (PAUSED, then STARTED) into the same handler the real state flow uses, and clears the display in place of the other app |
| State card | Below the buttons when a device state is active: title, what to do, one action (Connect or Try again) |
| Bridge | URL and token (apply to the next request), "Force object id (dev test, not saved)": sent as PROTOCOL `forceObjectId` so a bridge without a model key answers with that library object (how the stills and `/ask` were tested), "Reset consent" (dev). Then status lines (Speech, Consent), last photo sent, log |

## Real glasses
1. Meta AI app: enable Developer Mode, glasses paired and a Display model.
2. Switch "Mock glasses" OFF and **restart the app** (Wearables is initialised at launch only in real mode).
3. Tap Connect: Meta AI opens for registration, returns via `physicslens://`. Allow camera access (and microphone, for spoken questions) when asked.
4. Bridge must be reachable from the phone (same Wi-Fi, laptop IP, plain http is allowed).

## 60-second demo script
### Mock mode (no glasses; ran on the emulator 14 Nov)
Before: bridge running (`DETECT_PROVIDER=mock npm start` in `../bridge`), app installed, URL set, "Mock glasses" on, consent already given once (or say the consent line below), language as wanted.

| Time | Tap on the phone | What the audience sees |
|---|---|---|
| 0-5 s | Connect | The 600x600 glasses display appears on the phone: "Physics Lens / Look at something and pinch" (demo data restarts at the ball on every Connect) |
| 5-10 s | "Demo data" on, then Pinch | "Looking...", then the ball overview: "Thrown ball / Gravity bends the path into a curve. / Pinch: 3 steps. Left/right: 2 lenses." |
| 10-20 s | Pinch | Step 1/3 with the drawing, caption "Gravity pulls the ball down all the time...", lens bar "●○ 1/2 Projectile motion" |
| 20-25 s | Pinch, Pinch | Steps 2/3 and 3/3; the button now says "Next: Bounce" |
| 25-32 s | Right | The Bounce lens, step 1/3, "○● 2/2 Bounce" (Left/right wraps) |
| 32-45 s | Say: "why does it curve?" | The answer card "Q: why does it curve?" with the caption that answers it ("Answer from saved cards": demo data answers on the phone) and the button "Projectile motion 1/3"; Pinch opens that step |
| 45-55 s | Back, Back | Overview, then the idle card |
| 55-60 s | Take off, then Put on | Glasses blank and the phone card "Glasses are off / Put them on to continue."; put on: the last card comes back |

With a bridge instead of demo data: switch "Demo data" off and type a library id in "Force object id" (e.g. `ball`) so a keyless bridge answers with that object; the spoken question then goes to the real `POST /ask`. The first real photo shows the consent card: pinch = Agree.

### Real glasses (untested: no hardware was available)
1. Meta AI app: Developer Mode, glasses paired. "Mock glasses" off, restart the app, Connect, finish registration in Meta AI, allow camera and microphone.
2. Bridge on the same Wi-Fi (laptop IP) or the hosted URL; token if the bridge has one.
3. Wearer: look at a library object (ball, guitar, kettle, keys, phone, bike gears, metal spoon) and pinch. First time: consent card, pinch to agree. Then "Looking...", overview, pinch through the steps, swipe left/right for lenses, ask a question out loud while a result is on screen, Back twice to finish.
Untested on hardware: registration deep link, permission screens, real pinch / swipe, speech, photo format, timing, and every device state.

## What works (14 Nov 2026, emulator + Mock Device Kit only)
Emulator `emulator-5554` (Pixel 8 profile, Android 15, arm64), Mock Device Kit 1.0.1, local bridges with today's code (`:8787` mock, auth off; `:8788` with `LENS_TOKEN`).

| Path | Seen on the emulator | Screens |
|---|---|---|
| First-run consent: card on glasses and phone, Not now (Back) → idle and asks again, Agree (pinch) → photo sent | Yes | `80`-`82` |
| Bridge URL edited after Connect: the next request goes to the new address (offline card for a dead port, back to 8787 without reconnecting); token typed after a 401: the next request passes | Yes | `83` |
| Explain pressed during Connect: "Glasses display is starting: the photo waits for it", then the photo; 0 display errors in 8 runs that hit the window (before the fix: "Invalid display state for operation" in 1 of 4 runs) | Yes | `92` |
| Take off: glasses blank, phone card, Explain refused with a reason; put on: Inputs added again, pinch works again | Yes | `86`, `87` |
| Battery low card: pinch dismisses it (log "BATTERY_LOW card dismissed (pinch)"), else it leaves after 6 s | Yes | `88` |
| Real `POST /ask` on 8787 (phone field, kit speech, Finnish): answer card with `lensHint` (Bounce 1/3), pinch opens that lens; no match → summary; 401 on 8788 → token card; dead port → phone answer | Yes | `89`-`91` |
| `POST /rendered` after detect and ask cards: `GET /latency` on 8787 lists the phone's reqIds (count 32 after this run) | Yes (bridge output) | - |
| Offline picker with 7 objects ("3/7"), Finnish offline card text and hint, longest Finnish step card fits; lens bar dots and wrap (2/4 → 1/4 → 4/4) | Yes | `84`, `85` |
| Smoke walk `tools/emulator_smoke.sh`, twice in a row | Yes | - |

## Known issues
- **Mock Device Kit: pinch after `powerOff()` / `powerOn()` (Bluetooth drop stand-in) never reaches the recreated session.** Not ours (checked 14 Nov with the kit's own logs): after power-on the new session's Inputs reports ACTIVE, but the kit's router answers the add with "Capability CAPABILITY_INPUT already active, returning success" without re-activating its input handler (its state was reset by the disconnect), so `input.select()` is dropped ("Dropping injected input event — not streaming"). Removing and adding Inputs again makes the router activate the handler and start streaming, yet the event then arrives in the SDK as "Received DwaEvent: capability=CAPABILITY_UNKNOWN" and is not delivered. Keeping the old session instead delivers the pinch but every card fails with "Failed to render display content". A fold / unfold (the glasses end the session) does not have the problem. Phone buttons, D-pad, Back and the display buttons still work; Disconnect + Connect (re-pair) restores the pinch.
- The SDK stops Inputs while the glasses are off ("Inputs stopped: glasses doffed") and does not restart them; the app re-adds them on put-on (fixed 14 Nov). A pinch while the glasses are off never reaches the app (by design of the SDK).
- The library is fetched on Connect and on a language change, not when the bridge URL changes; the offline card uses the last library fetched (the hosted bridge still serves 6 objects).
- Sketches are text only (no `spec` drawings on the phone app's cards). The `/detect` `question` field is always null (questions go to `/ask`).
- Fixed card strings in Swedish, German, Spanish and French fall back to English; object taglines on the offline card and the text drawn in stills stay English.
- Card heights are an estimate (`CardFit`, measured on the mock display); the real Display's text metrics may differ.
- The emulated camera gives very small photos (about 6 KB); scene clips / video are not shown (stills only); no app icon.
- Everything on real glasses is untested (see the demo script).

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
