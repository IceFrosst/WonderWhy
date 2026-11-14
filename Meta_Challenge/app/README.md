# Physics Lens: simulator test rig

Look at an object, pinch, see the physics inside it. 7 objects are **prerendered** (content and scenes ship in the app), so the demo works even if the model or Wi-Fi is slow. Each object has several **lenses** (Motion, Inside, Cutaway, Zoom, What if, Compare, Flow, The number): swipe left/right changes lens, pinch goes deeper, up/down changes the one thing that step lets you vary.

| Where things live | |
|---|---|
| Explanation text, lenses, drawing data | [shared/objects.json](shared/objects.json): one source for the glasses app, the bridge and the phone app |
| Visual direction | [shared/DESIGN.md](shared/DESIGN.md) |
| Contract (auth, `/detect`, `/last`, WebSocket frames) | [shared/PROTOCOL.md](shared/PROTOCOL.md) |
| Stills and clips for the phone-app-only route | `bridge/media/` (made by `npm run export:media` in `glasses/`), served at `/media/` |
| Lock the live bridge, add the model key | [deploy/README.md](deploy/README.md) "Lock it" |

| Part | Folder | Stands in for |
|---|---|---|
| Glasses Web App | [glasses/](glasses/) | The app on the Ray-Ban Display |
| Bridge | [bridge/](bridge/) | Our backend: detection, relay, latency log. Also serves the built glasses app at `/` |
| Phone page | `bridge/public/phone.html` at `/phone` | The toolkit phone app: webcam, pinch, wristband, device states |

Contract: [shared/PROTOCOL.md](shared/PROTOCOL.md). Object library: [shared/objects.json](shared/objects.json).

## Live server (for real-glasses testing)
| What | URL |
|---|---|
| Glasses app | https://lens.167-71-139-39.sslip.io/ (install with [deploy/install-qr.png](deploy/install-qr.png)) |
| Phone page | https://lens.167-71-139-39.sslip.io/phone |
| Latency | https://lens.167-71-139-39.sslip.io/latency |
| Toolkit app endpoint | `POST https://lens.167-71-139-39.sslip.io/detect` (send `preUploadMs`, see [shared/PROTOCOL.md](shared/PROTOCOL.md)) |

Hosted on the athena droplet next to Athena; deploy and ops notes in [deploy/README.md](deploy/README.md). Update with `deploy/deploy.sh`.

## Run locally
```bash
cd glasses && npm install && npm run build
cd ../bridge && npm install && npm start
```
- Glasses: http://localhost:8787/ (put it in Chrome with the Meta Display Simulator extension on)
- Phone: http://localhost:8787/phone (Space = pinch; force-object buttons work without a model key)
- Latency: http://localhost:8787/latency
- Real detection: copy `bridge/.env.example` to `bridge/.env` and add `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`. Never commit `.env`.
- Glasses keys: arrows = D-pad, Enter = pinch, Esc = back.

## Measured (13 Nov, laptop, headless Chrome)
| What | Result |
|---|---|
| All 5 scenes | 30 fps |
| Ball trajectory while changing angle/speed live, and with air drag | 30 fps |
| Bridge identified → scene painted on glasses | ~50 ms |
| First load (14 Nov, 7 objects, 8 lens kinds) | 212 KB gzipped (194 JS + 18 CSS), 5 requests (limit 300 KB, 15) |
| Meta test gate | Passes |
| Detection accuracy, dev stand-in (14 Nov 01:50 UTC, desktop, 7-object library) | **18 of 18** photos right: 2 each of guitar, ball, bicycle, kettle, keys, phone, spoon, and 4 unrelated objects answered "unknown". Provider `claude` stand-in (Claude Haiku through the local command line), longest side 896 px, 1 run each. Freely licensed test photos from Wikimedia Commons, not in git (`bridge/samples/SOURCES.md` on the test machine lists them) |
| Detection time, dev stand-in | p50 5.8 s, p90 7.8 s. This is the stand-in's process start, **not** the demo provider's speed |
| Detection time and accuracy on Gemini | Not measured yet (no `GEMINI_API_KEY` on a test machine). Run `npm run bench` in bridge/ with the key set |
| Photo glasses → phone over Bluetooth | Can't be simulated; use the delay slider, measure on real glasses |
