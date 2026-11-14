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
# the landing ball, squashed about 20 % against the ground (same volume as the round one)
SQ_A, SQ_B, SQ_FLAT = 13.6, 9.35, 7.0


def squashed(a, b, flat, y0):
    """Profile of a squashed ball: half-ellipse (a wide, b tall) whose bottom is cut flat at radius `flat`, flat at y0."""
    th0 = math.acos(flat / a)
    yc = y0 + b * math.sin(th0)
    prof = [[0, r2(y0)]]
    for k in range(25):
        u = math.sin(math.pi / 2 * k / 24)          # denser towards the top pole: a clean outline over it
        th = -th0 + (math.pi / 2 + th0) * u
        prof.append([r2(a * math.cos(th)), r2(yc + b * math.sin(th))])
    prof[-1][0] = 0
    return prof
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
    {"id": "patch", "label": "Contact patch", "prim": "cylinder", "r": SQ_FLAT, "h": 0.3, "segments": 32,
     "pos": pt(RANGE, 0.15, 0), "rot": [0, 0, 0], "scale": 1, "role": "energy", "explode": [0, 0, 0]},
]
STROBES = []
for k in range(1, N):
    x = RANGE * k / N
    sid = f"strobe{k}"
    STROBES.append(sid)
    parts.append({"id": sid, "label": "Without air" if k == N - 1 else "Ball in flight", "prim": "sphere", "r": BR,
                  "pos": pt(x, ideal(x), 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]})
