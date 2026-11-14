#!/usr/bin/env bash
# Variant A "Drawn memory": render to ../out/A.mp4 + ../out/A_sheet.png  (./render.sh --at 0,1.2,4.2 for stills)
set -euo pipefail
cd "$(dirname "$0")/.."
exec node lib/render.mjs A "$@"
