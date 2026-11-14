#!/usr/bin/env bash
# Collect WonderWhy raw footage in one place (not git): ~/Videos/wonderwhy/raw/<who>/
#   ./ingest.sh adb [days]        pull videos from the Android phone on USB (default: last 2 days) -> raw/icefrost
#   ./ingest.sh sort <who> [dir]  move videos from a folder (default ~/Downloads, where LocalSend saves) -> raw/<who>
#   ./ingest.sh index             write raw/INDEX.md (who, file, time, duration, size, fps, codec, HDR)
set -euo pipefail
RAW="${WONDERWHY_RAW:-$HOME/Videos/wonderwhy/raw}"
VIDEXT='mp4|mov|m4v|MP4|MOV|M4V'
mkdir -p "$RAW"

cmd="${1:-index}"; shift || true
case "$cmd" in
  adb)
    days="${1:-2}"; dst="$RAW/icefrost"; mkdir -p "$dst"
    adb get-state >/dev/null 2>&1 || { echo "No phone: plug in USB, allow USB debugging, check 'adb devices'"; exit 1; }
    n=0
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      b="$(basename "$f")"
      if [ -e "$dst/$b" ]; then continue; fi
      echo "pull $b"; adb pull -a "$f" "$dst/$b" >/dev/null; n=$((n+1))
    done < <(adb shell "find /sdcard/DCIM /sdcard/Movies /sdcard/Download -type f -mtime -$days 2>/dev/null" | tr -d '\r' | grep -E "\.($VIDEXT)$" || true)
    echo "pulled $n new file(s) -> $dst"
    ;;
  sort)
    who="${1:?who (icefrost|mrnetwork|friend)}"; src="${2:-$HOME/Downloads}"; dst="$RAW/$who"; mkdir -p "$dst"
    find "$src" -maxdepth 2 -type f -newermt '2026-11-13' -regextype posix-extended -iregex ".*\.($VIDEXT)$" -print0 |
      while IFS= read -r -d '' f; do mv -n "$f" "$dst/" && echo "moved $(basename "$f")"; done
    ;;
  index)
    out="$RAW/INDEX.md"
    {
      echo "# WonderWhy raw footage ($(date '+%a %d %b %H:%M'))"; echo
      echo "| Who | File | Shot at | Dur s | MB | Res | fps | Codec | HDR |"
      echo "|---|---|---|---|---|---|---|---|---|"
      find "$RAW" -mindepth 2 -type f -regextype posix-extended -iregex ".*\.($VIDEXT)$" | sort | while IFS= read -r f; do
        who="$(basename "$(dirname "$f")")"
        j="$(ffprobe -v quiet -print_format json -show_format -show_streams -select_streams v:0 "$f" || echo '{}')"
        python3 - "$who" "$f" "$j" <<'PY'
import json, os, sys
who, f, j = sys.argv[1], sys.argv[2], json.loads(sys.argv[3] or '{}')
s = (j.get('streams') or [{}])[0]; fm = j.get('format', {})
tags = fm.get('tags', {})
t = tags.get('com.apple.quicktime.creationdate') or tags.get('creation_time', '')
num, _, den = (s.get('avg_frame_rate') or '0/1').partition('/')
fps = round(float(num) / float(den or 1), 2) if float(den or 1) else 0
rot = ''
for sd in s.get('side_data_list', []) or []:
    if 'rotation' in sd: rot = f" r{sd['rotation']}"
hdr = s.get('color_transfer', '') in ('smpte2084', 'arib-std-b67')
print(f"| {who} | {os.path.basename(f)} | {t[:19].replace('T',' ')} | {float(fm.get('duration',0)):.1f} | "
      f"{int(fm.get('size',0))/1e6:.0f} | {s.get('width','?')}x{s.get('height','?')}{rot} | {fps} | {s.get('codec_name','?')} | {'HDR' if hdr else ''} |")
PY
      done
    } > "$out"
    echo "wrote $out ($(($(wc -l < "$out")-4)) clips)"
    ;;
  *) echo "usage: $0 adb [days] | sort <who> [dir] | index"; exit 2;;
esac