# The last image is the landing: the ball squashed flat against the ground, its bladder squeezed inside.
STROBES.append(f"strobe{N}")
parts += [
    {"id": f"strobe{N}", "label": "Landing", "prim": "lathe", "profile": squashed(SQ_A, SQ_B, SQ_FLAT, 0.0),
     "pos": pt(RANGE, 0, 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "bladder_sq", "label": "Squeezed air", "prim": "lathe",
     "profile": squashed(SQ_A - 0.7, SQ_B - 0.7, SQ_FLAT - 0.5, 0.7),
     "pos": pt(RANGE, 0, 0), "rot": [0, 0, 0], "scale": 1, "role": "actor", "explode": [0, 0, 0]},
]

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


# Where the real (air) throw lands: a flat ring on the ground.
parts.append({"id": "land_air", "label": "With air", "prim": "torus", "r": 4.0, "tube": 0.35,
              "pos": pt(real_range, 0.4, 0), "rot": [90, 0, 0], "scale": 1, "role": "actor", "explode": [0, 0, 0]})


def tag(tid, label, at):
    """A speck that only carries a label onto an arrow (fx arrows have no label of their own on the stills)."""
    return {"id": tid, "label": label, "prim": "sphere", "r": 0.04, "pos": pt(*at), "rot": [0, 0, 0], "scale": 1,
            "role": "object", "explode": [0, 0, 0]}


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


R_MODEL = 104.31  # renderer's bounding sphere radius (updated after a run)


def zoom(ppc):
    return r2(ppc * R_MODEL / (0.7 * 464 / 2))


S2 = math.sqrt(0.5)
LAUNCH = pt(0, BR, 0)
BL = BR - 0.6
TOP = [RANGE / 2, ideal(RANGE / 2), 0]


def radial(deg, lift):
    """A point on the (exploded) bladder's surface and the outward direction there, in the x-y plane."""
    c, s_ = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return pt(BL * c, BR + lift + BL * s_, 0), pt(c, s_, 0)


def push_out(deg, lift=8, length=9):
    p, d = radial(deg, lift)
    return {"type": "arrow", "from": p, "dir": d, "len": length, "role": "energy", "label": "air pushes out"}


# label carriers on the arrows of beats 3 and 4
parts += [
    # each speck sits on a ball's outline where its arrow leaves the ball, so it hides in that outline
    tag("tag_grav", "Gravity", [TOP[0], TOP[1] - 23, 0]),          # near the gravity arrow's head
    tag("tag_vel", "Velocity", [15, ideal(15), 0]),                # on the flight path, along the launch arrow
    tag("tag_drag", "Air drag", [c1[0] - d1[0] * (BR + 0.1), c1[1] - d1[1] * (BR + 0.1), 0]),
]
TAGS = ["tag_grav", "tag_vel", "tag_drag"]
assert len(parts) <= 32, len(parts)

beats = [
    # 1 the ball and its flight
    {"camera": {"yaw": -50, "pitch": 12, "zoom": zoom(3.6), "target": pt(RANGE * 0.4, 25, 0)}, "turn": 6, "dur": 6,
     "ghost": STROBES + ["ground", "bladder_sq", "patch", "range", "land_air"] + TAGS,
     "fx": [{"type": "flow", "path": ideal_path, "role": "actor", "speed": 70, "count": 4, "label": "flight", "closed": False}]},
    # 2 cover apart, bladder pushing out
    {"camera": {"yaw": 8, "pitch": 16, "zoom": zoom(7.6), "target": [-11, 21, 0]}, "explode": 1, "dur": 6,
     "focus": BALL + ["bladder"], "labels": ["cover", "bladder", "valve"],
     "fx": [push_out(25), push_out(155), push_out(-25), push_out(-155)]},
    # 3 gravity always down, velocity turns over
    {"camera": {"yaw": -4, "pitch": 6, "zoom": zoom(2.4), "target": pt(82, 30, 0)}, "dur": 6,
     "focus": BALL + ["strobe2", "strobe4"], "ghost": ["ground"], "labels": ["tag_vel", "tag_grav"],
     "fx": [{"type": "arrow", "from": LAUNCH, "dir": pt(S2, S2, 0), "len": 34, "role": "actor", "label": "velocity"},
            {"type": "arrow", "from": "strobe2", "dir": [1, 0, 0], "len": 24, "role": "actor", "label": "velocity"},
            {"type": "arrow", "from": "strobe4", "dir": pt(S2, -S2, 0), "len": 34, "role": "actor", "label": "velocity"},
            {"type": "arrow", "from": "strobe2", "dir": [0, -1, 0], "len": 24, "role": "energy", "label": "gravity"}]},
    # 4 drag: the real path lands short of the no-air one
    {"camera": {"yaw": -4, "pitch": 6, "zoom": zoom(2.8), "target": pt(RANGE * 0.5, 34, 0)}, "dur": 6,
     "focus": ["strobe1", "land_air"], "labels": ["tag_drag", "land_air", f"strobe{N - 1}"],
     "fx": [{"type": "flow", "path": real_path, "role": "actor", "speed": 70, "count": 4, "label": "with air", "closed": False},
            {"type": "flow", "path": ideal_path, "role": "object", "speed": 70, "count": 2, "label": "without air", "closed": False},
            {"type": "arrow", "from": "strobe1", "dir": pt(-d1[0], -d1[1], 0), "len": 22, "role": "loss", "label": "air drag"},
            {"type": "flow", "path": stream(1), "role": "actor", "speed": 40, "count": 3, "label": "air", "closed": False}]},
    # 5 the bounce: the landing ball squashed, its air squeezed, the floor pushing back
    {"camera": {"yaw": 6, "pitch": 4, "zoom": zoom(9.3), "target": pt(RANGE + 3, 12, 0)}, "dur": 6,
     "focus": [f"strobe{N}", "bladder_sq", "patch"], "labels": ["bladder_sq"],
     "fx": [{"type": "arrow", "from": pt(RANGE, -11, 0), "dir": [0, 1, 0], "len": 12, "role": "energy", "label": "floor pushes back"},
            {"type": "arrow", "from": pt(RANGE, SQ_B * 2 + 3, 0), "dir": [0, 1, 0], "len": 11, "role": "actor", "label": "back up"},
            {"type": "arrow", "from": pt(RANGE - 3, 10, 0), "dir": pt(-0.96, -0.28, 0), "len": 7.5, "role": "energy", "label": "air pushes out"},
            {"type": "arrow", "from": pt(RANGE + 3, 10, 0), "dir": pt(0.96, -0.28, 0), "len": 7.5, "role": "energy", "label": "air pushes out"}]},
    # 6 the number
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

def scratch_render(stills_only, beat=None):
    """Render the spec into specs/out/ball/ (never touches objects.json or bridge/media)."""
    import json, os, subprocess
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "ball")
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, "chapter.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(chapter, f, ensure_ascii=False, indent=1)
    cmd = ["node", "render.mjs", "--spec", path, "--id", "ball", "--out", out]
    if stills_only:
        cmd.append("--stills-only")
    if beat:
        cmd += ["--beat", str(beat)]
    subprocess.run(cmd, cwd=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."), check=True)


if __name__ == "__main__":
    import sys
    print(len(parts), "parts; real range", r2(real_range), "of", RANGE, "; path points", len(real_path))
    mode = sys.argv[1] if len(sys.argv) > 1 else "test"
    if mode == "test":
        scratch_render(True)
    elif mode == "clips":
        scratch_render(False, int(sys.argv[2]) if len(sys.argv) > 2 else None)
    else:
        main("ball", chapter)
