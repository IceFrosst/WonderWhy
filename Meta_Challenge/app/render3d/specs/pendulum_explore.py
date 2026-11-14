"""Pendulum (keys swinging on a lanyard): Explore chapter. Usage: python pendulum_explore.py [test|clips [beat]|write|dump]

Keys on a 25 cm lanyard hanging from a wall hook, swinging 25 degrees each way at 1 Hz (one swing there
and back per second, as in the chapter's number). The renderer's swing anim is at angle 0 in every rest
frame, so the extremes of the swing are drawn as two static dim copies ("strobe" positions) on the swing
arc. They and the arc lift away (explode) in the beats that do not need them (2 and 5); the heavier
bunch for beat 5 waits off to the right and slides in at explode 1.
"""
import math
from common import main, pt, r2, euler_xyz, mat_mul

# cm, y up. Swing plane xy, pivot axis z.
PIVOT_Y = 30.0
STRAP = 0.3
LANYARD = 25.0          # loop top to the bottom of the loop
FINGER_R = 0.9          # hook peg radius
AMP = 25.0              # swing amplitude, degrees
HZ = 1.0                # one swing there and back per second
X2 = 30.0               # the heavier bunch hangs here in beat 5 ...
SLIDE = 44.0            # ... and waits this far to the right until then (explode brings it in)
LIFT = 120.0            # the strobe copies and the arc lift this far up at explode 1 (60 at explode 0.5)
KEY_S = 1.15
RING_R = 1.9
SWING = {"swing": {"axis": [0, 0, 1], "deg": AMP, "hz": HZ}}


def rx(d):
    a = math.radians(d)
    c, s = math.cos(a), math.sin(a)
    return [[1, 0, 0], [0, c, -s], [0, s, c]]


def ry(d):
    a = math.radians(d)
    c, s = math.cos(a), math.sin(a)
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]]


def rz(d):
    a = math.radians(d)
    c, s = math.cos(a), math.sin(a)
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]]


def euler_m(e):
    """three.js Euler XYZ (degrees) -> rotation matrix."""
    return mat_mul(mat_mul(rx(e[0]), ry(e[1])), rz(e[2]))


def lanyard_path():
    """Closed loop over the peg (local coords, origin = pivot), strands meeting at the bottom."""
    a = FINGER_R + STRAP
    bottom = a - LANYARD
    right = [[0.0, bottom], [0.35, bottom + 5], [0.75, bottom + 13], [1.05, bottom + 20], [a, -0.9]]
    arc = []
    for k in range(9):
        th = math.radians(-10 + 200 * k / 8)  # over the top of the peg
        arc.append([a * math.cos(th), a * math.sin(th)])
    left = [[-x, y] for x, y in reversed(right[1:])]
    pts = right + arc[1:-1] + [[-a, -0.9]] + left[:-1]
    return [pt(x, y, 0) for x, y in pts], bottom


def key_shape(kind="yale"):
    """Key outline in shape coords [x, z], z pointing down the blade, origin at the ring hole."""
    cz, r = (1.3, 1.35) if kind == "yale" else (1.0, 1.05)
    bow = []
    for k in range(17):
        th = math.radians(200 + 320 * k / 16)
        bow.append([r * math.sin(th), cz - r * math.cos(th)])
    if kind == "yale":
        right = [[0.8, 3.15], [0.8, 3.45], [0.45, 3.45], [0.8, 3.9], [0.45, 4.3], [0.8, 4.8], [0.5, 5.2], [0.75, 5.6],
                 [0.45, 6.1], [0.7, 6.5], [0.45, 6.9], [0.45, 7.3], [0.0, 7.7]]
        left = [[-0.35, 7.45], [-0.35, 3.45], [-0.8, 3.45], [-0.8, 3.15]]
    else:  # short padlock key
        right = [[0.6, 3.1], [0.4, 3.3], [0.4, 4.0], [0.75, 4.2], [0.75, 4.8], [0.4, 5.0], [0.0, 5.4]]
        left = [[-0.4, 5.1], [-0.4, 3.3], [-0.6, 3.1]]
    return [[r2(x), r2(z)] for x, z in bow + right + left]


