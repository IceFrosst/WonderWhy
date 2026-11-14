"""Insert (or replace) the guitar's Explore chapter as its first chapter in shared/objects.json.

Acoustic guitar lying face up, cm. x along the strings (saddle x=0, nut x=64.5, neck to +x),
y up (top surface at y=0.4), z across (low E on the far side, -z).
"""
import math, sys
from r3d_common import pt, r2, write_chapter, catmull_closed, resample_closed

SCALE = 64.5  # nut to saddle
R_MODEL = float(sys.argv[1]) if len(sys.argv) > 1 else 53.6  # renderer's model radius (printed by render.mjs)


def fret_x(n):
    return SCALE * 2 ** (-n / 12)  # distance from the saddle = vibrating length


# ---- body outline: half-widths along x (dreadnought-like), neck joint at x=28.7, tail at x=-22.3
half = [(28.7, 0.0), (28.3, 4.8), (26.9, 9.2), (24.6, 12.3), (21.6, 14.1), (18.0, 14.6), (14.4, 14.0),
        (11.0, 12.7), (7.8, 12.0), (4.6, 12.4), (1.4, 14.0), (-2.4, 16.8), (-6.4, 18.9), (-10.6, 19.8),
        (-14.8, 19.3), (-18.4, 17.0), (-20.9, 13.0), (-22.1, 7.2), (-22.4, 0.0)]
control = [(x, -w) for x, w in half] + [(x, w) for x, w in reversed(half[1:-1])]
dense = catmull_closed(control, 40)
outline = resample_closed(dense, 32, bend=5.0)
top_outline = resample_closed(dense, 64, bend=5.0)


def offset_polygon(poly, d):
    """Move every vertex inward by d along the averaged edge normals (poly is CCW in x,z... sign checked)."""
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
            # inward normal of a CCW polygon is (-ez, ex)
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
JOINT = 28.7


def neck_half(x):
    return 2.2 + (SCALE - x) / (SCALE - JOINT) * 0.6  # 4.4 cm at the nut, 5.6 at the body


neck_shape = [[JOINT, -neck_half(JOINT)], [SCALE, -neck_half(SCALE)], [SCALE, neck_half(SCALE)], [JOINT, neck_half(JOINT)]]
neck_shape = [[r2(x), r2(z)] for x, z in neck_shape]

NUT_Y, SADDLE_Y, SADDLE_X = 1.62, 1.95, 0.15
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
X5 = fret_x(5)  # 48.3 cm from the saddle
a_short = [string_at(A, SADDLE_X), string_at(A, X5)]

# ---- headstock and pegs (tilted back 14 degrees, down)
TILT = 14
ct, st = math.cos(math.radians(TILT)), math.sin(math.radians(TILT))
HS_LEN = 18.0
hs_start = (SCALE + 0.3, 0.3)
hs_c = (hs_start[0] + HS_LEN / 2 * ct, hs_start[1] - HS_LEN / 2 * st)
HS_W = 8.4

