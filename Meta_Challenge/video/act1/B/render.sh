#!/usr/bin/env bash
# Variant B "Kinetic questions": render to ../out/B.mp4 + ../out/B_sheet.png  (./render.sh --at 0,1.2,4.2 for stills)
set -euo pipefail
cd "$(dirname "$0")/.."
exec node lib/render.mjs B "$@"
