"""Insert (or replace) the phone's Explore chapter as its first chapter in shared/objects.json.

Smartphone lying screen up, cm: 14.7 long (x), 7.15 wide (z), 0.78 thick (y, back glass at y=0).
Layers explode upward evenly (2 cm per layer at explode 1).
"""
import math
from r3d_common import pt, r2, write_chapter, cam_pos, far_point

W, D, T = 14.7, 7.15, 0.78
CR = 1.0  # corner radius
LAYER = 2.0


def rrect(w, d, r, n=6, start_mid=True):
    """Rounded rectangle polygon [x, z], counter-clockwise, starting at the middle of the +x side."""
    pts = []
    corners = [(w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)]
    for cx, cz, a0 in corners:
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    if start_mid:
        pts = [(w / 2, 0.0)] + pts + [(w / 2, 0.0)][:0]
    return [[r2(x), r2(z)] for x, z in pts]


def plate(pid, label, w, d, r, h, y, layer, role="object", n=6, **extra):
    part = {"id": pid, "label": label, "prim": "extrude", "shape": rrect(w, d, r, n), "h": h,
            "pos": pt(0, y, 0), "rot": [0, 0, 0], "scale": 1, "role": role, "explode": [0, LAYER * layer, 0]}
    part.update(extra)
    return part


def box(pid, label, size, pos, layer, role="object", rnd=0, **extra):
    part = {"id": pid, "label": label, "prim": "box", "size": [r2(v) for v in size], "pos": pt(*pos), "rot": [0, 0, 0],
            "scale": 1, "role": role, "explode": [0, LAYER * layer, 0]}
    if rnd:
        part["round"] = rnd
    part.update(extra)
    return part


def tube(pid, label, path, r, layer, role="object", **extra):
    part = {"id": pid, "label": label, "prim": "tube", "path": [pt(*p) for p in path], "r": r, "pos": [0, 0, 0],
            "rot": [0, 0, 0], "scale": 1, "role": role, "explode": [0, LAYER * layer, 0]}
    part.update(extra)
    return part


# frame: a rounded ring (outer outline, then the inner outline backwards, joined by a zero-width slit)
outer = rrect(W, D, CR, 6)
inner = rrect(W - 0.6, D - 0.6, CR - 0.3, 6)
ring = outer + [inner[0]] + list(reversed(inner[1:]))
assert len(ring) <= 64, len(ring)

# touch grid: rows (along x) and columns (along z) as two serpentine wires
GY = 0.70
rows_z = [-1.8, 0.0, 1.8]
cols_x = [-4.5, -1.5, 1.5, 4.5]
XE, ZE = 6.5, 3.0
rows, cols = [], []
for k, z in enumerate(rows_z):
    xs = [-XE, -XE + 0.15, XE - 0.15, XE]
    rows += [(x, GY, z) for x in (xs if k % 2 == 0 else xs[::-1])]
for k, x in enumerate(cols_x):
    zs = [-ZE, -ZE + 0.15, ZE - 0.15, ZE]
    cols += [(x, GY + 0.012, z) for z in (zs if k % 2 == 0 else zs[::-1])]

TOUCH = (1.5, GY, 0.0)  # the crossing the finger touches
E3 = 0.15               # beat 3: layers just apart, finger on the glass
FL = 9.0
TILT = 35
FDIR = (-0.8, 0.0, 0.6)  # the finger leans towards, and slides away to, the camera's left
FMAG = 110.0
# The finger rides at glass height and slides along FDIR with the explode amount: off the picture at
# explode 0 (beat 1) and 0.5 to 1 (beats 2, 4 to 6), on the touched crossing at E3.
FX = [FDIR[0] * -FMAG, LAYER * 5, FDIR[2] * -FMAG]
tip3 = (TOUCH[0], T + 0.03 + LAYER * 5 * E3 + 0.08, TOUCH[2])
tip0 = [tip3[i] - E3 * FX[i] for i in range(3)]
st, ct = math.sin(math.radians(TILT)), math.cos(math.radians(TILT))
LEAN = (0.5, 0.0, -0.866)  # the finger rises up and away from the camera, out of the top of the picture
gam = math.asin(-LEAN[0] * st)
alp = math.asin(LEAN[2] * st / math.cos(gam))
FROT = [r2(math.degrees(alp)), 0, r2(math.degrees(gam))]

