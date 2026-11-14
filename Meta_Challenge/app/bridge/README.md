# Bridge

Detection, WebSocket relay and latency log for the Meta glasses demo. Contract: [../shared/PROTOCOL.md](../shared/PROTOCOL.md).

## Run
```
npm install
npm start          # http://localhost:8787  (reads .env if present)
npm test           # relay tests in mock mode
npm run bench      # runs samples/*.jpg through the provider (see samples/README.md)
```
Open the phone stand-in at <http://localhost:8787/phone> (webcam, Space = pinch). It embeds the glasses preview at `http://localhost:4173/?bridge=ws://localhost:8787/ws` (editable).

## Env (copy `.env.example` to `.env`)
| Var | Meaning |
|---|---|
| `PORT` | default 8787 |
| `LENS_TOKEN` | Optional bridge key. Unset/blank keeps local development open; when set it protects detection, replay/latency reads, and WebSocket clients |
| `LENS_ALLOW_OPEN` | Set to `1` only to intentionally run Anthropic or Gemini without `LENS_TOKEN`; paid providers otherwise refuse to start open |
| `LENS_ALLOWED_ORIGINS` | Comma-separated extra browser origins allowed by CORS while the bridge is locked; the bridge's own origin is always allowed |
| `MAX_INFLIGHT` | Maximum simultaneous non-mock model calls across detect, ask, and sketch; default 4 |
| `MAX_SOCKETS` | Maximum WebSocket clients; default 50 |
| `MIN_CONFIDENCE` | Library matches below this become `lowConfidence`; default 0.6 |
| `LAST_TTL_MS` | How long `/last` and glasses replay retain a `show`; default 120000 |
| `HEARTBEAT_MS` | App and WebSocket heartbeat interval; default 10000 |
| `DETECT_PROVIDER` | `anthropic` / `gemini` / `mock` / `pi` / `claude`; unset = anthropic if key, else gemini if key, else mock |
| `SKETCH_PROVIDER` | `off` / `fixture` / `auto`; unset is off. `auto` uses the detect provider and is disabled with `mock` |
| `SKETCH_TIMEOUT_MS` | Sketch deadline; default 20000, or 60000 for a dev stand-in provider |
| `CLAUDE_DETECT_MODEL` | Only for `claude`: a **dev-only stand-in** that runs the local `claude` command with the login of whoever runs the bridge (default model `haiku`, timeout 60 s, about 10 s per photo). It spends that person's subscription, so it is opt-in, answers carry `standIn: true`, and it must never run on the droplet |
| `PI_DETECT_MODEL`, `DETECT_TIMEOUT_MS` | Only for `pi`: runs the local `pi` CLI with that machine's model login (no API key). Dev only: about 7 s per photo, default model `anthropic/claude-haiku-4-5`, default timeout 25 s |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | default model `claude-haiku-5-5` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | default model `gemini-4-carbon` (key sent in header). Output cap is at least 4096 tokens because Gemini 3+/4 thinking counts toward it. Carbon takes 6-7 s, so set `DETECT_TIMEOUT_MS=15000` |
| `LATENCY_LOG` | path of the JSONL log, default `latency.jsonl` |

## Endpoints

Open: `GET /health`, `GET /objects`, `GET /phone`, the glasses app at `/`, and exported files under `GET /media/*`.

Protected when `LENS_TOKEN` is set: `POST /detect`, `POST /ask`, `POST /rendered`, `GET /last`, and `GET /latency`. Send the key in `X-Lens-Token`. WebSocket `/ws` clients send it as `token` in their first `hello` frame.

`POST /rendered` accepts `{ "reqId": "...", "renderMs"?: number }` so a phone-only client can complete the same latency record as the glasses `rendered` frame. A valid `renderMs` is the phone's own response-to-paint duration; unknown or already completed request ids return `404 unknown_request`.

`GET /last` returns the most recent `show` while it is inside `LAST_TTL_MS`. A late glasses connection receives the same show with `replay: true` and `ageMs`; a phone `clear` removes it.

## Languages

`POST /detect` accepts `lang` (`en`, `fi`, `sv`, `de`, `es`, or `fr`), and `GET /objects?lang=fi` returns the localized library. The bridge lazily reads and caches `../shared/i18n/<lang>.json`. Missing files, objects, lenses, and fields fall back to English; translated caption arrays are used only when their length matches the English array. To add a language, add it to the bridge's accepted language list and model language names, add it to the phone selector, then create the corresponding JSON file under `shared/i18n` using the existing files as the schema.

