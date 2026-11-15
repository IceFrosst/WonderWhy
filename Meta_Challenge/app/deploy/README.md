# Deploy (athena droplet)

The bridge and the built glasses app run as one container, `lens-bridge`, on the athena droplet (167.71.139.39). It sits next to Athena's own stack and shares Athena's Caddy for HTTPS.

| Item | Where |
|---|---|
| Public URL | https://lens.167-71-139-39.sslip.io/ (glasses app), `/phone`, `/latency`, `/detect`, `/ws` |
| Container | `lens-bridge`, on Docker network `website_default`, restart unless-stopped |
| App files | `/opt/lens/app` |
| Secrets and logs | `/opt/lens/data/.env` (API keys, never in git), `/opt/lens/data/latency.jsonl` |
| HTTPS | One site block appended to `/opt/athena/website/Caddyfile` (see `Caddyfile.lens`). Backup: `Caddyfile.bak-lens` |

- Deploy or update: `./deploy.sh`
- **Install on the glasses:** Meta AI app v272+ with Developer Mode on (tap the app version 5 times). Scan [install-qr.png](install-qr.png) with the **phone** camera; it opens Meta AI and adds "Physics Lens" to the glasses. Deep link: `fb-viewapp://web_app_deep_link?appName=Physics%20Lens&appUrl=https%3A%2F%2Flens.167-71-139-39.sslip.io%2F`
- Add a model key: `ssh root@167.71.139.39 'echo ANTHROPIC_API_KEY=... >> /opt/lens/data/.env && docker restart lens-bridge'`
- Logs: `ssh root@167.71.139.39 docker logs -f lens-bridge`
- Remove: delete the lens block from Athena's Caddyfile, `docker exec website-caddy-1 caddy reload --config /etc/caddy/Caddyfile`, then `docker rm -f lens-bridge`.
- Caveat: because `lens-bridge` joins Athena's network, `docker compose down` in `/opt/athena/website` will warn that the network is still in use. Containers still stop and `up` still works.

## Lock it, then add the model key (humans, in this order)
The bridge refuses to start with an Anthropic or Gemini provider and no token. Set the token before adding a model key; `LENS_ALLOW_OPEN=1` is an explicit emergency override, not the deployment default. The bridge on `main` has auth (see [PROTOCOL](../shared/PROTOCOL.md) "v1 additions"). **Live state (15 Nov, 03:54 UTC): OPEN for judging, on owner request.** `LENS_TOKEN` is commented out and `LENS_ALLOW_OPEN=1` is set in `/opt/lens/data/.env` (backup `.env.bak-before-open-20261115-035353`), container restarted, same image. Anyone can use `/emulator`, `/phone` and `/` without a token; every detect spends Gemini credit (MAX_INFLIGHT 4, plus a per-IP rate limit on recognition). The bridge will be re-locked after judging. Re-lock: restore the backup `.env` and `docker restart lens-bridge`; `/health` must show `"auth":true`.

**Deployed 15 Nov 06:12 local from `main` d615e15** (Alex's live 3D screen, six demo objects): bridge 93/93, glasses build OK, local mock smoke OK. Rollback: image `lens-bridge:rollback-20261115-061115`, files `/opt/lens/app.bak-20261115-061115`.

| # | Do | Check |
|---|---|---|
| 1 | `./deploy.sh` from a machine whose SSH key is on the droplet | `curl https://lens.167-71-139-39.sslip.io/health` shows `"auth":false` (new code, not locked yet) |
| 2 | Make a token: `openssl rand -hex 16`. Share it with the team **outside git** | |
| 3 | `ssh root@167.71.139.39 'echo LENS_TOKEN=<token> >> /opt/lens/data/.env && docker restart lens-bridge'` | `/health` shows `"auth":true`; `curl -X POST .../detect -d "{}"` gives 401 |
| 4 | Only now add `GEMINI_API_KEY=...` the same way and restart | `/health` shows `"provider":"gemini"` |
| 5 | Open the phone tool once with the key: `https://lens.167-71-139-39.sslip.io/phone#k=<token>`. The page keeps it, removes it from the address, and passes it to its glasses preview as a fragment | Phone tool connects |
| 6 | Glasses install link: use the same fragment form, `https://lens.167-71-139-39.sslip.io/#k=<token>`, as `appUrl` (URL-encoded). **Do not commit a QR that contains the token**: make it locally and show it on a screen | Native glasses-app `#k=` parsing is tracked separately because that app is outside the bridge review files; keep legacy `?k=` only until it lands |
| 7 | Android app: Settings, "Bridge token" | A photo returns a card |

Without the key in the address the Web App shows "Bridge locked" and the built-in demos still work.
