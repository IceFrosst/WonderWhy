"""Ball (basketball, thrown): Explore chapter. Usage: python ball_explore.py [test|clips [beat]|write|dump]"""
import math
from common import main, pt, r2

# cm, y up, throw along +x from the ball's spot. The flight is drawn at 1:6 so the ball stays readable:
# a 10.2 m throw (45 degrees, 10 m/s, no air) becomes RANGE units.
BR = 12.0                 # basketball radius (24 cm ball)
RANGE = 168.0             # model range of the no-air throw
N = 4                     # strobe images, equal time steps (equal x steps: sideways speed is constant)
SEAM_TILT = 28            # turn the seam pattern about y so the curved seams face the camera
SEAM_R = 0.17
CURVED_DEG = 52           # angular radius of the two curved seams


def ideal(x):
    return BR + x - x * x / RANGE


def rot_y(v, deg):
    a = math.radians(deg)
    return [v[0] * math.cos(a) + v[2] * math.sin(a), v[1], -v[0] * math.sin(a) + v[2] * math.cos(a)]


def circle_half(radius, z, top):
    """Half of a circle in the plane z=const (seam frame), y>=0 or y<=0, as tube points (local, ball centre origin)."""
    pts = []
    for k in range(13):
        th = math.pi * k / 12 if top else math.pi + math.pi * k / 12
        pts.append(pt(*rot_y([radius * math.cos(th), radius * math.sin(th), z], SEAM_TILT)))
    return pts


def hemi(top):
    prof = []
    for k in range(13):
        ph = math.radians(90 * k / 12)  # from the pole to the equator
        prof.append([r2(BR * math.sin(ph)), r2(BR * math.cos(ph) * (1 if top else -1))])
    return prof


C = [0, BR, 0]
LIFT = [0, 20, 0]
cr = BR * math.sin(math.radians(CURVED_DEG))
cz = BR * math.cos(math.radians(CURVED_DEG))

