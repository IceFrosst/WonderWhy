# Physics Lens: simulator test rig

Look at an object, pinch, see the physics inside it. 5 objects are **prerendered** (content and scenes ship in the app), so the demo works even if the model or Wi-Fi is slow.

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
| First load | ~182 KB gzipped, 4 requests (limit 300 KB, 15) |
| Meta test gate | Passes |
| Model detection time | Not measured yet (needs an API key; run `npm run bench` in bridge/) |
| Photo glasses → phone over Bluetooth | Can't be simulated; use the delay slider, measure on real glasses |
