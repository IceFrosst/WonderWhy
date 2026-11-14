#!/usr/bin/env bash
# Smoke test of the Physics Lens phone app on a running emulator (or USB phone), no instrumentation:
# build, install, grant permissions, launch, then walk the core demo path by finding controls by their text
# in `uiautomator dump` (never by coordinates):
#   open Developer -> Connect glasses (mock) -> consent card (first photo) -> Not now -> demo data on
#   -> Pinch (overview) -> "Seen today" lists "Thrown ball" -> Pinch (step 1) -> Right (next lens) -> Back (overview)
#   -> Back (idle) -> Disconnect.
# What the glasses show is read from the glasses mirror's content description "Glasses show: ..." (a text
# mirror of the glasses card).
# Exits non-zero with a clear message when an expected text does not appear, or the app crashes (FATAL).
#
# Usage: tools/emulator_smoke.sh            (SKIP_BUILD=1 to reuse the last APK, ANDROID_SERIAL to pick a device)
# Needs: JDK 17, Android SDK platform-tools, python3, one booted device. Clears the app's data first.
set -euo pipefail

cd "$(dirname "$0")/.."
if [ -z "${JAVA_HOME:-}" ]; then JAVA_HOME=$(ls -d "$HOME"/.local/opt/zulu17*/Contents/Home 2>/dev/null | head -1 || true); fi
ANDROID_HOME=${ANDROID_HOME:-$HOME/Android/Sdk}
export JAVA_HOME ANDROID_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

PKG=com.junction2026.lens
APK=app/build/outputs/apk/debug/app-debug.apk
TIMEOUT=${SMOKE_TIMEOUT:-20}
WORK=$(mktemp -d "${TMPDIR:-/tmp}/lens_smoke.XXXXXX")
XML="$WORK/ui.xml"
STEP="start"

fail() {
    echo "FAIL [$STEP]: $*" >&2
    adb exec-out screencap -p > "$WORK/fail.png" 2>/dev/null && echo "  screenshot: $WORK/fail.png" >&2
    if [ -s "$XML" ]; then
        echo "  texts on screen:" >&2
        python3 - "$XML" <<'PY' >&2 || true
import sys, xml.etree.ElementTree as E
for n in E.parse(sys.argv[1]).getroot().iter('node'):
    t = n.get('text')
    if t: print('    ' + t[:160])
PY
    fi
    exit 1
}

command -v adb >/dev/null || fail "adb not found (ANDROID_HOME=$ANDROID_HOME)"
command -v python3 >/dev/null || fail "python3 not found"
if [ -z "${ANDROID_SERIAL:-}" ]; then
    ANDROID_SERIAL=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1; exit }')
fi
[ -n "${ANDROID_SERIAL:-}" ] || fail "no device: start the emulator first (adb devices is empty)"
export ANDROID_SERIAL
echo "device: $ANDROID_SERIAL"

read -r SCREEN_W SCREEN_H < <(adb shell wm size | awk -F'[ x]' '/Physical size/ { print $3, $4 }')
MID_X=$((SCREEN_W / 2))

# ---- helpers ----

dump() {
    # uiautomator sometimes fails while the screen is changing: retry a few times.
    for _ in 1 2 3; do
        if adb shell uiautomator dump /sdcard/lens_smoke.xml >/dev/null 2>&1 && adb shell cat /sdcard/lens_smoke.xml > "$XML" 2>/dev/null \
            && grep -q "<hierarchy" "$XML"; then return 0; fi
        sleep 0.5
    done
    fail "uiautomator dump failed"
}

# Prints "x y" of the first visible node whose text equals $1 (or starts with it when $2 = prefix).
find_node() {
    python3 - "$XML" "$1" "${2:-exact}" <<'PY'
import re, sys, xml.etree.ElementTree as E
root = E.parse(sys.argv[1]).getroot()
want, mode = sys.argv[2], sys.argv[3]
for n in root.iter('node'):
    t = n.get('text') or ''
    if t == want or (mode == 'prefix' and t.startswith(want)):
        x1, y1, x2, y2 = map(int, re.findall(r'\d+', n.get('bounds')))
        if y2 - y1 > 10:
            print((x1 + x2) // 2, (y1 + y2) // 2)
            break
PY
}

# Prints the "checked" attribute of the node with text $1.
checked_of() {
    python3 - "$XML" "$1" <<'PY'
import sys, xml.etree.ElementTree as E
for n in E.parse(sys.argv[1]).getroot().iter('node'):
    if n.get('text') == sys.argv[2]:
        print(n.get('checked')); break
PY
}

scroll_top() {
    for _ in 1 2 3; do adb shell input swipe "$MID_X" $((SCREEN_H / 4)) "$MID_X" $((SCREEN_H * 9 / 10)) 150; done
    sleep 0.8
}

scroll_down() {
    adb shell input swipe "$MID_X" $((SCREEN_H * 7 / 10)) "$MID_X" $((SCREEN_H * 4 / 10)) 400
    sleep 0.8
}

check_alive() {
    if adb logcat -d -b crash 2>/dev/null | grep -q "FATAL EXCEPTION"; then
        adb logcat -d -b crash | grep -A12 "FATAL EXCEPTION" | head -20 >&2
        fail "the app crashed (FATAL EXCEPTION in logcat)"
    fi
    adb shell pidof "$PKG" >/dev/null 2>&1 || fail "the app is not running any more"
}

# Scrolls until a node with text $1 is on screen and taps it.
tap_text() {
    local c=""
    for i in 1 2 3 4 5 6 7 8; do
        dump
        c=$(find_node "$1" "${2:-exact}")
        if [ -n "$c" ]; then
            # shellcheck disable=SC2086
            adb shell input tap $c
            sleep 0.6
            return 0
        fi
        if [ "$i" = 1 ]; then scroll_top; else scroll_down; fi
    done
    fail "control \"$1\" not found on screen"
}

# Waits until the glasses mirror line ("Glasses show: ...") contains every argument.
wait_glasses() {
    local deadline=$((SECONDS + TIMEOUT)) line=""
    while [ $SECONDS -lt $deadline ]; do
        check_alive
        dump
        line=$(python3 - "$XML" <<'PY'
import sys, xml.etree.ElementTree as E
for n in E.parse(sys.argv[1]).getroot().iter('node'):
    t = n.get('content-desc') or n.get('text') or ''
    if t.startswith('Glasses show:'):
        print(t); break
PY
)
        if [ -z "$line" ]; then scroll_top; continue; fi
        local ok=1
        for want in "$@"; do case "$line" in *"$want"*) ;; *) ok=0 ;; esac; done
        if [ $ok = 1 ]; then echo "  ok: $line" | cut -c1-150; return 0; fi
        sleep 1
    done
    fail "glasses never showed: $* (last: ${line:-none})"
}