Localized `show.lenses` may include `specText` and `knobLabels` for text drawn inside scenes; the English `spec` is never sent in a show.
`GET /objects?lang=` merges translated `tagline`, `short`, chapter drawing text, and knob labels over the English library data.

## Sketches

Set `SKETCH_PROVIDER=fixture` for the recorded stapler demo or `SKETCH_PROVIDER=auto` to generate explanations for unknown real photos. Auto mode costs one extra model call for each unknown object. Every generated sketch is marked `verified: false`; its numbers are estimates and are not checked facts.
Generated sketches begin with an `explore` / `model3d` chapter that turns, separates, and annotates the unknown object in 3D.
The bridge sanitizes its parts, beats, camera, animation, and effects before forwarding it; an invalid Explore chapter is dropped by itself.

## Follow-up questions

`POST /ask` answers a question about a library object and points the glasses to the best lens and step. It still works without a model: mock mode matches words locally and uses the chosen library caption as the answer.

```sh
curl -X POST localhost:8787/ask -H "Content-Type: application/json" -d '{"question":"Why does it click off?","aboutObjectId":"kettle","lang":"en"}'
```

## Lock it

Set `LENS_TOKEN` to a private random value and open the phone stand-in once as `http://localhost:8787/phone#k=<token>`. The page prefers a fragment key, still accepts the legacy `?k=` form, stores the key locally, removes it from the address bar, authenticates its API and WebSocket traffic, and passes it to the embedded glasses preview in a fragment. Add any separate browser origins to `LENS_ALLOWED_ORIGINS` as a comma-separated list. Never commit the key or put it in a checked-in QR code. Anthropic and Gemini refuse to start without this token unless `LENS_ALLOW_OPEN=1` is explicitly set.

## Security notes

`LENS_TOKEN` protects the model-facing POST routes, replay and latency reads, and WebSocket registration. The bridge accepts at most a 2 MB HTTP body, a 64 KB WebSocket frame, 4 concurrent model calls, and 50 sockets by default; questions are limited to 300 characters. Excess model work gets `429 busy` with `Retry-After: 2`. Latency memory keeps 500 entries and `latency.jsonl` stops growing at 20 MB.

The `/phone` page is a browser test tool, not a production phone client. The `pi` and `claude` providers are development stand-ins for personal machines only. The Claude stand-in keeps `--tools Read` but restricts allowed reads to `Read(./*.jpg)` inside its temporary working folder; that no-space argument is also safe to pass to the Windows command shim.

## Reading latency
`curl localhost:8787/latency` returns `{count, provider, captureToReceivedMs, detectMs, detectedToRenderedMs, totalMs}` with `p50`/`p90` each, plus the last 10 `recent` records. Those existing fields cover requests with a glasses or phone paint acknowledgement. The `requests` field covers the last 500 finished detect and ask requests whether acknowledged or not, including detect-time percentiles and counts by provider and object. Every acknowledged request is also a line in `latency.jsonl`. `captureToReceivedMs` includes the phone page's simulated Bluetooth delay slider.
The summary is in memory and resets on restart; the JSONL file persists until its 20 MB safety cap. When `preUploadMs` is absent, `captureToReceivedMs` is `null` and `totalMs` covers server receive through paint only.
Detection timeout is 8 s (`detect_timeout`); any other model failure is `detect_failed`, with a 502 to the caller.

## Glasses emulator on a phone (`/emulator`)
Your phone camera stands in for the glasses: the real Web App is drawn over the camera view the way the lens adds light (black is see-through), and gestures act like the Neural Band.

| Gesture | Glasses |
|---|---|
| Tap | Pinch (selects the focused control) |
| Swipe left, right, up, down | D-pad |
| Long press or two-finger tap | Back |
| Round button at the bottom | Look and explain: sends the camera frame to `/detect`, like a pinch on the phone app |
| Web App "Take photo" | The emulator answers it with the phone camera (it joins the bridge as the phone) |

Top right: eye = clean view for recording (leave it with three quick taps in the top-right corner), fullscreen, sliders (panel size, brightness, position, camera, hide touch marks, language). Record with Android's own screen recorder (Quick Settings).

Phone browsers allow the camera only on HTTPS or `localhost`:
- **Phone on USB to the laptop running the bridge:** `adb reverse tcp:8787 tcp:8787`, then open `http://localhost:8787/emulator` in the phone's Chrome.
- **Deployed bridge:** `https://<bridge host>/emulator#k=<LENS_TOKEN>`.