parts = [
    {"id": "cover", "label": "Cover", "prim": "lathe", "profile": hemi(True),
     "pos": pt(*C), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": LIFT},
    {"id": "cover_lo", "label": "Cover", "prim": "lathe", "profile": hemi(False),
     "pos": pt(*C), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "seam_eq", "label": "Seam", "prim": "torus", "r": BR, "tube": SEAM_R,
     "pos": pt(*C), "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "cover_lo"},
    {"id": "valve", "label": "Valve", "prim": "cylinder", "r": 0.55, "h": 0.5, "segments": 16,
     "pos": pt(*[C[i] + v for i, v in enumerate(rot_y([0, BR * 0.82, BR * 0.57], SEAM_TILT - 70))]),
     "rot": [55, SEAM_TILT - 70, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "cover"},
]
for top in (True, False):
    parent = "cover" if top else "cover_lo"
    tag = "t" if top else "b"
    for name, radius, z in (("mer", BR, 0.0), ("cvl", cr, cz), ("cvr", cr, -cz)):
        parts.append({"id": f"seam_{name}_{tag}", "label": "Seam", "prim": "tube", "path": circle_half(radius, z, top),
                      "r": SEAM_R, "pos": pt(*C), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0],
                      "parent": parent})
parts += [
    {"id": "bladder", "label": "Rubber bladder", "prim": "sphere", "r": BR - 0.6,
     "pos": pt(*C), "rot": [0, 0, 0], "scale": 1, "role": "actor", "explode": [0, 8, 0]},
    {"id": "ground", "label": "Ground", "prim": "box", "size": [RANGE + 2.2 * BR, 0.5, 34],
     "pos": pt(RANGE / 2, -0.25, 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    # a hairline along the ground's front edge from launch to landing: it only carries the range dimension
    {"id": "range", "label": "Range", "prim": "box", "size": [RANGE, 0.02, 0.02],
     "pos": pt(RANGE / 2, 0.0, 17.0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "patch", "label": "Contact patch", "prim": "cylinder", "r": 4.2, "h": 0.3, "segments": 32,
     "pos": pt(0, 0.15, 0), "rot": [0, 0, 0], "scale": 1, "role": "loss", "explode": [0, 0, 0]},
]
STROBES = []
for k in range(1, N + 1):
    x = RANGE * k / N
    sid = f"strobe{k}"
    STROBES.append(sid)
    parts.append({"id": sid, "label": "Without air" if k == N else "Ball in flight", "prim": "sphere", "r": BR,
                  "pos": pt(x, ideal(x), 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]})

BALL = ["cover", "cover_lo", "valve", "seam_eq"] + [p["id"] for p in parts if p["id"].startswith("seam_") and p["id"] != "seam_eq"]

# ---- paths
ideal_path = [pt(RANGE * i / 20, ideal(RANGE * i / 20), 0) for i in range(21)]


def drag_path():
    """Same throw with quadratic air drag (basketball: k = rho Cd A / 2m = 0.0205 per metre), scaled to the model."""
    g, k, v0 = 9.81, 0.0205, 10.0
    s = RANGE / (v0 * v0 / g)           # model units per metre
    x = y = 0.0
    vx = vy = v0 / math.sqrt(2)
    dt, t, out = 1e-3, 0.0, [pt(0, BR, 0)]
    while True:
        v = math.hypot(vx, vy)
        vx += -k * v * vx * dt
        vy += (-g - k * v * vy) * dt
        x += vx * dt
        y += vy * dt
        t += dt
        if y < 0:
            break
        if int(round(t * 1000)) % 75 == 0:
            out.append(pt(x * s, BR + y * s, 0))
    out.append(pt(x * s, BR, 0))
    return out, x * s


real_path, real_range = drag_path()
assert len(real_path) <= 64, len(real_path)


def tangent(x, length):
    s = 1 - 2 * x / RANGE
    n = math.hypot(1, s)
    return pt(1 / n, s / n, 0), r2(length * n)


def vel_arrow(k, base=24):
    x = RANGE * k / N
    d, l = tangent(x, base)
    return {"type": "arrow", "from": f"strobe{k}", "dir": d, "len": l, "role": "actor", "label": "velocity"}


# drag arrow and air past the ball in flight (strobe 1 sits on both paths: they part later)
x1 = RANGE / N
d1, _ = tangent(x1, 1)
c1 = [x1, ideal(x1), 0]
nrm = [-d1[1], d1[0], 0]


def stream(side):
    """Air streaming past the ball (in the ball's frame it comes from ahead and bends round it)."""
    pts = []
    for i in range(11):
        u = 36 - 72 * i / 10                    # +36 ahead of the ball to -36 behind it
        bulge = 4.5 * math.exp(-(u / 14) ** 2)
        off = side * (BR * 0.95 + bulge)
        pts.append(pt(*[c1[j] + d1[j] * u + nrm[j] * off for j in range(3)]))
    return pts


R_MODEL = 104.13  # renderer's bounding sphere radius (updated after a run)


def zoom(ppc):
    return r2(ppc * R_MODEL / (0.7 * 464 / 2))


S2 = math.sqrt(0.5)
LAUNCH = pt(0, BR, 0)
BL = BR - 0.6
CU, SU = math.cos(math.radians(25)), math.sin(math.radians(25))
beats = [
    {"camera": {"yaw": -50, "pitch": 12, "zoom": zoom(3.6), "target": pt(RANGE * 0.4, 25, 0)}, "turn": 6, "dur": 6,
     "ghost": STROBES + ["ground", "patch", "range"],
     "fx": [{"type": "flow", "path": ideal_path, "role": "actor", "speed": 70, "count": 4, "label": "flight", "closed": False}]},
    {"camera": {"yaw": 8, "pitch": 16, "zoom": zoom(6.8), "target": [-3, 21, 0]}, "explode": 1, "dur": 6,
     "focus": BALL + ["bladder"], "labels": ["cover", "bladder", "valve"],
     "fx": [{"type": "arrow", "from": pt(-BL * CU, BR + 8 + BL * SU, 0), "dir": pt(-CU, SU, 0), "len": 10, "role": "energy", "label": "air pushes out"},
            {"type": "arrow", "from": pt(BL * CU, BR + 8 + BL * SU, 0), "dir": pt(CU, SU, 0), "len": 10, "role": "energy", "label": "air pushes out"}]},
    {"camera": {"yaw": -4, "pitch": 6, "zoom": zoom(2.55), "target": pt(RANGE * 0.53, 30, 0)}, "dur": 6,
     "focus": BALL + ["strobe2", "strobe4"], "ghost": ["ground"],
     "fx": [{"type": "arrow", "from": LAUNCH, "dir": pt(S2, S2, 0), "len": 34, "role": "actor", "label": "velocity"},
            {"type": "arrow", "from": "strobe2", "dir": [1, 0, 0], "len": 24, "role": "actor", "label": "velocity"},
            {"type": "arrow", "from": "strobe4", "dir": pt(S2, -S2, 0), "len": 34, "role": "actor", "label": "velocity"},
            {"type": "arrow", "from": "strobe2", "dir": [0, -1, 0], "len": 24, "role": "energy", "label": "gravity"}]},
    {"camera": {"yaw": -4, "pitch": 6, "zoom": zoom(2.8), "target": pt(RANGE * 0.5, 34, 0)}, "dur": 6,
     "focus": ["strobe1"],
     "fx": [{"type": "flow", "path": real_path, "role": "actor", "speed": 70, "count": 4, "label": "with air", "closed": False},
            {"type": "arrow", "from": "strobe1", "dir": pt(-d1[0], -d1[1], 0), "len": 24, "role": "loss", "label": "air drag"},
            {"type": "flow", "path": stream(1), "role": "actor", "speed": 40, "count": 3, "label": "air", "closed": False},
            {"type": "flow", "path": stream(-1), "role": "actor", "speed": 40, "count": 3, "label": "air", "closed": False}]},
    {"camera": {"yaw": 4, "pitch": 10, "zoom": zoom(9.0), "target": [-5, 14, 0]}, "dur": 6,
     "focus": ["bladder", "patch"], "ghost": BALL,
     "fx": [{"type": "arrow", "from": [0, -4, 0], "dir": [0, 1, 0], "len": 14, "role": "energy", "label": "floor pushes back"},
            {"type": "arrow", "from": [0, 2 * BR + 2, 0], "dir": [0, 1, 0], "len": 10, "role": "actor", "label": "back up"},
            {"type": "heat", "on": "patch", "role": "loss"}]},
    {"camera": {"yaw": -4, "pitch": 8, "zoom": zoom(2.7), "target": pt(RANGE * 0.5, 30, 0)}, "dur": 6,
     "focus": ["range", f"strobe{N}"], "ghost": ["ground"],
     "fx": [{"type": "dim", "on": "range", "text": "10.2 m"},
            {"type": "flow", "path": ideal_path, "role": "actor", "speed": 70, "count": 4, "label": "flight", "closed": False}],
     "number": {"value": "10.2", "unit": "m", "label": "range of a 10 m/s throw, no air"}},
]

chapter = {
    "scene": "model3d",
    "lens": "explore",
    "title": "How it works",
    "hint": "Pinch: next step. Up/down: turn it.",
    "captions": [
        "Every thrown ball curves back to the ground. Two forces shape the whole flight.",
        "Inside the cover: a rubber bladder of air pumped above the outside pressure.",
        "Gravity pulls down all the time, so the upward speed shrinks, stops, then reverses.",
        "Air pushes against the motion and steals speed, so the real throw lands shorter.",
        "On a bounce the squeezed air works like a spring and throws the ball back up.",
        "Thrown at 10 metres per second and 45 degrees, it lands about 10 metres away.",
    ],
    "spec": {"parts": parts, "beats": beats},
}

if __name__ == "__main__":
    print(len(parts), "parts; real range", r2(real_range), "of", RANGE, "; path points", len(real_path))
    main("ball", chapter)
