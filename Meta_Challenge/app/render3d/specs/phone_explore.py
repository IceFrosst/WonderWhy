"""Insert (or replace) the phone's Explore chapter as its first chapter in shared/objects.json.

Smartphone lying screen up, cm: 14.7 long (x; the top with both cameras at -x), 7.15 wide (z), 0.78 thick
(y, back glass at y=0). Layers explode upward evenly (LAYER cm per layer at explode 1):
0 back glass + camera, 1 charging coil, 2 frame + board + battery, 3 display, 4 touch grid, 5 cover glass.

The finger only shows in beat 3. It rides at glass height at explode 0 (beat 3 is the only beat with the
phone fully closed) and slides far out along its own axis with the explode amount, so at beat 1's
explode (0.002: layers 0.02 cm apart, which reads as closed) it is already 20 cm out of the picture and
no other beat change passes through explode 0. Zooms are written for R_TUNED and scaled by Z() to the
renderer's model radius (it prints it; update R_MODEL if the parts change).
"""
import math
from r3d_common import pt, r2, write_chapter, cam_pos, far_point

W, D, T = 14.7, 7.15, 0.78
CR = 1.0  # corner radius
LAYER = 2.5


def rrect(w, d, r, n=6):
    """Rounded rectangle polygon [x, z], counter-clockwise, starting at the middle of the +x side."""
    pts = [(w / 2, 0.0)]
    corners = [(w / 2 - r, d / 2 - r, 0), (-w / 2 + r, d / 2 - r, 90), (-w / 2 + r, -d / 2 + r, 180), (w / 2 - r, -d / 2 + r, 270)]
    for cx, cz, a0 in corners:
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return [[r2(x), r2(z)] for x, z in pts]


def base(pid, label, layer, role="object"):
    return {"id": pid, "label": label, "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": role,
            "explode": [0, r2(LAYER * layer), 0]}


def plate(pid, label, w, d, r, h, pos, layer, role="object", n=6):
    p = base(pid, label, layer, role)
    p.update({"prim": "extrude", "shape": rrect(w, d, r, n), "h": h, "pos": pt(*pos)})
    return p


def box(pid, label, size, pos, layer, role="object", rnd=0):
    p = base(pid, label, layer, role)
    p.update({"prim": "box", "size": [r2(v) for v in size], "pos": pt(*pos)})
    if rnd:
        p["round"] = rnd
    return p


def wire(pid, a, b, layer, role="object"):
    p = base(pid, "Touch grid", layer, role)
    p.update({"prim": "tube", "path": [pt(*a), pt(*b)], "r": 0.014})
    return p


def cyl(pid, label, r, h, pos, layer, role="object"):
    p = base(pid, label, layer, role)
    p.update({"prim": "cylinder", "r": r, "h": h, "segments": 32, "pos": pt(*pos)})
    return p


# frame: a rounded ring (outer outline, then the inner outline backwards, joined by a zero-width slit);
# it fills the gap between the back glass (top at 0.08) and the cover glass (bottom at 0.72)
outer = rrect(W, D, CR, 6)
inner = rrect(W - 0.4, D - 0.4, CR - 0.2, 6)
ring = outer + [inner[0]] + list(reversed(inner[1:]))
assert len(ring) <= 64, len(ring)

# touch grid: 3 row wires along x, 4 column wires along z; the finger touches row z=0 x column x=1.5
GY = 0.655
ROWS_Z = [-1.8, 0.0, 1.8]
COLS_X = [-4.5, -1.5, 1.5, 4.5]
XE, ZE = 6.6, 3.05
TOUCH = (1.5, GY, 0.0)

# finger: tip on the glass above TOUCH at explode 0, leaning up and away from the camera
FL = 13.0
TILT = 32
LEAN = (0.3, 0.0, -0.954)
st, ct = math.sin(math.radians(TILT)), math.cos(math.radians(TILT))
AXIS = (LEAN[0] * st, ct, LEAN[2] * st)
gam = math.asin(-AXIS[0])
alp = math.asin(AXIS[2] / math.cos(gam))
FROT = [r2(math.degrees(alp)), 0, r2(math.degrees(gam))]
TIP = (TOUCH[0], T + 0.02, TOUCH[2])
FMAG = 10000.0
FX = [r2(a * FMAG) for a in AXIS]


