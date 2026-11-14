#!/usr/bin/env bash
# Cut the two real clips variant C plays from the raw phone footage (read-only) into C/footage/ as 1920x1080 H.264.
# The raw files are 4K HEVC portrait (2160x3840 after rotation, 24 fps, SDR bt709), so a 16:9 window
# (2160x1215) is cropped at full width and scaled to 1920x1080: no upscaling, no blurred pad needed.
#   ./prepare_footage.sh            cut both clips
# Raw folder: $WONDERWHY_RAW (default ~/Videos/wonderwhy/raw), see ../../ingest.sh.
set -euo pipefail
cd "$(dirname "$0")"
RAW="${WONDERWHY_RAW:-$HOME/Videos/wonderwhy/raw}/mrnetwork"
mkdir -p footage
cut() { # cut <raw file> <in s> <dur s> <crop top px, 0..2625> <out name>
  [ -f "$RAW/$1" ] || { echo "missing $RAW/$1 (the page falls back to the labelled placeholder)"; return 0; }
  ffmpeg -v error -y -ss "$2" -t "$3" -i "$RAW/$1" -an \
    -vf "crop=2160:1215:0:$4,scale=1920:1080:flags=lanczos,format=yuv420p" \
    -c:v libx264 -preset slow -crf 14 -movflags +faststart "footage/$5"
  echo "footage/$5  <- $1  in=$2 s  dur=$3 s  crop top=$4"
}
# Act 1 warm plate: lying in the grass, holding a leaf up and looking at it; lush grass fills the frame.
cut A001_11141519_C100.MOV   13.4 4.4  720 b1_grass.mp4
# Act 2 grey beat: lying on the grass, phone in hand, earbuds in; the hand goes to the earbud, then over the eyes.
cut A001_11141516_C098_2.MOV 18.3 2.4 1250 earbuds_in_grass.mp4
