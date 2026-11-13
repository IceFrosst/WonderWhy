# Bridge protocol (v0)

Three parts run on the laptop for simulator testing:

| Part | Folder | Stands in for | Port |
|---|---|---|---|
| Glasses Web App | `glasses/` | The app on the Ray-Ban Display | Vite preview 4173 (dev 5173) |
| Bridge | `bridge/` | Our backend (detection, relay, latency log) | 8787 (HTTP + WebSocket `/ws`) |
| Phone stand-in | `bridge/public/phone.html` | The Device Access Toolkit phone app (camera, pinch, speech) | served by the bridge at `/phone` |

Later the real Android toolkit app replaces the phone stand-in and calls the same `/detect` endpoint.

## Phone → bridge: `POST /detect` (JSON)
```json
{ "reqId": "uuid", "imageBase64": "<jpeg, no data: prefix> | null", "question": "optional text",
  "forceObjectId": "optional id from objects.json (skips the model)", "t_capture": 1731500000000 }
```
Response: the same `show` message the glasses get (below), plus `timings`.

`t_*` are `Date.now()` ms epoch from the sender's clock (same laptop, so comparable).

## Bridge → glasses (WebSocket `/ws`, JSON text frames)
| type | fields | glasses does |
|---|---|---|
| `detecting` | `reqId`, `t_sent` | Shows a "Looking…" state at once |
| `show` | `reqId`, `objectId` (id or `unknown`), `label`, `confidence` 0-1, `question?`, `answer?` (model text, used for `unknown` or to answer a specific question), `timings` {`t_capture`,`t_received`,`t_detected`,`detectMs`,`model`}, `t_sent` | Opens that object's explainer at step 1. `unknown` shows `answer` text with no animation |
| `nav` | `action`: `next` \| `prev` \| `deeper` \| `done` \| `left` \| `right` | Same as the D-pad/pinch on the glasses (lets the phone stand-in drive the demo like a Neural Band) |
| `clear` | — | Clears the display (wearer said "done") |
| `device` | `state`: `donned` \| `doffed` \| `battery_low` \| `thermal_hot` \| `offline` \| `online` \| `camera_denied` | Shows the matching status card; `doffed` blanks the display |
| `error` | `code`, `message` | Short error card, auto-dismiss 4 s |

## Glasses → bridge
| type | fields | bridge does |
|---|---|---|
| `hello` | `client`: `"glasses"`, `ua` | Registers the glasses client |
| `rendered` | `reqId`, `t_rendered` (first frame of the scene painted) | Logs end-to-end latency, forwards to phone page as `latency` |
| `state` | `objectId`, `step`, `param?` | Forwarded to the phone page so it can mirror what the wearer sees |

## Bridge → phone page (same `/ws`, after `hello` with `client: "phone"`)
`latency` { `reqId`, `objectId`, `captureToReceivedMs`, `detectMs`, `detectedToRenderedMs`, `totalMs` } and the glasses' `state` messages.

## Latency log
The bridge appends every completed request as one JSON line to `bridge/latency.jsonl` (git-ignored) and serves a summary at `GET /latency` (count, p50, p90 per stage).
