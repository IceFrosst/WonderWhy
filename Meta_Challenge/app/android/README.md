# Physics Lens: Android app (Meta DAT 1.0.1)

> **Status note.** The "untested on real glasses" lines below were written before the 14 Nov loaner session. Real hardware results (Band pinch → glasses photo → Android → Gemini → display) are in [Design_Handoff.md](../../Design_Handoff.md#what-the-loaner-established) and [team-notes/Loaner_Test.md](../../team-notes/Loaner_Test.md). Anything not listed there is still unverified on real glasses.

Phone app that drives Meta Ray-Ban Display glasses (or the SDK's Mock Device Kit). Pinch → one photo → bridge `/detect` → result card on the glasses.

## What it does
| Step | Behaviour |
|---|---|
| Connect | Real: register with Meta AI, then device session. Mock: enable Mock Device Kit, pair a fake Ray-Ban Display |
| Idle | Card "Look at something and pinch" |
| Trigger | Pinch (`Select`), capture button, phone button "Explain what I see", or "Again" on the glasses. One gate (`TriggerGate`) decides: not connected, glasses off / folded / disconnected / taken over (refused, the log says what to do), display still starting (the trigger waits up to 8 s for it, then runs), first photo (consent card), or run |
| First-run consent | Before the first photo ever (not in demo data mode, which takes none): glasses card "Before you start / Each pinch sends one photo to a model. / Through our bridge. Not saved on the phone." with Agree (= pinch) / Not now (= Back), in English and Finnish; the phone shows the same as a full card with Agree. Agreement is kept in app prefs; Not now goes back to the idle card and the next trigger asks again. Phone dev button "Reset consent" |
| Capture | Camera starts, ONE photo, camera released in `finally` (never stored on disk) |
| Detect | JPEG (≤896 px, q80) → `POST {bridge}/detect` with `lang` and `waitSketch: true`; centred "Looking…" card meanwhile. HTTP 429 on `/detect` or `/ask`: waits `Retry-After` seconds (default 2, at most 5) and retries once; a second 429 shows "Busy / Try again in a moment." (`BridgeRetry`). Cancelling a capture or question (glasses off, Disconnect) disconnects the HTTP connection at once |
| Result | Cards have no fill (bright marks on black, DESIGN "Filled areas"). v1 answer: overview card (object, first step's still, one-line answer, hint), then step cards: the object as heading, the still, "Step 1/3. caption", the lens bar. Real stills from `/media/` are whole 600x600 frames with their own English title and caption, so the app cuts out the drawing and shows it in a black band whose height follows the card's text by the `CardFit` estimate (300 px down to 160 px). A number-lens still on a card that is not in English keeps only the number and unit (the English line under it is cut). One button per explainer, result, answer and error card (Back means Done); two only on consent, decision cards and the offline picker. Pinch = next, D-pad left/right = lens, up/down = step, Back = one step back, then overview, then idle. Old answer: label, concept, "Again". `lowConfidence`, `unknown` or confidence <0.5 → "Not sure / Look again, a bit closer." (the bridge's own text goes to the phone log only). Error cards: a title and "Try again in a moment."; the error code goes to the log. `standIn` → "Stand-in model" tag |
| Token | Optional "Bridge token" field (masked, saved in app prefs, no default). A pasted link's query, fragment and user info (`#k=<token>`, `?k=`) are stripped before use and saving; the log names only scheme://host:port. Sent as `X-Lens-Token` on `/detect`, `/ask` and `/rendered`; blank = no header. A 401 shows "Wrong bridge token. Set it in the app." Bridge URL and token apply to the next request as typed (no Disconnect + Connect); the log says "Bridge: now using ..." when the address changed |
| Latency ack | After a bridge result or answer card is on the display: `POST /rendered {reqId, renderMs}` (PROTOCOL "Phone-only latency"; renderMs = HTTP response received → card shown). Fire-and-forget, never blocks the card; the log says "Rendered ack N ms: logged by the bridge". Not sent for demo data, saved cards or phone answers |
| Offline | Bridge unreachable (no connection, or a proxy's 502-504 with no bridge body; not a 401, not a bridge error with a body): picker card "Offline · pick a saved card" (small tag), the object as heading, its tagline only when it is in the card's language, "3/7 · Left/right: object. Pinch: open." (the counter follows the library). Pinch opens the same explainer from saved data, marked "Offline: showing a saved card", **with the stills**: the build copies `../bridge/media/*/manifest.json`, `*/*/sN.png` and, for Explore, `*/explore/cN.png` and `tracks.json` into the APK (Gradle `copyLensAssets`, no copy in git, never the `.mp4` clips; 146 files, 12.2 MB stored, all lenses). "Try again" is on the card; Back from a saved overview returns to the picker |
| Language | Phone screen picker "Language": Phone language (default) or English, Suomi, Svenska, Deutsch, Español, Français (`Lang.SUPPORTED`), saved in prefs. The tag goes as `lang` on `/detect` and `/ask`, so the bridge sends the library text (label, summary, lenses, steps) in that language. Fixed card strings (idle, looking, buttons, step, offline card, overview hint, consent, token, not sure, errors, busy, ask cards, device-state cards, sketch and stand-in tags) are English and Finnish only; other languages fall back to English for them |
| Explore lens | The library's first chapter (`lens: "explore"`, `scene: "model3d"`, shared/MODEL3D.md) as a stills lens: per beat the text-free still `explore/c<n>.png` (a whole 600x600 frame: only the black around the drawing is trimmed, never the 2D stage cut), up to 3 part labels at their rest anchors (`tracks.json`, sampled at `t = loopFrom`; text from `spec.parts[].label`, translated through the lens's `specText` online or the library's spec offline; 18 px, 16 px for long ones, in side columns with a thin leader line), the beat's number when it has one (value green, unit, label in soft, bottom of the side with fewer labels), and the caption as card text ("Step 2/6. …"). The band height follows the card's text like every other still. The beat clips `b<n>.mp4` are never played or bundled (DAT video is not built). No Explore media (no manifest entry or fewer stills than beats): the lens is skipped and the object opens on its next lens, as on the glasses Web App; a sketch's Explore chapter shows only when the show's `media` has rendered stills for it. The phone's text mirror shows the drawn words: `[still: 2000 W heating power · Heating element]` |
| Lenses | Up to 5 lenses (DESIGN.md). Step cards carry a text lens bar "○●○○○ Bounce" (dots plus the lens name, 3 words at most; "Step 1/3" is the only counter). D-pad left/right changes lens and wraps (PROTOCOL nav: "previous / next, wrapping"); up/down steps; pinch goes deeper, then "Next: <lens>", then Again |
| Library | On connect and on a language change: `GET /objects?lang=<tag>`. Kept in memory and in an app-private file `files/library/objects_<tag>.json` (library text, not user data), so a later offline start still has the translated saved cards. Order: bridge answer in that language, saved copy, bridge answer in English, bundled English `objects.json` |
| Follow-up question | Phone field "Ask about it" + Ask, or a spoken question on the glasses (below), after a result: `POST /ask {question, aboutObjectId, lang}`. "Looking...", then an answer card: object (4 words), "Q: question" (12 words), answer (24 words); the primary button (and pinch) opens the `lensHint` lens and step, e.g. "Projectile motion 1/3"; without a hint, "Show steps". Back = the object's overview. When nothing matches, the bridge sends `answer: ""` and no hint: the card shows the object's summary and "Show steps". Errors: 401 token card, `detect_timeout` "Took too long", `bad_request` "Can't ask that", other "Couldn't answer"; all with Try again (asks again) and Done. Only a bridge with no `/ask` (404 with no body or `not_found`) or no bridge at all makes the phone answer by itself with PROTOCOL's mock rule (word overlap with the captions), tagged "Answer from saved cards". Demo data and saved offline cards always answer on the phone. Unknown objects and sketches: "Can't ask yet" card (PROTOCOL refuses them) |
| Voice question | `DeviceSession.addSpeech()` (mwdat-speech 1.0.1). The microphone listens only while a library result or an answer is on screen (stopped on idle, during capture and asking). A final `Speech.transcriptions` result goes through the same `/ask` path |
| Sketch | Unknown object with `show.sketch` (bridge `SKETCH_PROVIDER` on): the sketch's label and answer on the overview, its chapters as lenses, text only (no drawings yet), and the text tag "Sketch · unverified" on the overview and on every step card. `sketchError` or no sketch: the "Not sure what this is" card as before |
| Device states | Own card per DESIGN.md states table: taken off / folded (glasses blank, phone card "Glasses are off"; every trigger is refused with "No photo: the glasses are off. Put them on first"; the SDK stops Inputs while the glasses are off, so the app adds them again when they are put on and restores the last card), battery low and hot (glasses card that leaves after 6 s, or at once with pinch / OK / Back; phone card), Bluetooth drop (phone card, session recreated when the link is back), another app took the glasses (phone card, Connect takes them back), camera denied (decision card on glasses and phone, "Try again") |
| Errors | Cards with "Try again" for bridge errors, camera errors, timeouts |
| Glasses check (team tool, English) | Developer → "Glasses check": a full-screen checklist of the rows of `../../Glasses_Test.md` (`GlassesCheck.kt`, each row: number, what to do and what you should see, under 12 words), Pass / Fail / Skip and a short note on Fail. "App saw: …" hints come from what the app observed (session and display state, last pinch from the glasses, last card, last `/detect` time, battery, speech, consent); never a verdict. Kept in app prefs until "Start over". "Share report": plain text to the share sheet and in a selectable box (date, phone, Android, app version, mock or real, bridge host only, one line per row, totals); the token, a URL query or fragment and `k=` values never reach it |
| Seen today | Every result card (library, sketch, saved card, demo data; not errors, not "Not sure") adds an entry: time, object, first lens, the one-line summary, a flag, the first bundled still as a thumbnail. Follow-up questions add "Q: … A: …" under their object. Newest first, at most 30, the same object within 60 s merged; saved in app prefs as JSON without pictures. The phone shows the last 3 under the question card ("Show all" for more). Tap while connected: the object again on the glasses from the saved library (offline-card path, no photo); not connected: a muted hint. Developer "Clear Seen today". English and Finnish |
| Receipt line | Phone only, under the mirror: where the result came from, e.g. "Library card · forced object · 1.1 s to card", "Sketch · unverified · 6.2 s to card", "Saved card · offline", "Demo data", "Stand-in model" when `standIn`. The model part is the response's `timings.model` (PROTOCOL `show`): `mock`, `forced`, or the model name; left out when absent. The time is measured on the phone from the trigger to the card on the display. English and Finnish |

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

APK: `app/build/outputs/apk/debug/app-debug.apk` (about 54 MB: SDK native libs; 12.2 MB of it are the bundled library stills, 6 MB of those the Explore beats).

## Tests
`./gradlew --no-daemon -q testDebugUnitTest` (172 JVM tests on Sat 14 Nov, noon. Added then: the Explore lens (spec text from the library, `specText` laid over it by index, the shipped Finnish labels, `tracks.json` anchors at `loopFrom` with interpolation and bad input, labels only for named parts, numbers from the spec else the tracks, the media rule online, offline and for sketches, every bundled Explore still and tracks file on disk, the band layout: labels at 16 px or more, inside the band, apart, clear of the number), every Explore still trimmed without cutting the drawing, and the two-line answer head crop. Library and sketch tests now accept an Explore chapter first. 153 in the morning. Added then: the glasses check rows against every numbered row of `Glasses_Test.md` and their word caps, verdict toggle and note-only-on-Fail, its saved state round trip, hints that never say pass or fail, bridge host only, the report lines and totals, and a report that can never carry the token, a `k=` value, a query or a fragment; the "Seen today" journal (newest first, merge within 60 s, sketches merged by label, cap 30, questions under their object, JSON round trip without pictures, which results make an entry, the still path from the bundled copy); the receipt line in English and Finnish; `timings.model` parsing. 134 earlier in the night of 13 to 14 Nov. Added then: one button per card kind, step card shape, Not sure and error words in English and Finnish, no fixed English on Finnish cards, offline picker shape, the still band from the card estimate for every overview and step (online and offline, English and Finnish), the number headline crop on every real number still, offline stills from every bridge manifest, the tagline language rule, Finnish device-state words, the 429 retry rule, the phone status line, URL key stripping, notice-over-consent input order, the 300-character question cap, the stand-in tag. 112 on 13 Nov evening. Added then: the trigger gate (display not ready, glasses off, consent order), bridge URL/token cleaning, the `/rendered` body, the `/ask` fallback rule, two `/ask` answers recorded from the real bridge (`src/test/resources/`), consent words within the state-card caps in English and Finnish, the lens bar, lens wrap, and a height estimate (`CardFit`) of every library card (overview, every step, offline picker, steps with stills) in English and Finnish against the 600x600 display. Library tests now assert "contains" / "at least", never exact object or lens counts. Earlier: token header and error mapping, `/detect` parser, explainer state, offline library and picker, device-state mapping, word caps, still band; since 14 Nov also the request bodies (`lang`, `waitSketch`, `forceObjectId`, `/ask`), the picker's language rule, `/ask` response parsing with `lensHint`, the phone's own answer, answer word caps, sketch parsing with the bridge's recorded stapler sketch, the library refresh choice, and the still crop run on every real still in `bridge/media/`).
Emulator smoke walk (no instrumentation): `tools/emulator_smoke.sh` builds, installs, clears the app data, grants permissions, launches, and opens the Developer section, then walks Connect glasses (mock) → consent → Not now → demo data → Pinch → "Thrown ball" under "Seen today" → Pinch → Right → Back → Back → Disconnect, finding every control by its text in `uiautomator dump` and reading the glasses card from the mirror's "Glasses show: ..." content description. Exits 1 with the step, the expected text and the screen's texts (plus a screenshot path) when something does not appear or the app crashes (FATAL in logcat). `SKIP_BUILD=1` reuses the APK.

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
Top to bottom: title row ("Physics Lens", language chip, one button "Connect glasses" / "Disconnect"), one muted status line ("Glasses connected · 100% · Bridge online"; a failing part in hot, from the session, the battery and `GET /health` every 10 s), the state card when something needs the wearer, the glasses mirror, the muted receipt line for the result on screen, "Glasses remote", one cyan "Explain what I see", the question card, "Seen today", and a collapsed "Developer" section. Only one cyan button on the screen; weights 400 and 600 only.

| Control | What it does |
|---|---|
| Language chip | "EN ▾": Phone language (default) or one of the 6 languages. Saved; does not change the system locale |
| Connect glasses / Disconnect | Toggles with the session (reads "Disconnect" while a Connect is still running, and stops it) |
| Glasses mirror | Mock: the kit's 600x600 display preview. Real glasses: the card as text. Its content description is "Glasses show: ..." (title, lines, [buttons]), for uiautomator and the smoke script |
| Glasses remote | Pinch (kit input API in mock, else the controller), Back, Left, Up, Down, Right |
| Explain what I see | The trigger (same as pinch on the idle card) |
| Ask a follow-up | Follow-up question about the object on screen (same path as a spoken one) |
| State card | Title (hot only for errors: Bluetooth drop, camera denied, hot, battery), what to do, one secondary action (Connect, Try again, or Agree for the consent card) |
| Seen today | The last 3 results (thumbnail, object, one line, time and flag); tap to show one again on the glasses; "Show all" / "Show less" |
| Developer (tap to open) | Mock glasses and Demo data switches; "Glasses check" (the real-glasses checklist) and "Clear Seen today"; device states (mock): Take off / Put on, Fold / Unfold, Battery low / full, Overheat / Cool down, Bluetooth drop / back, Deny / Allow camera, all real Mock Device Kit 1.0.1 calls; "Simulate: other app takes over" (no kit API: feeds PAUSED / STARTED to the real handler); Say: "why does it curve?" (kit `simulateTranscription`); Bridge URL and token (apply to the next request); "Force object id (dev test, not saved)" (PROTOCOL `forceObjectId`); Reset consent; raw status lines; last photo sent; log. Opens by itself when the bridge URL is empty |

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

## What works (emulator + Mock Device Kit only)

### Sat 14 Nov 2026, noon: Explore lens (3D beats as stills)
Emulator `emulator-5554` (Android 15), Mock Device Kit 1.0.1. Offline path: bridge URL on a dead port (`:8799`) after `pm clear` (so the bundled library is used). Online path: this branch's bridge started on `:8788` (mock provider, no `.env`), Finnish, forced object `kettle`; the `:8787` bridge running on the Mac is older and sends no Explore lens.

| Path | Seen on the emulator | Screens |
|---|---|---|
| Demo data unchanged: ball overview and steps (the fixtures have no Explore chapter, so the smoke walk needed no change) | Yes | `140` |
| Offline picker → Guitar string: overview with the first beat's still ("Pinch: 6 steps. Left/right: 5 lenses."), beats 1 to 6: labels "Six strings / Thin top / Hollow box", "Bridge / Thin top", "Fret 5", and "110 Hz · open A string" with "Fret 12"; last beat's button "Next: Standing waves" | Yes | `141_*` |
| Offline picker → Boiling kettle: beats 1 to 6 (labels "Heating element / Water / Steam switch", "Bimetal disc / Steam channel", "2000 W · heating power"); pinch on beat 6 opens the 2D "Convection and boiling" lens; Left goes back to Explore beat 1 | Yes | `142_*`, `143`, `144` |
| Online, Finnish: `/detect` kettle with `media` and `specText`; `tracks.json` fetched from the bridge's `/media`; labels "Lämmitysvastus / Vesi / Höyrykytkin", number "2000 W lämmitysteho", Finnish captions and lens name "Näin se toimii" | Yes | `145`-`147` |
| "Seen today" thumbnail of a saved kettle / guitar: the Explore still trimmed to the drawing | Yes | `141_*`, `142_*` (bottom) |
| Smoke walk `tools/emulator_smoke.sh`, twice in a row | Yes (PASS, PASS) | - |

### Sat 14 Nov 2026, morning: glasses check, "Seen today", receipt line
Emulator `emulator-5554` (Android 15), Mock Device Kit 1.0.1, local bridge `:8787` (mock provider, auth off); a dead port (`:8799`) for the offline path. Nothing here ran on real glasses.

| Path | Seen on the emulator | Screens |
|---|---|---|
| Glasses check: Developer → "Glasses check" opens the full-screen list of the 16 rows of `Glasses_Test.md`; "App saw" hints from live state (mock on, registration / session / display, last photo 7 KB, last pinch from the kit's Inputs "1 min ago", last card "Thrown ball", last `/detect` 425 ms, pinch to card 423 ms) | Yes | `120` |
| A failed row with a note; verdicts and the note still there after Back, after `adb install -r` and a relaunch; Start over clears every row | Yes | `121` |
| Share report: Android share sheet with the plain text (`ACTION_SEND`, `text/plain`) and the same text in a selectable box: date, "Google sdk_gphone64_arm64, Android 15 (API 35)", "App: 0.1 (1)", "Glasses: mock", "Bridge host: 10.0.2.2", 16 row lines, totals | Yes (the share sheet opened; nothing was sent to another app) | `122`, `122b` |
| Seen today: entries from demo data, a forced library object on the bridge, a saved offline card; a typed follow-up adds "Q: … A: …" under the kettle; 3 shown with "Show all"; thumbnails from the bundled stills; the list and thumbnails come back after a reinstall + relaunch | Yes | `123` |
| Tap an entry while connected: the object again on the glasses from the saved library and bundled still, no photo ("Saved card · from Seen today"); Back goes to idle; tap while not connected: muted hint that leaves after 5 s; Developer "Clear Seen today" → empty line | Yes | `124`, `129`, `130` |
| Receipt line under the mirror: "Demo data", "Library card · forced object · 1.1 s to card" (`timings.model` = `forced` from the bridge), "Saved card · offline", "Bridge answer · word match · 0.53 s to card" (`/ask`); hidden for Not sure and idle | Yes | `125`-`127` |
| Finnish: "Nähty tänään", flags, the hint and the empty line, the receipt "Tallennettu kortti · Nähty tänään -listasta" over the Finnish keys card | Yes | `128`, `128b`, `129`, `130` |
| Receipt for a sketch, `standIn`, and `mock detector` (an unforced photo on the mock provider is "Not sure", which has no receipt) | Unit tests only | - |
| Smoke walk (now also checks "Thrown ball" under "Seen today" after the ball overview), twice in a row | Yes | - |

### Night of 13 to 14 Nov 2026
Emulator `emulator-5554`, Mock Device Kit 1.0.1, local bridge `:8787` (mock provider), plus two scratch stubs not in git: `:8792` (accepts `/detect` and `/ask` and never answers) and `:8793` (answers 429 with `Retry-After: 1`).

| Path | Seen on the emulator | Screens |
|---|---|---|
| Cards without the grey fill; idle, overview with the first step's still, step card (object heading, still, "Step 1/3", lens bar "●○○○○ Projectile motion", one button), lens switch | Yes | `100`-`103` |
| Not sure (mock unknown) and error card with fixed words; Busy after two 429s (two `/detect` calls 1.5 s apart in the stub's log) | Yes | `104`, `105`, `113` |
| "Looking…" / "Katsotaan…" centred (lifted by padding: the display pins cards to the bottom) | Yes | `114` |
| Offline picker, saved overview and step with bundled stills (English and Finnish; Finnish picker without the English tagline) | Yes | `106`, `106b`, `107` |
| Consent on glasses and phone (two short lines each); Finnish step with still; Finnish number lens shows only "110 Hz" | Yes | `108`, `108b`, `109` |
| Battery notice (glasses) and its phone card | Yes | `110` (taken while scrolling: a little offset) |
| Phone screen, Developer closed and open | Yes | `111`, `112` |
| Tallest library card (Finnish guitar "Entä jos" step 1, still at 160 px) fits with 68 px to spare; drawn card within 5 px of the `CardFit` estimate | Yes | - |
| Review fixes: hanging `/detect` + take off / put on → idle card, pinch takes a photo (no "Busy", no "Cancelled"); Disconnect + Connect during a hang → new session opens on idle; hanging `/ask` + take off / put on → idle (not a stuck "Looking…"); battery notice over the consent card: pinch dismisses the notice, consent stays not given; consent card + Demo data + Explain → capture runs, phone consent card gone; "No object yet" over the offline picker: pinch takes a photo instead of opening the hidden saved card; pasted `#k=secret-key` URL → log and prefs show only `http://10.0.2.2:8787`; Disconnect tapped right after Connect → no session left | Yes | - |
| Smoke walk `tools/emulator_smoke.sh`, twice in a row | Yes | - |

### 14 Nov 2026 (emulator + Mock Device Kit only)
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
- Explore: no motion (the clips are not played; each beat is its still at rest), no `dim` effect texts (for example a length along a string), labels follow the still, not the turning model. The ball has 6 chapters; with Explore first, the 5-lens cap (DESIGN lens bar) drops its last lens ("The number"; beat 6 of Explore carries 10.2 m). An offline start with a library saved from an older bridge (no Explore chapter) shows no Explore lens until the next library fetch.
- Sketches are text only (no `spec` drawings on the phone app's cards). The `/detect` `question` field is always null (questions go to `/ask`).
- Fixed card strings in Swedish, German, Spanish and French fall back to English. Translations have no taglines yet, so non-English offline cards show none. Text drawn inside stills (axis labels, node names) stays English; only the number lens is cut to its number on non-English cards.
- The toolkit pins every card to the bottom of the display and has no full-height root, so "Looking…" is centred by a computed bottom padding.
- Not reproducible on the emulator: phone Agree while a trigger is refused (the phone shows the device-state card, not consent, whenever a trigger would be refused); the fix (idle instead of a dead consent card) is in, untested here.
- Card heights are an estimate (`CardFit`, measured on the mock display); the real Display's text metrics may differ.
- The emulated camera gives very small photos (about 6 KB); scene clips / video are not shown (stills only); no app icon.
- "Seen today" is not emptied at midnight: older entries stay (up to 30) and show their date. A sketch cannot be shown again (not in the saved library). Replaying a demo-data entry shows the saved library card, not the fixture.
- The receipt's "to card" time runs from the trigger to the first card on the display (camera, upload, bridge and drawing together); the glasses check's "last /detect" is the phone's HTTP round trip only.
- Everything on real glasses is untested (see the demo script); the glasses check is built for that test but has itself only run against the Mock Device Kit.

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
