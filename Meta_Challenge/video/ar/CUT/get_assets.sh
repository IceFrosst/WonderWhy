#!/usr/bin/env bash
# Copy the finished composites the rough cut uses from the animation branch into CUT/assets/ (not in git).
set -euo pipefail
cd "$(dirname "$0")"; mkdir -p assets
B=origin/claude/confident-keller-pxs2tu
git fetch -q origin claude/confident-keller-pxs2tu
for f in act3_earbuds/final/V3_air.mp4 act5_bike/final/B1_airflow.mp4; do
  git show "$B:Meta_Challenge/video/$f" > "assets/$(basename "$f")"; echo "assets/$(basename "$f")"
done
