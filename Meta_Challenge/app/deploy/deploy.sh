#!/usr/bin/env bash
# Build the glasses app, ship app to the athena droplet, rebuild and restart the lens-bridge container.
# Usage: ./deploy.sh   (run from anywhere; needs SSH to root@HOST)
set -euo pipefail
HOST=${HOST:-root@167.71.139.39}
APP="$(cd "$(dirname "$0")/.." && pwd)"
(cd "$APP/glasses" && npm run build >/dev/null 2>&1)
ssh "$HOST" 'mkdir -p /opt/lens/app/glasses /opt/lens/data'
rsync -az --delete \
  --exclude node_modules --exclude .env --exclude latency.jsonl --exclude samples --exclude test \
  "$APP/shared" "$APP/bridge" "$APP/deploy" "$HOST:/opt/lens/app/"
rsync -az --delete "$APP/glasses/dist/" "$HOST:/opt/lens/app/glasses/dist/"
ssh "$HOST" 'set -e
  mkdir -p /opt/lens/data
  cd /opt/lens/app && docker build -q -f deploy/Dockerfile -t lens-bridge:latest . >/dev/null
  docker rm -f lens-bridge >/dev/null 2>&1 || true
  docker run -d --name lens-bridge --restart unless-stopped --network website_default \
    -v /opt/lens/data:/data lens-bridge:latest >/dev/null
  sleep 1; docker exec lens-bridge wget -qO- http://localhost:8787/health'
echo
echo "Live: https://lens.167-71-139-39.sslip.io/  (phone: /phone)"
