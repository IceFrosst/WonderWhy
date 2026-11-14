#!/usr/bin/env bash
# Variant C "Real grass + type": render to ../out/C.mp4 + ../out/C_sheet.png  (./render.sh --at 0,1.2,4.2 for stills)
set -euo pipefail
cd "$(dirname "$0")/.."
exec node lib/render.mjs C "$@"