_, BOTTOM = lanyard_path()
RING_Y = PIVOT_Y + BOTTOM - RING_R + 0.25     # ring hangs from the bottom of the loop
LIGHT_KEYS = [("yale", -40, -24, KEY_S, -0.3), ("yale", 0, 2, KEY_S, 0.0), ("padlock", 38, 26, KEY_S, 0.3)]
HEAVY_KEYS = [("yale", -40, -20, KEY_S * 1.12, 0.4), ("yale", 0, 4, KEY_S * 1.18, 0.0), ("yale", 38, 24, KEY_S * 1.12, -0.4),
              ("padlock", -70, -38, KEY_S * 1.15, 0.7), ("yale", 70, 40, KEY_S * 1.1, -0.7)]


def key_parts(prefix, x, keys, role, labels, explode=(0, 0, 0), parent=None):
    parts = []
    for i, (kind, phi, angle, scale, dz) in enumerate(keys):
        a = math.radians(phi - 90)
        kx, ky = x + (RING_R - 0.1) * math.cos(a), RING_Y + (RING_R - 0.1) * math.sin(a)
        p = {"id": f"{prefix}key{i + 1}", "label": labels[i], "prim": "extrude", "shape": key_shape(kind), "h": 0.22,
             "pos": pt(kx, ky, dz), "rot": [90, angle, 0], "scale": scale, "role": role, "explode": list(explode)}
        if parent:
            p["parent"] = parent
        parts.append(p)
    return parts