parts = [
    {"id": "body", "label": "Hollow body", "prim": "extrude", "shape": wall, "h": 10.0,
     "pos": [0, -5.0, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "top", "label": "Thin top", "prim": "extrude", "shape": top_shape, "h": 0.4,
     "pos": [0, 0.2, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 11, 0],
     "anim": {"shake": {"axis": [0, 1, 0], "amp": 0.7, "hz": 1.5}}},
    {"id": "hole", "label": "Sound hole", "prim": "torus", "r": 5.0, "tube": 0.3,
     "pos": [13.0, 0.45, 0], "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "top"},
    {"id": "bridge", "label": "Bridge", "prim": "extrude",
     "shape": [[-1.8, -0.4], [1.2, -0.4], [1.2, -1.25], [0.32, -1.25], [0.32, -1.95], [0.0, -1.95], [0.0, -1.25], [-1.8, -1.25]],
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
    {"id": "strings", "label": "Strings", "prim": "tube", "path": zig, "r": 0.07,
     "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 22, 0]},
    {"id": "string_a", "label": "A string", "prim": "tube", "path": a_full, "r": 0.09,
     "pos": pt(*[(a + b) / 2 for a, b in zip(a_full[0], a_full[1])]), "rot": [0, 0, 0], "scale": 1,
     "role": "actor", "explode": [0, 22, 0], "anim": {"shake": {"axis": [0, 1, 0.3], "amp": 1.3, "hz": 3}}},
    {"id": "a_short", "label": "Vibrating length", "prim": "tube", "path": a_short, "r": 0.09,
     "pos": pt(*[(a + b) / 2 for a, b in zip(a_short[0], a_short[1])]), "rot": [0, 0, 0], "scale": 1,
     "role": "actor", "explode": [0, 22, 0], "anim": {"shake": {"axis": [0, 1, 0.3], "amp": 1.1, "hz": 4}}},
]
assert len(parts) <= 28, len(parts)

# Tube paths are in model space; pos only sets the anim origin. Shift tubes so pos + path = model space.
for p in parts:
    if p["prim"] == "tube" and p["pos"] != [0, 0, 0]:
        ox, oy, oz = p["pos"]
        p["path"] = [pt(x - ox, y - oy, z - oz) for x, y, z in p["path"]]

# ---- camera helper: a point on the ray camera->P, m times further away, so fx rings draw 1/m the size
FOV = 26
STAGE_H = 464


def cam_pos(yaw, pitch, zoom, target):
    dist = R_MODEL * 600 / (0.7 * STAGE_H * zoom * math.tan(math.radians(FOV / 2)))
    d = (math.sin(math.radians(yaw)) * math.cos(math.radians(pitch)), math.sin(math.radians(pitch)),
         math.cos(math.radians(yaw)) * math.cos(math.radians(pitch)))
    return [target[i] + d[i] * dist for i in range(3)], dist


def far_point(cam, p, m):
    return pt(*[cam[i] + (p[i] - cam[i]) * m for i in range(3)])


# ---- beats
B3 = {"yaw": -16, "pitch": 30, "zoom": 2.7, "target": string_at(A, 30.0)}
cam3, dist3 = cam_pos(B3["yaw"], B3["pitch"], B3["zoom"], B3["target"])
m3 = min(3.0, 1 + 5.5 * R_MODEL / dist3)
tiny = far_point(cam3, string_at(A, 24.0), m3)

beats = [
    {"camera": {"yaw": -34, "pitch": 40, "zoom": 1.6, "target": [24, -2, 0]}, "turn": 8, "dur": 6,
     "play": ["string_a"]},
    {"camera": {"yaw": -50, "pitch": 46, "zoom": 1.6, "target": [15, 6, 0]}, "explode": 1, "dur": 6,
     "labels": ["strings", "top", "body"]},
    {"camera": B3, "dur": 6,
     "focus": ["string_a"], "play": ["string_a"],
     "fx": [{"type": "waves", "at": tiny, "role": "actor", "hz": 1}]},
    {"camera": {"yaw": -14, "pitch": 38, "zoom": 1.9, "target": [2, 0, 0]}, "dur": 6,
     "focus": ["string_a", "bridge", "top"], "play": ["string_a", "top"], "labels": ["bridge", "top"],
     "fx": [{"type": "waves", "at": [-9, 0.5, 0], "role": "actor", "hz": 0.75}]},
    {"camera": {"yaw": -10, "pitch": 30, "zoom": 2.25, "target": [34, -4, 0]}, "dur": 6,
     "focus": ["a_short", "fret5"], "play": ["a_short"],
     "fx": [{"type": "arrow", "from": pt(X5 + 0.9, NUT_Y + 9.3, string_at(A, X5 + 0.9)[2]), "dir": [0, -1, 0], "len": 9,
             "role": "energy", "label": "finger presses"},
            {"type": "dim", "on": "a_short", "text": "48 cm"}]},
    {"camera": {"yaw": -30, "pitch": 36, "zoom": 1.5, "target": [18, -13, 0]}, "dur": 6,
     "focus": ["string_a"], "play": ["string_a"],
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
    print("tiny waves m =", round(m3, 2), "fret5 x =", round(X5, 2))
