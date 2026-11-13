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
| `DETECT_PROVIDER` | `anthropic` / `gemini` / `mock`; unset = anthropic if key, else gemini if key, else mock |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | default model `claude-haiku-5-5` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | default model `gemini-2.5-flash` (key sent in header) |
| `LATENCY_LOG` | path of the JSONL log, default `latency.jsonl` |

## Endpoints
`GET /phone`, `GET /objects`, `GET /health`, `GET /latency`, `POST /detect`, WebSocket `/ws`.

## Reading latency
`curl localhost:8787/latency` returns `{count, provider, captureToReceivedMs, detectMs, detectedToRenderedMs, totalMs}` with `p50`/`p90` each, plus the last 10 `recent` records. Every completed request (after the glasses send `rendered`) is also a line in `latency.jsonl`. `captureToReceivedMs` includes the phone page's simulated Bluetooth delay slider.
The summary is in memory and resets on restart; the JSONL file persists.
Detection timeout is 8 s (`detect_timeout`); any other model failure is `detect_failed`, with a 502 to the caller.