# Scrolls from the top until a node with text $1 is on screen, then (if given) one with text $2 below it.
# Prints "x y" of the second (or first) node. Fails when it never shows up.
find_below() {
    local i
    for i in 1 2 3 4 5 6 7 8; do
        if [ "$i" = 1 ]; then scroll_top; else scroll_down; fi
        check_alive
        dump
        local c
        c=$(python3 - "$XML" "$1" "${2:-}" <<'PY'
import re, sys, xml.etree.ElementTree as E
root = E.parse(sys.argv[1]).getroot()
head, want = sys.argv[2], sys.argv[3]
def box(n): return list(map(int, re.findall(r'\d+', n.get('bounds'))))
top = None
for n in root.iter('node'):
    if (n.get('text') or '') == head:
        b = box(n)
        if b[3] - b[1] > 10: top = b[1]; break
if top is not None:
    if not want:
        print(0, top)
    else:
        for n in root.iter('node'):
            b = box(n)
            if (n.get('text') or '') == want and b[1] > top and b[3] - b[1] > 10:
                print((b[0] + b[2]) // 2, (b[1] + b[3]) // 2); break
PY
)
        if [ -n "$c" ]; then echo "$c"; return 0; fi
    done
    fail "\"$2\" never showed under \"$1\""
}

# Waits until a node with text $1 is on screen (no scrolling).
wait_text() {
    local deadline=$((SECONDS + TIMEOUT))
    while [ $SECONDS -lt $deadline ]; do
        check_alive
        dump
        [ -n "$(find_node "$1")" ] && return 0
        sleep 1
    done
    fail "\"$1\" never appeared"
}

step() { STEP="$1"; echo "- $1"; }

# ---- build, install, launch ----

step "build"
if [ "${SKIP_BUILD:-0}" != 1 ]; then ./gradlew --no-daemon -q assembleDebug || fail "gradle assembleDebug failed"; fi
[ -f "$APK" ] || fail "no APK at $APK"

step "install"
adb install -r "$APK" >/dev/null || fail "adb install failed"
adb shell am force-stop "$PKG"
adb shell pm clear "$PKG" >/dev/null || fail "pm clear failed" # known start: consent not given, demo data off, mock on
for p in CAMERA BLUETOOTH_CONNECT; do adb shell pm grant "$PKG" "android.permission.$p" || fail "could not grant $p"; done
adb logcat -G 16M >/dev/null 2>&1 || true # uiautomator dumps are chatty; keep room for a crash trace
adb logcat -c

step "launch"
adb shell am start -W -n "$PKG/.MainActivity" >/dev/null || fail "am start failed"
sleep 2
check_alive
wait_text "Connect glasses"

step "open the Developer section (switches)"
tap_text "Developer  ▸" # collapsed after pm clear (the default bridge URL is set)
wait_text "Mock glasses (no hardware)"
dump
[ "$(checked_of 'Mock glasses (no hardware)')" = "true" ] || tap_text "Mock glasses (no hardware)"
dump
[ "$(checked_of 'Mock glasses (no hardware)')" = "true" ] || fail "Mock glasses switch is not on"

step "connect (mock glasses)"
tap_text "Connect glasses"
wait_glasses "Physics Lens" "Look at something and pinch"

step "first photo asks for consent"
tap_text "Explain what I see"
wait_glasses "Before you start" "[Agree / Not now]"

step "Back = Not now: idle again"
tap_text "Back"
wait_glasses "Physics Lens" "Look at something and pinch"

step "demo data on"
dump
[ "$(checked_of 'Demo data (no bridge)')" = "true" ] || tap_text "Demo data (no bridge)"
dump
[ "$(checked_of 'Demo data (no bridge)')" = "true" ] || fail "Demo data switch is not on"

step "pinch: ball overview"
tap_text "Pinch"
wait_glasses "Thrown ball" "[Show steps]"

step "Seen today lists the ball"
find_below "Seen today" "Thrown ball" >/dev/null
echo "  ok: \"Thrown ball\" under \"Seen today\""

step "pinch: step 1"
tap_text "Pinch"
wait_glasses "Thrown ball" "Step 1/3." "●○ Projectile motion" "[Next]"

step "right: next lens"
tap_text "Right"
wait_glasses "Step 1/3." "○● Bounce"

step "back: overview"
tap_text "Back"
wait_glasses "Thrown ball" "[Show steps]"

step "back: idle"
tap_text "Back"
wait_glasses "Physics Lens" "Look at something and pinch"

step "disconnect"
tap_text "Disconnect"
sleep 1
check_alive

rm -rf "$WORK"
echo "PASS: smoke walk done on $ANDROID_SERIAL"
