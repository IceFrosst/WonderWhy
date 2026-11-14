"""Insert (or replace) the guitar's Explore chapter as its first chapter in shared/objects.json.

Acoustic guitar (dreadnought) lying face up, cm. x along the strings (saddle x=0, nut x=65, neck to +x),
y up (top surface at y=0.4), z across (low E on the far side, -z).
Scale length 65 cm agrees with the number chapter: 2 x 0.65 m x 110 Hz = 143 m/s.

Run: python3 guitar_explore.py [R_MODEL]   (R_MODEL = the model radius render.mjs prints)
"""
import math, sys
from r3d_common import pt, r2, write_chapter, catmull_closed, resample_closed

SCALE = 65.0  # nut to saddle
R_MODEL = float(sys.argv[1]) if len(sys.argv) > 1 else 53.13  # renderer's model radius (printed by render.mjs)


def fret_x(n):
    return SCALE * 2 ** (-n / 12)  # distance from the saddle = vibrating length


def norm(v):
    L = math.sqrt(sum(c * c for c in v)) or 1
    return [c / L for c in v]


# ---- body outline: half-widths along x (dreadnought-like), neck joint at x=29.0 (fret 14), tail at x=-22.4
half = [(29.0, 0.0), (28.6, 4.8), (27.2, 9.2), (24.9, 12.3), (21.9, 14.1), (18.3, 14.6), (14.7, 14.0),
        (11.3, 12.7), (8.1, 12.0), (4.9, 12.4), (1.6, 14.0), (-2.3, 16.8), (-6.3, 18.9), (-10.5, 19.8),
        (-14.7, 19.3), (-18.3, 17.0), (-20.8, 13.0), (-22.1, 7.2), (-22.4, 0.0)]
control = [(x, -w) for x, w in half] + [(x, w) for x, w in reversed(half[1:-1])]
dense = catmull_closed(control, 40)
outline = resample_closed(dense, 32, bend=5.0)
top_outline = resample_closed(dense, 64, bend=5.0)


def offset_polygon(poly, d):
    """Move every vertex inward by d along the averaged edge normals."""
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)) / 2
    s = 1 if area > 0 else -1
    out = []
    for i in range(n):
        x0, z0 = poly[i - 1]
        x1, z1 = poly[i]
        x2, z2 = poly[(i + 1) % n]
        nx, nz = 0.0, 0.0
        for (ax, az), (bx, bz) in (((x0, z0), (x1, z1)), ((x1, z1), (x2, z2))):
            ex, ez = bx - ax, bz - az
            L = math.hypot(ex, ez) or 1
            nx += -ez / L * s
            nz += ex / L * s
        L = math.hypot(nx, nz) or 1
        out.append((x1 + nx / L * d, z1 + nz / L * d))
    return out


inner = offset_polygon(outline, 0.6)
# hollow wall: outer ring, then the inner ring backwards, joined at the tail (a zero-width slit)
wall = [[r2(x), r2(z)] for x, z in outline] + [[r2(x), r2(z)] for x, z in [inner[0]] + list(reversed(inner[1:]))]
assert len(wall) <= 64, len(wall)
top_shape = [[r2(x), r2(z)] for x, z in top_outline]

# ---- neck, strings
NECK_Y0, NECK_Y1 = -2.0, 1.0  # neck from y -2 to the fretboard surface at y 1
JOINT = 29.0


def neck_half(x):
    return 2.2 + (SCALE - x) / (SCALE - JOINT) * 0.6  # 4.4 cm wide at the nut, 5.6 at the body


neck_shape = [[JOINT, -neck_half(JOINT)], [SCALE, -neck_half(SCALE)], [SCALE, neck_half(SCALE)], [JOINT, neck_half(JOINT)]]
neck_shape = [[r2(x), r2(z)] for x, z in neck_shape]

NUT_Y, SADDLE_Y, SADDLE_X = 1.62, 1.95, 0.0
nut_z = [-1.8, -1.08, -0.36, 0.36, 1.08, 1.8]
sad_z = [-2.7, -1.62, -0.54, 0.54, 1.62, 2.7]


def string_at(i, x):
    """Point on string i (0 = low E, 1 = A) at x."""
    u = (x - SADDLE_X) / (SCALE - SADDLE_X)
    return pt(x, SADDLE_Y + (NUT_Y - SADDLE_Y) * u, sad_z[i] + (nut_z[i] - sad_z[i]) * u)


# the five other strings as one zigzag tube; points near the ends keep each run straight
zig = []
order = [0, 2, 3, 4, 5]
for k, i in enumerate(order):
    xs = [SADDLE_X, SADDLE_X + 0.25, SCALE - 0.25, SCALE]
    if k % 2:
        xs = list(reversed(xs))
    zig += [string_at(i, x) for x in xs]
assert len(zig) <= 64

A = 1
a_full = [string_at(A, SADDLE_X), string_at(A, SCALE)]
X5 = fret_x(5)  # 48.7 cm from the saddle
X12 = fret_x(12)  # 32.5 cm: the middle
a_short = [string_at(A, SADDLE_X), string_at(A, X5)]