PIX_Y = 0.66
pix = [(-3.6, PIX_Y, 0.4), (-3.0, PIX_Y, 0.4), (-2.4, PIX_Y, 0.4)]
pix_off = (-1.8, PIX_Y, 0.4)

parts = [
    plate("back", "Back glass", W, D, CR, 0.08, 0.04, 0),
    plate("bump", "Camera", 3.6, 3.6, 0.8, 0.14, -0.07, 0, n=4,
          **{"pos": pt(-W / 2 + 0.6 + 1.8, -0.07, -D / 2 + 0.6 + 1.8)}),
    {"id": "lens1", "label": "Camera lens", "prim": "cylinder", "r": 0.62, "h": 0.22, "segments": 32,
     "pos": pt(-W / 2 + 1.55, -0.25, -D / 2 + 1.55), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "lens2", "label": "Camera lens", "prim": "cylinder", "r": 0.62, "h": 0.22, "segments": 32,
     "pos": pt(-W / 2 + 1.55, -0.25, -D / 2 + 3.05), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "coil", "label": "Charging coil", "prim": "torus", "r": 2.1, "tube": 0.09,
     "pos": [-1.2, 0.14, 0], "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": [0, LAYER, 0]},
    {"id": "frame", "label": "Frame", "prim": "extrude", "shape": ring, "h": 0.66, "pos": [0, 0.41, 0], "rot": [0, 0, 0],
     "scale": 1, "role": "object", "explode": [0, LAYER * 2, 0]},
    box("battery", "Battery", (8.8, 0.46, 6.0), (-2.2, 0.38, 0), 2, rnd=0.2),
    box("board", "Circuit board", (3.9, 0.09, 6.0), (4.55, 0.25, 0), 2),
    box("chip1", "Processor", (1.5, 0.16, 1.5), (4.55, 0.375, -1.3), 2, rnd=0.05),
    box("chip2", "Memory", (1.3, 0.12, 1.0), (4.4, 0.355, 1.05), 2, rnd=0.04),
    box("chip3", "Radio chip", (0.9, 0.12, 0.9), (5.75, 0.355, 2.05), 2, rnd=0.04),
    plate("oled", "Display", W - 0.5, D - 0.5, CR - 0.25, 0.07, 0.6, 3),
] + [box(f"pix{k + 1}", "Lit pixel", (0.42, 0.04, 0.42), p, 3, role="actor") for k, p in enumerate(pix)] + [
    box("pix_off", "Pixel off", (0.42, 0.04, 0.42), pix_off, 3),
    plate("touch", "Touch grid", W - 0.5, D - 0.5, CR - 0.25, 0.025, 0.69, 4),
    tube("grid_x", "Touch grid", rows, 0.012, 4),
    tube("grid_z", "Touch grid", cols, 0.012, 4),
    plate("glass", "Cover glass", W, D, CR, 0.06, 0.75, 5),
    {"id": "finger", "label": "Finger", "prim": "lathe",
     "profile": [[0, 0], [0.32, 0.05], [0.55, 0.2], [0.7, 0.45], [0.78, 0.9], [0.8, 2.0], [0.82, FL - 0.3], [0.6, FL],
                 [0, FL]],
     "pos": pt(*tip0), "rot": FROT, "scale": 1, "role": "object", "explode": [r2(v) for v in FX]},
    plate("pill", "Front camera", 1.1, 0.36, 0.17, 0.02, 0.645, 3, n=3, **{"pos": pt(W / 2 - 0.85, 0.645, 0)}),
]
assert len(parts) <= 28, len(parts)


def lift(p, layer, e):
    return pt(p[0], p[1] + LAYER * layer * e, p[2])


E4, E5 = 1.0, 1.0
rays = [{"type": "flow", "path": [lift((x, PIX_Y + 0.05, z), 3, E4), lift((x, PIX_Y + 3.4, z), 3, E4)], "role": "actor",
         "speed": 2.2, "count": 2, "label": "light"} for x, _, z in pix]
