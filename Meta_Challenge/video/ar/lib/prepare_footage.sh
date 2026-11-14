#!/usr/bin/env bash
# Build the footage folder the AR pages read (config.footage.<key>.raw = a file name in it), straight from git:
# DemoVideos/Objects/ on origin/main and DemoVideos/ on origin/friend-next. Nothing is checked out or committed.
# Every clip becomes SDR, portrait, H.264 at the same size, so the pages' relative `vf` crops work everywhere.
#   lib/prepare_footage.sh                 -> ~/Videos/wonderwhy/ar  at 2160x3840 (PC)
#   lib/prepare_footage.sh <dir> 1080      -> <dir> at 1080x1920 (laptop proxies)
# Then render with: WONDERWHY_RAW=<dir> node lib/render.mjs V01
set -euo pipefail
OUT="${1:-$HOME/Videos/wonderwhy/ar}"; W="${2:-2160}"; H=$((W * 16 / 9))
REPO="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
TMP="$OUT/.src"; mkdir -p "$OUT" "$TMP"
git -C "$REPO" fetch -q origin main friend-next
SDR="scale=${W}:${H}:flags=lanczos,format=yuv420p"
HLG="zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,${SDR}"
grab() { [ -s "$TMP/$2" ] || git -C "$REPO" show "$1" > "$TMP/$2"; }
enc() { # enc <src in TMP> <out name>
  [ -s "$OUT/$2" ] && { echo "have $2"; return; }
  local tr; tr="$(ffprobe -v error -select_streams v:0 -show_entries stream=color_transfer -of csv=p=0 "$TMP/$1" | tr -d '\r')"
  tr="${tr%%,*}" # some ffprobe builds (Windows) print "bt709," plus CR: keep the bare name or HDR is missed
  local vf="$SDR"; [ "$tr" = "arib-std-b67" ] || [ "$tr" = "smpte2084" ] && vf="$HLG"
  # write to a temp name first, so an interrupted run never leaves a half file that the next run skips as done
  ffmpeg -v error -y -i "$TMP/$1" -an -vf "$vf" -c:v libx264 -preset medium -crf 16 -movflags +faststart -f mp4 "$OUT/.part-$2"
  mv -f "$OUT/.part-$2" "$OUT/$2"
  echo "made $2 ($tr)"
}
for f in printer_1_core_one.mp4 printer_2_side_by_side.mp4 share_scene_glasses_friend.mp4 sauna.mp4 gym_air_bike.mp4; do
  grab "origin/main:DemoVideos/Objects/$f" "$f"; enc "$f" "$f"
done
for f in IMG_5543.MOV IMG_5544.MOV IMG_5545.MOV IMG_5546.MOV IMG_5556.MOV IMG_5557.MOV IMG_5560.MOV IMG_5561.MOV; do
  grab "origin/friend-next:DemoVideos/$f" "$f"; enc "$f" "$f"
done
for f in IMG_5554.MOV A001_11141614_C103.MOV; do
  grab "origin/friend-next:DemoVideos/New/$f" "$f"; enc "$f" "$f"
done
for base in "A001_11141516_C098 2" "A001_11141518_C099 2" "A001_11141519_C100"; do # split in two parts on GitHub
  grab "origin/friend-next:DemoVideos/New/$base part0.MOV" "$base part0.MOV"
  grab "origin/friend-next:DemoVideos/New/$base part1.MOV" "$base part1.MOV"
  if [ ! -s "$TMP/$base.MOV" ]; then
    printf "file '%s'\nfile '%s'\n" "$base part0.MOV" "$base part1.MOV" > "$TMP/concat.txt"
    (cd "$TMP" && ffmpeg -v error -y -f concat -safe 0 -i concat.txt -c copy "$base.MOV")
  fi
  enc "$base.MOV" "$base.MOV"
done
echo "footage ready in $OUT"