def euler_xyz(a, b, c):
    """three.js Euler 'XYZ' (degrees) as a 3x3 matrix: Rx(a) Ry(b) Rz(c)."""
    a, b, c = (math.radians(v) for v in (a, b, c))
    rx = [[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]]
    ry = [[math.cos(b), 0, math.sin(b)], [0, 1, 0], [-math.sin(b), 0, math.cos(b)]]
    rz = [[math.cos(c), -math.sin(c), 0], [math.sin(c), math.cos(c), 0], [0, 0, 1]]
    mul = lambda m, n: [[sum(m[i][k] * n[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    return mul(mul(rx, ry), rz)


# fingernail: on the finger's upper side (facing away from the glass), 0.35 to 1.55 cm from the tip
FR = euler_xyz(*FROT)
up_perp = [(1 if i == 1 else 0) - AXIS[1] * AXIS[i] for i in range(3)]
n = math.sqrt(sum(v * v for v in up_perp))
up_perp = [v / n for v in up_perp]
LOCAL_UP = [sum(FR[k][i] * up_perp[k] for k in range(3)) for i in range(3)]  # R^T n, in the finger's own frame
NAIL_AX = max(range(3), key=lambda i: abs(LOCAL_UP[i]) if i != 1 else -1)
NAIL_SIDE = 1 if LOCAL_UP[NAIL_AX] > 0 else -1
nail_local = [0.72 * LOCAL_UP[0], 0.95, 0.72 * LOCAL_UP[2]]
NAIL_POS = [TIP[i] + sum(FR[i][k] * nail_local[k] for k in range(3)) for i in range(3)]
NAIL_SIZE = [0.95, 1.2, 0.95]
NAIL_SIZE[NAIL_AX] = 0.08
E1 = 0.002  # beat 1: closed to the eye (glass lifted 0.02 cm), finger 20 cm out along its axis

# display pixels: three lit and one switched off, in a row
PIX_Y = 0.625
PS, PG = 0.4, 0.52
PZ = 0.6
pix_x = [-1.6 + PG * k for k in range(4)]

parts = [
    plate("back", "Back glass", W, D, CR, 0.08, (0, 0.04, 0), 0),
    plate("bump", "Camera", 3.5, 3.5, 0.8, 0.14, (W / 2 - 0.55 - 1.75, -0.07, -D / 2 + 0.55 + 1.75), 0, n=4),
    cyl("lens1", "Camera lens", 0.6, 0.2, (W / 2 - 1.5, -0.24, -D / 2 + 1.5), 0),
    cyl("lens2", "Camera lens", 0.6, 0.2, (W / 2 - 1.5, -0.24, -D / 2 + 3.0), 0),
    {**base("coil", "Charging coil", 1), "prim": "torus", "r": 2.0, "tube": 0.09, "pos": [-1.6, 0.14, 0], "rot": [90, 0, 0]},
    {**base("frame", "Frame", 2), "prim": "extrude", "shape": ring, "h": 0.64, "pos": [0, 0.40, 0]},
    box("vol_up", "Volume buttons", (1.3, 0.24, 0.16), (3.9, 0.42, D / 2 + 0.05), 2, rnd=0.07),
    box("vol_dn", "Volume buttons", (1.3, 0.24, 0.16), (2.3, 0.42, D / 2 + 0.05), 2, rnd=0.07),
    box("battery", "Battery", (9.0, 0.46, 6.0), (-2.05, 0.38, 0), 2, rnd=0.2),
    box("board", "Circuit board", (3.9, 0.09, 6.0), (4.55, 0.25, 0), 2),
    box("chip1", "Processor", (1.5, 0.16, 1.5), (4.55, 0.375, -1.3), 2, rnd=0.05),
    box("chip2", "Memory", (1.3, 0.12, 1.0), (4.4, 0.355, 1.05), 2, rnd=0.04),
    box("chip3", "Radio chip", (0.9, 0.12, 0.9), (5.75, 0.355, 2.05), 2, rnd=0.04),
    plate("oled", "Display", W - 0.5, D - 0.5, CR - 0.25, 0.07, (0, 0.6, 0), 3),
] + [box(f"pix{k + 1}", "Lit pixel", (PS, 0.05, PS), (x, PIX_Y, PZ), 3, role="actor") for k, x in enumerate(pix_x[:3])] + [
    box("pix_off", "Pixel off", (PS, 0.05, PS), (pix_x[3], PIX_Y, PZ), 3),
] + [wire(f"row{k + 1}", (-XE, GY, z), (XE, GY, z), 4)
     for k, z in enumerate(ROWS_Z)] + [
    wire(f"col{k + 1}", (x, GY + 0.015, -ZE), (x, GY + 0.015, ZE), 4)
    for k, x in enumerate(COLS_X)] + [
    plate("glass", "Cover glass", W, D, CR, 0.06, (0, 0.75, 0), 5),
    {**base("finger", "Finger", 0), "prim": "lathe",
     "profile": [[0, 0], [0.34, 0.05], [0.58, 0.2], [0.74, 0.48], [0.8, 0.95], [0.79, 1.9], [0.85, 2.35], [0.81, 2.85],
                 [0.84, 4.3], [0.92, 4.85], [0.88, 5.5], [0.92, FL - 0.4], [0.7, FL], [0, FL]],
     "pos": pt(*TIP), "rot": FROT, "explode": FX},
    {**base("nail", "Fingernail", 0), "prim": "box", "size": [r2(v) for v in NAIL_SIZE], "round": 0.03,
     "pos": pt(*NAIL_POS), "rot": FROT, "explode": FX},
]
assert 8 <= len(parts) <= 28, len(parts)
WIRES = [p["id"] for p in parts if p["id"].startswith(("row", "col"))]
TOUCHED = ["row2", "col3"]  # the row and the column that cross under the finger


def lift(p, layer, e):
    return pt(p[0], p[1] + LAYER * layer * e, p[2])


R_MODEL = 10.51  # render3d's model radius for this spec (assembled phone with the finger on the glass)
R_TUNED = 9.72  # the radius the zooms below were tuned at


def Z(z):
    """A zoom tuned at R_TUNED, kept framing the same cm if the model radius changes."""
    return r2(z * R_MODEL / R_TUNED)

# beat 4: light rising from the lit pixels through the touch grid and the cover glass
E4 = 1.0
rays = [{"type": "flow", "path": [lift((x, PIX_Y + 0.05, PZ), 3, E4), lift((x, PIX_Y + 5.2, PZ), 3, E4)], "role": "actor",
         "speed": 2.4, "count": 3, "label": "light"} for x in pix_x[:3]]

# beat 5: ions run along the battery towards its terminals; current leaves the + terminal, runs through
# the processor, the memory and the radio chip and comes back to the - terminal
E5 = 0.35
ions = [{"type": "flow", "path": [lift((-6.1, 0.38, z), 2, E5), lift((2.1, 0.38, z), 2, E5)], "role": "actor",
         "speed": 2.0, "count": 5, "label": "lithium ions"} for z in (-1.3, 1.3)]
loop = [(2.3, 0.66, -2.5), (3.3, 0.42, -2.5), (4.55, 0.52, -1.3), (4.4, 0.5, 1.05), (5.75, 0.5, 2.05),
        (4.0, 0.36, 2.6), (2.3, 0.66, 2.5), (2.3, 0.66, 0.0)]
current = {"type": "flow", "path": [lift(p, 2, E5) for p in loop], "role": "energy", "speed": 3.0, "count": 10,
           "label": "current", "closed": True}

B3 = {"yaw": 16, "pitch": 40, "zoom": Z(1.45), "target": [-0.2, 1.6, 0.2]}
cam3, _ = cam_pos(R_MODEL, B3["yaw"], B3["pitch"], B3["zoom"], B3["target"])
ring_at = far_point(R_MODEL, cam3, TOUCH, 1.3)  # rings drawn smaller so they stay round the crossing

beats = [
    {"camera": {"yaw": 30, "pitch": 24, "zoom": Z(1.6), "target": [0, 0.4, 0]}, "explode": E1, "turn": 10, "dur": 6,
     "ghost": WIRES + ["pix1", "pix2", "pix3", "pix_off"]},
    {"camera": {"yaw": -24, "pitch": 24, "zoom": Z(1.1), "target": [0, 6.6, 0]}, "explode": 1, "dur": 6,
     "focus": ["oled", "board", "chip1", "chip2", "chip3", "battery"] + WIRES,
     "labels": ["oled", "board", "battery"]},
    {"camera": B3, "explode": 0, "dur": 6,
     "focus": TOUCHED + ["finger", "nail"], "labels": ["row3"],
     "fx": [{"type": "waves", "at": ring_at, "role": "actor", "hz": 1}]},
    {"camera": {"yaw": 20, "pitch": 30, "zoom": Z(3.6), "target": lift((pix_x[1] + 0.3, PIX_Y + 1.5, PZ), 3, E4)},
     "explode": E4, "dur": 6, "focus": ["pix1", "pix2", "pix3"], "labels": ["pix1", "pix_off"],
     "fx": rays},
    {"camera": {"yaw": 22, "pitch": 55, "zoom": Z(1.4), "target": lift((0, 0.4, 0), 2, E5)}, "explode": E5, "dur": 6,
     "focus": ["battery", "chip1", "chip2", "chip3"], "labels": ["battery", "chip1"],
     "fx": ions + [current]},
    {"camera": {"yaw": -20, "pitch": 21, "zoom": Z(1.1), "target": [0, 6.6, 0]}, "explode": 1, "dur": 6,
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
    print(len(parts), "parts; finger rot", FROT, "explode", FX, "nail axis", NAIL_AX, NAIL_SIDE, LOCAL_UP)
    write_chapter("phone", chapter)