# ---- headstock and pegs (tilted back 14 degrees, down)
TILT = 14
ct, st = math.cos(math.radians(TILT)), math.sin(math.radians(TILT))
HS_LEN = 18.0
hs_start = (SCALE + 0.3, 0.3)
hs_c = (hs_start[0] + HS_LEN / 2 * ct, hs_start[1] - HS_LEN / 2 * st)
HS_W = 8.4

# ---- cameras (render3d's orbit camera: FOV 26, zoom 1 = model radius fills 70% of the 464 px stage)
FOV = 26
STAGE_H = 464


def cam_dir(yaw, pitch):
    return (math.sin(math.radians(yaw)) * math.cos(math.radians(pitch)), math.sin(math.radians(pitch)),
            math.cos(math.radians(yaw)) * math.cos(math.radians(pitch)))


def cam_pos(cam):
    dist = R_MODEL * 600 / (0.7 * STAGE_H * cam["zoom"] * math.tan(math.radians(FOV / 2)))
    d = cam_dir(cam["yaw"], cam["pitch"])
    return [cam["target"][i] + d[i] * dist for i in range(3)], dist


def far_point(cam_xyz, p, m):
    """The camera-centred homothety: anything drawn at the image of p, scaled by m, looks exactly as at p, 1/m the size."""
    return pt(*[cam_xyz[i] + (p[i] - cam_xyz[i]) * m for i in range(3)])


B3 = {"yaw": -12, "pitch": 34, "zoom": 4.6, "target": string_at(A, 26.0)}
cam3, dist3 = cam_pos(B3)
# Strings vibrate across the beat-3 line of sight, so the motion shows as much as it can.
d3 = cam_dir(B3["yaw"], B3["pitch"])
SHAKE_AXIS = [r2(c) for c in norm([0.0, d3[2], -d3[1]])]

