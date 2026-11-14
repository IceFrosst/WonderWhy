# Bridge protocol (v1)

Three parts run on the laptop for simulator testing:

| Part | Folder | Stands in for | Port |
|---|---|---|---|
| Glasses Web App | `glasses/` | The app on the Ray-Ban Display | Vite preview 4173 (dev 5173) |
| Bridge | `bridge/` | Our backend (detection, relay, latency log) | 8787 (HTTP + WebSocket `/ws`) |
| Phone stand-in | `bridge/public/phone.html` | The Device Access Toolkit phone app (camera, pinch, speech) | served by the bridge at `/phone` |

Later the real Android toolkit app replaces the phone stand-in and calls the same `/detect` endpoint.

## Phone → bridge: `POST /detect` (JSON)
```json
{ "reqId": "uuid", "imageBase64": "<jpeg, no data: prefix> | null", "question": "optional text", "focusBase64": "<jpeg> | omitted",
  "forceObjectId": "optional id from objects.json (skips the model)", "t_capture": 1731500000000,
  "preUploadMs": 820 }
```
Response: the same `show` message the glasses get (below), plus `timings`.

**Aim (optional `focusBase64`):** a JPEG of the centre of the photo (the Android app sends the middle 50% of each side). When present, the model gets both images and classifies what is in the centre crop, using the full photo only for context. Tested 14 Nov: with a small kettle in the centre and a big guitar at the edge, one image gives "guitar" 3 of 3 times and two images give "kettle" 3 of 3. A prompt telling the model to prefer the centre is not enough by itself. Senders that omit the field behave as before.

`t_*` are `Date.now()` ms epoch from the sender's clock. Clocks on the phone, server and glasses differ, so **latency is never computed across clocks**: the phone sends `preUploadMs` (capture → request sent, on its own clock, e.g. the glasses → phone Bluetooth photo transfer), and the server times `detectMs` and detected → `rendered` ack arrival on its own clock.

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

## v1 additions (14 Nov, overnight). Fields are only ever added, never renamed or removed.

### Auth (`LENS_TOKEN`)
| Item | Rule |
|---|---|
| Server setting | `LENS_TOKEN` in the bridge's `.env`. **Unset = no auth** (local dev, tests). `/health` reports `auth: true/false`, never the token |
| Protected HTTP | `POST /detect`, `GET /last`, `GET /latency`: header `X-Lens-Token: <token>`. Wrong or missing gives `401 {"error":"unauthorized"}` |
| Open HTTP | `GET /health`, `GET /objects`, `GET /phone` (the page only; its calls need the token), the static glasses app, `/media/*` |
| WebSocket | `hello` carries `token`. Wrong or missing: the bridge sends `{type:"error",code:"unauthorized"}` and closes with code `4401`. A socket with no valid `hello` within 5 s is closed. Nothing is relayed before `hello` |
| Glasses Web App and phone page | Read the token once from `?k=<token>`, keep it in `localStorage` (`lens.token`), strip `k` from the address bar. On `4401` they show "Bridge locked: open the link with the key" and stop reconnecting |
| Android | "Bridge token" in settings, sent as the header |
| CORS | No token set: `*` (dev). Token set: only the bridge's own origin plus the comma list in `LENS_ALLOWED_ORIGINS`. Allowed headers: `content-type, x-lens-token` |
| Never | The token in git, in a QR image in git, in logs, or in a status file |

### `show` (WebSocket and the `/detect` response): new optional fields
| Field | Meaning |
|---|---|
| `lowConfidence` | `true` when the model's `confidence` is under `MIN_CONFIDENCE` (default 0.6) for a library object. Clients **must not** open the scene; they show a "Not sure" card with `label` as the guess. Never set for forced objects or `unknown` |
| `summary` | The object's one-line answer (`answer` in `objects.json`) |
| `steps` | `string[]`: the captions of the object's first lens, in order. Enough for a phone card with more than one line |
| `lenses` | `[{ "id": "ball.motion", "kind": "motion", "title": "Projectile motion", "lead": "...", "steps": ["..."] }]`: every lens the object has, for lens buttons. `kind` is one of `motion, inside, cutaway, flow, zoom, whatif, compare, number` |
| `media` | `{ "base": "/media/ball", "lenses": { "ball.motion": { "stills": ["s1.png", "s2.png"], "clip": "clip.mp4" } } }` when exported stills and clips exist for the object (served open under `/media/`). Absent when none exist |
| `replay`, `ageMs` | Set on a `show` that is replayed from memory (see `/last`) |
| `standIn` | `true` when the answer came from a dev-only stand-in provider (`pi`, `claude`: a person's own model login on a dev machine). Clients show a "Stand-in model" tag. Never set on the droplet. `/health` carries the same flag |

Source of truth for `summary`, `steps` and `lenses` is `shared/objects.json` (`tagline`, `answer`, `chapters[]` with `scene, lens, title, lead?, hint, captions[]`). The glasses app reads the same file.

### `GET /last`
`200 {"show": <the last show message> | null, "ageMs": number | null}`. The bridge remembers the last `show` for `LAST_TTL_MS` (default 120 000) or until a `clear`. When a glasses client says `hello` inside that window, the bridge sends it that `show` again with `replay: true` and `ageMs`. This is the handover route: the phone app detects, then the Web App opens late and still lands on the scene. Low-confidence and `unknown` shows are replayed too.

### Heartbeat and timeouts
| What | Rule |
|---|---|
| App-level beat | The bridge sends `{type:"ping", t_sent}` to every client every `HEARTBEAT_MS` (default 10 000). Clients may answer `{type:"pong"}`; the bridge ignores it |
| Dead sockets | The bridge also sends WebSocket-level pings and terminates a socket that misses two beats |
| Web App | No frame for 25 s means the link is dead: it reconnects |
| `detecting` | Now carries `timeoutMs` (the bridge's detect timeout plus 2 000). The bridge always follows `detecting` with a `show` or an `error` for the same `reqId`. If neither arrives in `timeoutMs` (12 000 when absent), the Web App leaves "Looking…" by itself with a "Took too long" card |
| `error` | Now carries `reqId` when it belongs to a detect request. Codes: `detect_timeout`, `detect_failed`, `bad_image`, `unauthorized` |

### Lenses on the glasses (nav and state)
| What | Rule |
|---|---|
| `nav` actions | `left` / `right` now change **lens** (previous / next, wrapping). New actions `up` / `down` change the knob of the current step (the one thing that step lets you vary). `next` goes one step deeper and rolls into the next lens after the last step; `deeper`, `prev`, `done` as before |
| `state` (glasses to bridge to phone) | New fields: `lens` (kind, e.g. `flow`), `lensIndex` (0-based), `steps` (steps in this lens). `step` is now 1-based **inside the lens** |
| `objects.json` chapters | One chapter = one lens. Optional `knobs` (one per step: `{axis, label}` or `null`) and `spec` (drawing data for the data-driven scenes `flow` and `number`). The bridge never sends `spec` |

## Latency log
The bridge appends every completed request as one JSON line to `bridge/latency.jsonl` (git-ignored) and serves a summary at `GET /latency` (count, p50, p90 per stage).