ions = [{"type": "flow", "path": [lift((-6.2, 0.38, z), 2, E5), lift((1.8, 0.38, z), 2, E5)], "role": "actor",
         "speed": 2.0, "count": 5, "label": "lithium ions"} for z in (-1.4, 1.4)]
current = {"type": "flow", "path": [lift(p, 2, E5) for p in [(2.0, 0.66, -2.4), (2.9, 0.42, -2.4), (3.6, 0.34, -1.3),
                                                                    (4.55, 0.5, -1.3), (4.4, 0.47, 1.05), (5.75, 0.47, 2.05)]],
           "role": "energy", "speed": 2.6, "count": 5, "label": "current"}

R_MODEL = 12.32   # render3d's model radius for this spec (the finger's resting place counts)
K = R_MODEL / 8.27  # zooms below were tuned for the phone alone
CROSS3 = lift(TOUCH, 4, E3)
B3 = {"yaw": 14, "pitch": 40, "zoom": r2(1.75 * K), "target": [0.8, 1.9, 0.3]}
cam3, dist3 = cam_pos(R_MODEL, B3["yaw"], B3["pitch"], B3["zoom"], B3["target"])
ring_at = far_point(R_MODEL, cam3, CROSS3, 1.7)  # rings drawn half size so they stay round the crossing

beats = [
    {"camera": {"yaw": 28, "pitch": 34, "zoom": r2(1.65 * K), "target": [0, 0.4, 0]}, "turn": 10, "dur": 6,
     "ghost": ["grid_x", "grid_z", "pix1", "pix2", "pix3", "pix_off"]},
    {"camera": {"yaw": 24, "pitch": 24, "zoom": r2(1.15 * K), "target": [0, 5.2, 0]}, "explode": 1, "dur": 6,
     "focus": ["oled", "pix1", "pix2", "pix3", "pix_off", "board", "chip1", "chip2", "chip3", "battery"],
     "labels": ["oled", "board", "battery"]},
    {"camera": B3, "explode": E3, "dur": 6,
     "focus": ["grid_x", "grid_z", "finger"],
     "fx": [{"type": "waves", "at": ring_at, "role": "actor", "hz": 1}]},
    {"camera": {"yaw": 20, "pitch": 30, "zoom": r2(2.6 * K), "target": lift((-2.4, PIX_Y + 1.2, 0.4), 3, E4)}, "explode": E4,
     "dur": 6, "focus": ["pix1", "pix2", "pix3"], "labels": ["pix1", "pix_off"],
     "fx": rays},
    {"camera": {"yaw": 22, "pitch": 40, "zoom": r2(1.55 * K), "target": lift((0.5, 0.4, 0), 2, E5)}, "explode": E5, "dur": 6,
     "focus": ["battery", "chip1", "chip2", "chip3"], "labels": ["battery", "chip1"],
     "fx": ions + [current]},
    {"camera": {"yaw": 26, "pitch": 26, "zoom": r2(1.15 * K), "target": [0, 5.2, 0]}, "explode": 1, "dur": 6,
     "focus": ["battery"], "labels": ["battery"],
     "number": {"value": "15", "unit": "Wh", "label": "energy in a full battery"}},
]

chapter = {
    "scene": "model3d",
    "lens": "explore",
    "title": "How it works",
    "hint": "Pinch: next step. Up/down: turn it.",
    "captions": [
        "A phone packs a computer, a radio and a battery into under a centimetre.",
        "Under the glass: a touch grid, a light-making display, a circuit board and a battery.",
        "Your finger changes the electric field at the grid's crossing wires, so the phone knows where.",
        "Each OLED pixel makes its own light; a black pixel is simply switched off.",
        "Lithium ions move inside the battery and push current through the chips.",
        "15 watt-hours in a full battery: a 2 kW kettle uses that in 28 seconds.",
    ],
    "spec": {"parts": parts, "beats": beats},
}

if __name__ == "__main__":
    write_chapter("phone", chapter)