parts = [
    {"id": "body", "label": "Hollow box", "prim": "extrude", "shape": wall, "h": 10.0,
     "pos": [0, -5.0, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "top", "label": "Thin top", "prim": "extrude", "shape": top_shape, "h": 0.4,
     "pos": [0, 0.2, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 12, 0],
     "anim": {"shake": {"axis": [0, 1, 0], "amp": 0.45, "hz": 1.5}}},
    {"id": "hole", "label": "Sound hole", "prim": "torus", "r": 5.0, "tube": 0.3,
     "pos": [14.0, 0.45, 0], "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "top"},
    {"id": "bridge", "label": "Bridge", "prim": "extrude",
     "shape": [[-1.9, -0.4], [1.1, -0.4], [1.1, -1.25], [0.16, -1.25], [0.16, -1.95], [-0.16, -1.95], [-0.16, -1.25], [-1.9, -1.25]],
     "h": 15.0, "pos": [0, 0, 0], "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "top"},
    {"id": "neck", "label": "Neck", "prim": "extrude", "shape": neck_shape, "h": NECK_Y1 - NECK_Y0,
     "pos": [0, (NECK_Y0 + NECK_Y1) / 2, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "head", "label": "Headstock", "prim": "box", "size": [HS_LEN, 1.4, HS_W], "round": 0.5,
     "pos": pt(hs_c[0], hs_c[1], 0), "rot": [0, 0, -TILT], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "nut", "label": "Nut", "prim": "box", "size": [0.6, 0.62, 4.6],
     "pos": [SCALE + 0.05, NECK_Y1 + 0.31, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
]
for k, off in enumerate([-5.5, -0.5, 4.5]):
    cx, cy = hs_c[0] + off * ct, hs_c[1] - off * st
    for side in (-1, 1):
        parts.append({"id": f"peg{k + 1}{'f' if side < 0 else 'n'}", "label": "Tuning peg", "prim": "cylinder",
                      "r": 0.45, "r2": 0.95, "h": 3.0, "segments": 16,
                      "pos": pt(cx, cy, side * (HS_W / 2 + 1.4)), "rot": [90 * side, 0, 0], "scale": 1,
                      "role": "object", "explode": [0, 0, 0]})
for n in range(1, 13):
    x = fret_x(n)
    parts.append({"id": f"fret{n}", "label": f"Fret {n}", "prim": "box", "size": [0.22, 0.26, r2(2 * neck_half(x))],
                  "pos": pt(x, NECK_Y1 + 0.13, 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]})
parts += [
    {"id": "strings", "label": "Six strings", "prim": "tube", "path": zig, "r": 0.07,
     "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 24, 0]},
    {"id": "string_a", "label": "A string", "prim": "tube", "path": a_full, "r": 0.09,
     "pos": pt(*[(a + b) / 2 for a, b in zip(a_full[0], a_full[1])]), "rot": [0, 0, 0], "scale": 1,
     "role": "actor", "explode": [0, 24, 0], "anim": {"shake": {"axis": SHAKE_AXIS, "amp": 0.75, "hz": 3}}},
    # The same string from the saddle to fret 5, slightly thinner so it hides inside string_a until beat 5.
    # 4 Hz against 3 Hz: the fret-5 ratio 2^(5/12) = 1.33.
    {"id": "a_short", "label": "Vibrating part", "prim": "tube", "path": a_short, "r": 0.075,
     "pos": pt(*[(a + b) / 2 for a, b in zip(a_short[0], a_short[1])]), "rot": [0, 0, 0], "scale": 1,
     "role": "actor", "explode": [0, 24, 0], "anim": {"shake": {"axis": SHAKE_AXIS, "amp": 0.6, "hz": 4}}},
]
assert len(parts) <= 28, len(parts)

# Tube paths are in model space; pos only sets the anim origin. Shift tubes so pos + path = model space.
for p in parts:
    if p["prim"] == "tube" and p["pos"] != [0, 0, 0]:
        ox, oy, oz = p["pos"]
        p["path"] = [pt(x - ox, y - oy, z - oz) for x, y, z in p["path"]]

# ---- beat 3: tiny waves and a back-and-forth arrow pair at the string's middle, drawn far away (small)
MID3 = string_at(A, X12)  # the middle of the string swings the most
m3 = 3.2
WAVE3 = string_at(A, 23.5)  # clear of the sound hole: this sound comes from the string alone
tiny = far_point(cam3, WAVE3, 4.2)
ARROW_L, ARROW_GAP = 2.0, 0.9
up_from = far_point(cam3, [MID3[i] + SHAKE_AXIS[i] * ARROW_GAP for i in range(3)], m3)
dn_from = far_point(cam3, [MID3[i] - SHAKE_AXIS[i] * ARROW_GAP for i in range(3)], m3)

# ---- beat 4: the vibration's path, string -> saddle -> bridge -> out over the top
chain = [string_at(A, 24.0), string_at(A, 10.0), string_at(A, 1.2), pt(0.0, 1.8, sad_z[A]), pt(-0.6, 1.0, -1.0),
         pt(-2.6, 0.7, -0.6), pt(-6.5, 0.6, 0.0), pt(-9.0, 0.6, 0.0)]

beats = [
    {"camera": {"yaw": -34, "pitch": 40, "zoom": 1.6, "target": [24, -2, 0]}, "turn": 8, "dur": 6,
     "play": ["string_a"]},
    {"camera": {"yaw": -50, "pitch": 46, "zoom": 1.6, "target": [15, 6, 0]}, "explode": 1, "dur": 6,
     "labels": ["strings", "top", "body"]},
    {"camera": B3, "dur": 6,
     "focus": ["string_a"], "play": ["string_a"],
     "fx": [{"type": "waves", "at": tiny, "role": "actor", "hz": 1},
            {"type": "arrow", "from": up_from, "dir": SHAKE_AXIS, "len": r2(ARROW_L * m3), "role": "actor", "label": "swings"},
            {"type": "arrow", "from": dn_from, "dir": [-c for c in SHAKE_AXIS], "len": r2(ARROW_L * m3), "role": "actor",
             "label": "swings"}]},
    {"camera": {"yaw": -14, "pitch": 38, "zoom": 1.9, "target": [2, 0, 0]}, "dur": 6,
     "focus": ["string_a", "bridge", "top"], "play": ["string_a", "top"], "labels": ["bridge", "top"],
     "fx": [{"type": "flow", "path": chain, "role": "energy", "speed": 10, "count": 6, "label": "vibration", "closed": False},
            {"type": "waves", "at": [-9, 0.5, 0], "role": "actor", "hz": 0.75}]},
    {"camera": {"yaw": -40, "pitch": 45, "zoom": 1.9, "target": [36, -3, 0]}, "dur": 6,
     "focus": ["a_short", "fret5"], "play": ["a_short"], "labels": ["fret5"],
     "fx": [{"type": "arrow", "from": pt(X5 + 0.9, NUT_Y + 12.3, string_at(A, X5 + 0.9)[2]), "dir": [0, -1, 0], "len": 12,
             "role": "energy", "label": "finger presses"},
            {"type": "dim", "on": "a_short", "text": "49 cm"}]},
    {"camera": {"yaw": -30, "pitch": 36, "zoom": 1.7, "target": [18, -11, 0]}, "dur": 6,
     "focus": ["string_a", "fret12"], "play": ["string_a"], "labels": ["fret12"],
     "number": {"value": "110", "unit": "Hz", "label": "open A string"}},
]

chapter = {
    "scene": "model3d",
    "lens": "explore",
    "title": "How it works",
    "hint": "Pinch: next step. Up/down: turn it.",
    "captions": [
        "Pluck one string and the whole guitar sings. The sound starts in the string.",
        "A guitar is six strings over a hollow wooden box with a thin top.",
        "A plucked string swings back and forth hundreds of times a second, but moves little air.",
        "The string shakes the bridge, the bridge shakes the wide top, and the top pushes air.",
        "Pressing a fret shortens the string, so it swings faster and the note rises.",
        "110 swings every second: the open A string. Fret 12 halves it to 220.",
    ],
    "spec": {"parts": parts, "beats": beats},
}

if __name__ == "__main__":
    write_chapter("guitar", chapter)
    print("R_MODEL", R_MODEL, "shake axis", SHAKE_AXIS, "fret5 x", round(X5, 2), "fret12 x", round(X12, 2))
