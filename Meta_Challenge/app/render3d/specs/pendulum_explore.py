"""Pendulum (keys swinging on a lanyard): Explore chapter. Usage: python pendulum_explore.py [test|clips [beat]|write|dump]"""
import math
from common import main, pt, r2

# cm, y up. Swing plane xy, pivot axis z.
PIVOT_Y = 30.0
STRAP = 0.3
LANYARD = 25.0          # loop top to clasp
FINGER_R = 0.9
X2 = 31.0               # the heavier bunch hangs here in beat 5
HIDE = 56.0             # and waits this far above until then (explode brings it down)
KEY_S = 1.15
SWING = {"swing": {"axis": [0, 0, 1], "deg": 22, "hz": 1.0}}


def lanyard_path():
    """Closed loop over the pivot (local coords, origin = pivot), strands meeting at the clasp."""
    a = FINGER_R + STRAP
    bottom = a - LANYARD
    right = [[0.0, bottom], [0.35, bottom + 5], [0.75, bottom + 13], [1.05, bottom + 20], [a, -0.9]]
    arc = []
    for k in range(9):
        th = math.radians(-10 + 200 * k / 8)  # over the top
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


def bunch(prefix, x, role, keys, label_keys, extra=None, y_off=0.0):
    """Pivot peg, lanyard (swinging), clasp, ring and keys hanging from the ring."""
    path, bottom = lanyard_path()
    py = PIVOT_Y + y_off
    clasp_y = py + bottom - 1.0
    ring_r = 1.9
    ring_y = clasp_y - 1.0 - ring_r + 0.25
    hang_y = ring_y - ring_r + 0.1
    root_explode = [0, -y_off, 0]
    parts = [
        {"id": f"{prefix}pivot", "label": "Pivot", "prim": "cylinder", "r": FINGER_R, "r2": FINGER_R * 0.92, "h": 7, "segments": 28,
         "pos": pt(x, py, 1.2), "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": root_explode},
        {"id": f"{prefix}lanyard", "label": "Lanyard", "prim": "tube", "path": path, "r": STRAP, "closed": True,
         "pos": pt(x, py, 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": root_explode, "anim": SWING},
        {"id": f"{prefix}clasp", "label": "Clasp", "prim": "cylinder", "r": 0.42, "r2": 0.32, "h": 2.0, "segments": 20,
         "pos": pt(x, clasp_y, 0), "rot": [0, 0, 0], "scale": 1, "role": role, "explode": [0, 0, 0], "parent": f"{prefix}lanyard"},
        {"id": f"{prefix}ring", "label": "Key ring", "prim": "torus", "r": ring_r, "tube": 0.14,
         "pos": pt(x, ring_y, 0), "rot": [0, 35, 0], "scale": 1, "role": role, "explode": [0, 0, 0], "parent": f"{prefix}lanyard"},
    ]
    for i, (kind, phi, angle, scale, dz) in enumerate(keys):
        a = math.radians(phi - 90)
        kx, ky = x + (ring_r - 0.1) * math.cos(a), ring_y + (ring_r - 0.1) * math.sin(a)
        parts.append({"id": f"{prefix}key{i + 1}", "label": label_keys if i == 1 else "Key", "prim": "extrude",
                      "shape": key_shape(kind), "h": 0.22, "pos": pt(kx, ky, dz), "rot": [90, angle, 0], "scale": scale,
                      "role": role, "explode": [0, 0, 0], "parent": f"{prefix}lanyard"})
    if extra:
        for p in extra(x, hang_y):
            p["parent"] = f"{prefix}lanyard"
            parts.append(p)
    return parts, hang_y


light, hang1 = bunch("", 0.0, "object",
                     [("yale", -40, -24, KEY_S, -0.3), ("yale", 0, 2, KEY_S, 0.0), ("padlock", 38, 26, KEY_S, 0.3)], "Keys")


def fob(x, hang_y):
    return [{"id": "h_fob", "label": "Key fob", "prim": "box", "size": [3.0, 4.6, 1.3], "round": 0.6,
             "pos": pt(x - 2.0, hang_y - 2.7, -0.9), "rot": [0, 0, 26], "scale": 1, "role": "other", "explode": [0, 0, 0]}]


heavy, hang2 = bunch("h_", X2, "other",
                     [("yale", -40, -20, KEY_S * 1.1, 0.4), ("yale", 0, 4, KEY_S * 1.15, 0.0), ("yale", 38, 24, KEY_S * 1.1, -0.4)],
                     "Heavier keys", fob, HIDE)

rest_line = {"id": "rest", "label": "Rest line", "prim": "cylinder", "r": 0.05, "h": 38, "segments": 8,
             "pos": pt(0, PIVOT_Y - 19, 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]}

def arc(pid, x, hang, role, y_off=0.0):
    """Swing path of the key tips: a thin static arc (the guide the keys sweep along)."""
    rad = PIVOT_Y + y_off - (hang - 9.4)
    path = []
    for k in range(11):
        th = math.radians(-24 + 48 * k / 10)
        path.append(pt(rad * math.sin(th), -rad * math.cos(th), 0))
    return {"id": pid, "label": "Swing path", "prim": "tube", "path": path, "r": 0.07,
            "pos": pt(x, PIVOT_Y + y_off, 0), "rot": [0, 0, 0], "scale": 1, "role": role, "explode": [0, -y_off, 0]}


parts = light + heavy + [rest_line, arc("arc", 0.0, hang1, "actor"), arc("h_arc", X2, hang2, "other", HIDE)]
LIGHT = [p["id"] for p in light]
HEAVY = [p["id"] for p in heavy]
KEY_C = hang1 - 3.75 * KEY_S       # key2 centre at the bottom of the swing
RAD = PIVOT_Y - KEY_C
BOTTOM = pt(0, KEY_C, 0)
TH = math.radians(22)
EXT_L = pt(-RAD * math.sin(TH), PIVOT_Y - RAD * math.cos(TH), 0)
EXT_R = pt(RAD * math.sin(TH), PIVOT_Y - RAD * math.cos(TH), 0)

R_MODEL = 54.59  # bounding sphere radius the renderer reports


def zoom(ppc):
    """Zoom for a scale in pixels per cm."""
    return r2(ppc * R_MODEL / (0.7 * 464 / 2))


CT = math.cos(TH)
ST = math.sin(TH)
KEYS = LIGHT[2:]
beats = [
    {"camera": {"yaw": 24, "pitch": 6, "zoom": zoom(10.5), "target": [0, 14.5, 0]}, "turn": 5, "dur": 6,
     "play": ["lanyard"], "ghost": ["rest", "arc"]},
    {"camera": {"yaw": 30, "pitch": 10, "zoom": zoom(10.5), "target": [1.5, 14.5, 0]}, "dur": 6,
     "ghost": ["rest", "arc"], "labels": ["pivot", "lanyard", "key2"],
     "fx": [{"type": "dim", "on": "lanyard", "text": "25 cm"}]},
    {"camera": {"yaw": 18, "pitch": 6, "zoom": zoom(9.0), "target": [0, 11.0, 0]}, "dur": 6,
     "play": ["lanyard"], "focus": KEYS + ["arc"],
     "fx": [{"type": "arrow", "from": "key2", "dir": [0, -1, 0], "len": 10, "role": "energy", "label": "gravity"},
            {"type": "arrow", "from": EXT_L, "dir": pt(CT, -ST, 0), "len": 5, "role": "energy", "label": "back to the middle"},
            {"type": "arrow", "from": EXT_R, "dir": pt(-CT, -ST, 0), "len": 5, "role": "energy", "label": "back to the middle"}]},
    {"camera": {"yaw": 14, "pitch": 4, "zoom": zoom(13), "target": [0, 9.0, 0]}, "dur": 6,
     "play": ["lanyard"], "focus": KEYS + ["arc"],
     "fx": [{"type": "arrow", "from": BOTTOM, "dir": [1, 0, 0], "len": 9, "role": "actor", "label": "fastest"}]},
    {"camera": {"yaw": 16, "pitch": 6, "zoom": zoom(7.9), "target": [X2 / 2, 13.0, 0]}, "explode": 1, "dur": 6,
     "play": ["lanyard", "h_lanyard"], "focus": LIGHT[1:] + HEAVY[1:] + ["arc", "h_arc"], "labels": ["key2", "h_key2"]},
    {"camera": {"yaw": 22, "pitch": 6, "zoom": zoom(10.5), "target": [0, 14.5, 0]}, "dur": 6,
     "play": ["lanyard"], "focus": LIGHT[1:],
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
    print(len(parts), "parts")
    main("pendulum", chapter)