def bunch(prefix, x, role, keys, key_labels, lanyard_label, explode, extra=()):
    """Wall plate, hook peg, lanyard (swinging), ring and keys hanging from the ring (children of the lanyard)."""
    path, _ = lanyard_path()
    ex = list(explode)
    parts = [
        {"id": f"{prefix}plate", "label": "Wall hook", "prim": "box", "size": [4.6, 7.0, 0.7], "round": 0.6,
         "pos": pt(x, PIVOT_Y + 1.2, -2.0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": ex},
        {"id": f"{prefix}pivot", "label": "Pivot", "prim": "cylinder", "r": FINGER_R, "r2": FINGER_R * 0.9, "h": 4.6,
         "segments": 28, "pos": pt(x, PIVOT_Y, 0.65), "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": ex},
        {"id": f"{prefix}lanyard", "label": lanyard_label, "prim": "tube", "path": path, "r": STRAP, "closed": True,
         "pos": pt(x, PIVOT_Y, 0), "rot": [0, 0, 0], "scale": 1, "role": role, "explode": ex, "anim": SWING},
        {"id": f"{prefix}ring", "label": "Key ring", "prim": "torus", "r": RING_R, "tube": 0.14,
         "pos": pt(x, RING_Y, 0), "rot": [0, 35, 0], "scale": 1, "role": role, "explode": [0, 0, 0],
         "parent": f"{prefix}lanyard"},
    ]
    parts += key_parts(prefix, x, keys, role, key_labels, parent=f"{prefix}lanyard")
    for p in extra:
        p["parent"] = f"{prefix}lanyard"
        parts.append(p)
    return parts


def copy_at(src, prefix, theta, labels):
    """A static dim copy of the swinging part of the light bunch, turned theta degrees about the pivot."""
    out = []
    m_th = rz(theta)
    c, s = math.cos(math.radians(theta)), math.sin(math.radians(theta))
    for p in src:
        if p["id"] not in ("lanyard", "ring", "key1", "key2", "key3"):
            continue
        q = dict(p)
        q.pop("anim", None)
        q["id"] = prefix + p["id"]
        q["label"] = labels.get(p["id"], p["label"])
        x, y, z = p["pos"]
        dx, dy = x, y - PIVOT_Y
        q["pos"] = pt(dx * c - dy * s, PIVOT_Y + dx * s + dy * c, z)
        q["rot"] = euler_xyz(mat_mul(m_th, euler_m(p["rot"])))
        q["role"] = "object"
        if p["id"] == "lanyard":
            q["explode"] = [0, LIFT, 0]
        else:
            q["explode"] = [0, 0, 0]
            q["parent"] = prefix + "lanyard"
        out.append(q)
    return out


light = bunch("", 0.0, "object", LIGHT_KEYS, ["Key", "Keys", "Key"], "Lanyard", (0, 0, 0))


def fob(x):
    return [{"id": "h_fob", "label": "Key fob", "prim": "box", "size": [3.0, 4.6, 1.3], "round": 0.6,
             "pos": pt(x - 0.6, RING_Y - 4.6, -1.0), "rot": [0, 0, 8], "scale": 1, "role": "other", "explode": [0, 0, 0]}]


heavy = bunch("h_", X2 + SLIDE, "other", HEAVY_KEYS, ["Key", "Heavier keys", "Key", "Key", "Key"], "Same length", (-SLIDE, 0, 0),
              fob(X2 + SLIDE))

# Key centre (key2) at rest, and the radius of its swing.
KEY_C_Y = RING_Y - RING_R - 3.85 * KEY_S + 0.1
RAD = PIVOT_Y - KEY_C_Y

copy_l = copy_at(light, "l_", -AMP, {"key2": "Let go here"})
copy_r = copy_at(light, "r_", AMP, {"key2": "Stops, turns back"})


def swing_arc():
    """Swing path of the key centres: a thin static arc through the three strobe positions."""
    path = []
    for k in range(13):
        th = math.radians(-AMP + 2 * AMP * k / 12)
        path.append(pt(RAD * math.sin(th), -RAD * math.cos(th), 0))
    return {"id": "arc", "label": "Swing path", "prim": "tube", "path": path, "r": 0.08,
            "pos": pt(0, PIVOT_Y, 0), "rot": [0, 0, 0], "scale": 1, "role": "actor", "explode": [0, LIFT, 0]}


def on_arc(deg, out=0.0):
    t = math.radians(deg)
    r = RAD + out
    return pt(r * math.sin(t), PIVOT_Y - r * math.cos(t), 0)


def tangent(deg, sign=1):
    t = math.radians(deg)
    return pt(sign * math.cos(t), sign * math.sin(t), 0)


parts = light + heavy + copy_l + copy_r + [swing_arc()]
ids = [p["id"] for p in parts]
assert len(ids) == len(set(ids)) and len(parts) <= 28, len(parts)

LIVE = ["lanyard", "ring", "key1", "key2", "key3"]
HOOK = ["plate", "pivot"]
STROBE = [p["id"] for p in copy_l + copy_r]
HEAVY = [p["id"] for p in heavy]

R_MODEL = 51.0  # nominal radius for the px-per-cm zoom helper (the renderer reports 53.3, so the true scale is ~4% larger)


def zoom(ppc):
    """Zoom for a scale in pixels per cm."""
    return r2(ppc * R_MODEL / (0.7 * 464 / 2))


# Speed along the arc, relative to the bottom (energy): v/v0 = sqrt((cos th - cos A) / (1 - cos A)).
def speed(deg):
    return math.sqrt(max(0.0, (math.cos(math.radians(deg)) - math.cos(math.radians(AMP))) / (1 - math.cos(math.radians(AMP)))))


G_LEN = 9.0
V0 = 10.0
TRACK = 6.2   # velocity arrows ride on a track this far outside the key-centre arc, clear of the blades


def vel(deg, v0, label):
    """Cyan velocity arrow centred on the swing angle deg, tangent to the arc, length v0 times the relative speed."""
    n = v0 * speed(deg)
    c = on_arc(deg, TRACK)
    d = tangent(deg)
    return {"type": "arrow", "from": pt(c[0] - d[0] * n / 2, c[1] - d[1] * n / 2, 0), "dir": d, "len": r2(n),
            "role": "actor", "label": label}
beats = [
    # 1. The keys, swinging on the hook; faint copies mark the ends of the swing.
    {"camera": {"yaw": 22, "pitch": 6, "zoom": zoom(8.6), "target": [0, 13.2, 0]}, "turn": 5, "dur": 6,
     "play": ["lanyard"], "focus": HOOK + LIVE},
    # 2. Pivot, lanyard (25 cm), keys, and gravity on them.
    {"camera": {"yaw": 28, "pitch": 8, "zoom": zoom(9.6), "target": [1.0, 11.8, 0]}, "explode": 0.5, "turn": 3, "dur": 6,
     "labels": ["pivot", "lanyard", "key2"],
     "fx": [{"type": "dim", "on": "lanyard", "text": "25 cm"},
            {"type": "arrow", "from": pt(0, KEY_C_Y - 2.5, 0), "dir": [0, -1, 0], "len": 8, "role": "energy",
             "label": "gravity"}]},
    # 3. Let go at the side: gravity down, the pull back along the arc, speeding up into the middle.
    {"camera": {"yaw": 10, "pitch": 4, "zoom": zoom(10.0), "target": [-2.0, 11.5, 0]}, "dur": 6,
     "play": ["lanyard"], "focus": HOOK + LIVE + ["arc"], "labels": ["l_key2"],
     "fx": [{"type": "arrow", "from": on_arc(-AMP), "dir": [0, -1, 0], "len": G_LEN, "role": "energy", "label": "gravity"},
            {"type": "arrow", "from": on_arc(-16), "dir": tangent(-16), "len": 6.5, "role": "energy",
             "label": "back to the middle"}]},
    # 4. Fastest at the bottom, slower as they climb, stopped at the far end.
    {"camera": {"yaw": 10, "pitch": 4, "zoom": zoom(10.0), "target": [2.0, 11.5, 0]}, "dur": 6,
     "play": ["lanyard"], "focus": HOOK + LIVE + ["arc"], "labels": ["r_key2"],
     "fx": [vel(0, V0, "fastest"), vel(18, V0, "slower")]},
    # 5. A heavier bunch on an equal lanyard swings in step.
    {"camera": {"yaw": 12, "pitch": 6, "zoom": zoom(7.6), "target": [X2 / 2, 13.0, 0]}, "explode": 1, "dur": 6,
     "play": ["lanyard", "h_lanyard"], "focus": HOOK + LIVE + HEAVY,
     "labels": ["key2", "h_key2", "h_lanyard"]},
    # 6. The number: one swing there and back in about a second.
    {"camera": {"yaw": 18, "pitch": 6, "zoom": zoom(8.6), "target": [0, 13.2, 0]}, "dur": 6,
     "play": ["lanyard"], "focus": LIVE + ["arc"],
     "number": {"value": "1.0", "unit": "s", "label": "one swing, there and back"}},
]

chapter = {
    "scene": "model3d",
    "lens": "explore",
    "title": "How it works",
    "hint": "Pinch: next step. Up/down: turn it.",
    "captions": [
        "Keys swinging on a lanyard keep a steady beat, wide swings or small.",
        "Just three things matter here: the pivot, the length of the lanyard, and gravity.",
        "Gravity pulls the keys back toward the middle, so they speed up as they fall.",
        "At the bottom they are fastest, overshoot, climb the other side and slow to a stop.",
        "Heavier keys swing in the same time; only the length changes the beat.",
        "25 cm of lanyard: one swing there and back takes about one second.",
    ],
    "spec": {"parts": parts, "beats": beats},
}

if __name__ == "__main__":
    print(len(parts), "parts; key centre radius", r2(RAD))
    main("pendulum", chapter)
