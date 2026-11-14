"""Earbuds Explore chapter, realistic style (MODEL3D v2). Writes out/earbuds_chapter.json and out/earbuds_object.json.

Plain Python 3, standard library only. Does NOT touch shared/objects.json.
Units: millimetres, y up. The nozzle (and the ear canal) point along +x; the outer face of the bud is -x;
the stem hangs down (-y). Camera yaw 0 looks from +z (x runs left to right on screen); negative yaw
swings the camera round to the outer face (-x).
"""
import json, math, os

from common import r2, pt

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")

AX = [0, 0, -90]  # local +y (lathe, cylinder, capsule, helix axis) -> world +x

# ---- head shell: superellipse of revolution about the x axis, squashed in z
P_EXP = 2.4
R_HEAD = 10.5   # y radius at the seam (x = 0)
Z_SQ = 0.9      # z radius = 0.9 x y radius
A_OUT = 9.0     # outer half depth (towards -x)
A_IN = 7.2      # inner half depth (towards +x, the ear)
WALL = 0.8


def superellipse(a, R, n=18, sign=1):
    """[[r, x], ...] from the pole (r 0) to the seam (r R)."""
    pts = []
    for i in range(n + 1):
        th = (math.pi / 2) * i / n
        x = a * (math.cos(th) ** (2 / P_EXP))
        r = R * (math.sin(th) ** (2 / P_EXP))
        pts.append([r, sign * x])
    return pts


def shell_profile(a, sign):
    outer = superellipse(a, R_HEAD, 18, sign)
    inner = superellipse(a - WALL, R_HEAD - WALL, 14, sign)
    prof = outer + [[R_HEAD - WALL, 0.0]] + list(reversed(inner))[1:]
    if sign > 0:
        prof = list(reversed(prof))  # keep the profile going up the lathe axis
    return [[r2(r), r2(y)] for r, y in prof]


def surface(a, theta_deg, sign):
    """Point (x, y) on the shell's outer surface in the x-y plane and its outward normal."""
    th = math.radians(theta_deg)
    x = a * (math.cos(th) ** (2 / P_EXP))
    r = R_HEAD * (math.sin(th) ** (2 / P_EXP))
    nx = (x ** (P_EXP - 1)) / a ** P_EXP
    ny = (r ** (P_EXP - 1)) / R_HEAD ** P_EXP
    L = math.hypot(nx, ny)
    return (sign * x, r), (sign * nx / L, ny / L)


def on_shell(a, theta, sign, depth=0.0):
    (x, y), (nx, ny) = surface(a, theta, sign)
    rot_z = math.degrees(math.atan2(ny, nx))  # local +x along the normal
    return [x + nx * depth, y + ny * depth], [0, 0, r2(rot_z)]


parts = []


def add(pid, label, prim, pos, material=None, explode=(0, 0, 0), order=None, rot=(0, 0, 0), scale=1, role="object", **kw):
    if kw.get("parent"):
        explode = (0, 0, 0)  # a child already follows its parent's explode; its own would double it
    p = {"id": pid, "label": label, "prim": prim, "pos": pt(*pos), "rot": [r2(v) for v in rot], "scale": scale,
         "role": role, "explode": pt(*explode)}
    if material:
        p["material"] = material
    if order is not None:
        p["order"] = order
    p.update(kw)
    parts.append(p)
    return p


# ---- exploded view: every group gets a target centre on one line along x (the nozzle axis).
# Rest centres (x) and targets; the stem drops below the line. Outer parts leave first (order).
def ex(rest_x, target_x, dy=0.0, dz=0.0):
    return (target_x - rest_x, dy, dz)


E_SHELL_OUT = ex(-4.5, -38.0)
E_MIC_OUT = ex(-7.2, -29.5, 5.0)
E_PCB = ex(-5.5, -24.5)
E_BATT = ex(-2.6, -16.0)
E_CUP = ex(1.65, -7.6)
E_COIL = ex(3.2, -1.2)
E_CONE = ex(5.1, 5.6, 0.8)
E_MIC_IN = ex(6.2, 11.0, 4.5)
E_SHELL_IN = (16.5, 0, 0)
E_MESH = (19.5, 0, 0)
E_TIP = (27.0, -2.0, 0)
E_STEM = ex(-2.6, -20.0, -12.5)
E_ANT = ex(-1.4, -12.5, -12.5)
E_CANAL = (150, 0, 0)

# ---------------- shell
add("shell_out", "Outer shell", "lathe", (0, 0, 0), "plastic_white", E_SHELL_OUT, 0, rot=AX, scale=[1, 1, Z_SQ],
    profile=shell_profile(A_OUT, -1), roughness=0.2)
add("shell_in", "Inner shell", "lathe", (0, 0, 0), "plastic_white", E_SHELL_IN, 2, rot=AX, scale=[1, 1, Z_SQ],
    profile=shell_profile(A_IN, 1), roughness=0.2)
add("seam", "Seam", "torus", (0, 0, 0), "plastic", E_SHELL_OUT, 0, rot=[0, 90, 0], scale=[Z_SQ, 1, 1],
    r=R_HEAD - 0.02, tube=0.12, color="#9aa0a8", roughness=0.5, parent="shell_out")

# outer mic grille on the outer face, upper part (feed-forward mic)
G_TH = 38
gpos, grot = on_shell(A_OUT, G_TH, -1, -0.12)
add("grille_out", "Outer mic", "box", (gpos[0], gpos[1], 0), "plastic", E_SHELL_OUT, 0, rot=grot,
    size=[0.5, 2.4, 3.6], round=0.24, color="#474c53", roughness=0.85, parent="shell_out")
for k, dz in enumerate((-0.95, 0.0, 0.95)):
    hp, hr = on_shell(A_OUT, G_TH, -1, 0.07)
    add(f"grille_dot{k}", "Grille holes", "cylinder", (hp[0], hp[1], dz), "plastic", E_SHELL_OUT, 0,
        rot=[0, 0, hr[2] - 90], r=0.3, h=0.22, segments=16, color="#41464d", roughness=0.85, parent="shell_out")
mpos, mrot = on_shell(A_OUT, G_TH, -1, -1.75)
add("mic_out", "Outer mic", "box", (mpos[0], mpos[1], 0), "aluminium", E_MIC_OUT, 1, rot=mrot, size=[1.1, 2.7, 3.4], round=0.18)
bpos, _ = on_shell(A_OUT, G_TH, -1, -2.55)
add("mic_out_board", "Outer mic", "box", (bpos[0], bpos[1], 0), "pcb", E_MIC_OUT, 1, rot=mrot, size=[0.35, 3.4, 4.0], parent="mic_out")
ppos, _ = on_shell(A_OUT, G_TH, -1, -1.15)
add("mic_out_port", "Outer mic", "cylinder", (ppos[0], ppos[1], 0), "plastic", E_MIC_OUT, 1, rot=[0, 0, mrot[2] - 90], r=0.38,
    h=0.12, segments=16, color="#30343a", parent="mic_out")

# pressure vent on top of the inner half
vpos, vrot = on_shell(A_IN, 62, 1, -0.1)
add("vent", "Pressure vent", "box", (vpos[0], vpos[1], 0), "plastic", E_SHELL_IN, 2, rot=vrot, size=[0.45, 1.2, 2.8],
    round=0.2, color="#5c626a", roughness=0.8, parent="shell_in")
# skin-detect sensor window on the inner half, lower front
spos, srot = on_shell(A_IN, 40, 1, -0.1)
add("sensor", "Skin sensor", "box", (spos[0], -spos[1] * 0.85, 2.2), "screen", E_SHELL_IN, 2, rot=[0, 0, -srot[2]],
    size=[0.4, 1.6, 1.0], round=0.18, parent="shell_in")
# three small bass-vent holes near the nozzle root
for k, a in enumerate((-30, 0, 30)):
    th = math.radians(a)
    vp, vr = on_shell(A_IN, 30, 1, -0.05)
    add(f"vent_hole{k}", "Vent hole", "cylinder", (vp[0], -vp[1] * math.cos(th), vp[1] * math.sin(th) * Z_SQ), "plastic",
        E_SHELL_IN, 2, rot=[a, 0, -vr[2] - 90], r=0.28, h=0.3, segments=12, color="#4b5057", roughness=0.8, parent="shell_in")
# inner mic port: a tiny hole on the nozzle root
add("mic_in_port", "Inner mic", "cylinder", (7.6, 3.15, 0.9), "plastic", E_SHELL_IN, 2, rot=[0, 0, 0], r=0.3, h=0.2,
    segments=12, color="#3c4147", parent="shell_in")

# ---------------- nozzle, mesh, ear tip
add("nozzle", "Nozzle", "cylinder", (9.0, 0.6, 0), "plastic_white", E_SHELL_IN, 2, rot=AX, r=2.75, h=6.4, segments=40,
    parent="shell_in")
add("nozzle_mesh", "Nozzle mesh", "cylinder", (12.25, 0.6, 0), "steel", E_MESH, 1, rot=AX, r=2.35, h=0.22, segments=40, roughness=0.5)
add("nozzle_ring", "Nozzle mesh", "torus", (12.3, 0.6, 0), "chrome", E_MESH, 1, rot=[0, 90, 0], r=2.4, tube=0.18, parent="nozzle_mesh")
# ear tip: a thin silicone umbrella on a sleeve (so a cut shows the real section: sleeve, air, folded cap)
tip_poly = [[2.75, 7.6], [3.2, 7.6], [3.2, 14.9], [4.3, 14.4], [5.3, 13.4], [5.85, 12.2], [5.95, 11.0], [5.7, 9.9],
            [5.1, 8.9], [4.4, 8.3], [4.55, 7.95], [4.95, 8.15], [5.6, 8.8], [6.25, 9.9], [6.45, 11.1], [6.25, 12.4],
            [5.65, 13.6], [4.7, 14.7], [3.6, 15.5], [2.75, 15.8]]


def ccw(poly):
    """Close the (r, y) polygon and orient it counter-clockwise (outer surface going up the axis)."""
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly)))
    out = poly if area > 0 else list(reversed(poly))
    return [[r2(r), r2(y)] for r, y in out + [out[0]]]


tip_profile = ccw(tip_poly)
add("tip", "Ear tip", "lathe", (0, 0.6, 0), "silicone", E_TIP, 0, rot=AX, profile=tip_profile, color="#8d959d", roughness=0.55)
add("tip_base", "Ear tip", "cylinder", (7.85, 0.6, 0), "plastic_grey", E_TIP, 0, rot=AX, r=3.05, h=0.9, segments=40, parent="tip")

# ---------------- speaker driver (axis +x, cone faces the nozzle)
add("cup", "Magnet cup", "cylinder", (1.35, 0.3, 0), "aluminium", E_CUP, 4, rot=AX, r=3.9, h=2.3, segments=40, roughness=0.35)
add("magnet", "Magnet", "cylinder", (2.65, 0.3, 0), "magnet", E_CUP, 4, rot=AX, r=2.35, h=0.9, segments=40, parent="cup")
add("pole", "Pole piece", "cylinder", (3.15, 0.3, 0), "steel", E_CUP, 4, rot=AX, r=2.2, h=0.2, segments=40, parent="cup")
add("coil", "Voice coil", "helix", (3.2, 0.3, 0), "copper", E_COIL, 5, rot=AX, r=2.75, h=1.5, turns=9, tube=0.12)
add("lead_a", "Coil wire", "tube", (0, 0, 0), "copper", E_COIL, 5, r=0.07,
    path=[pt(3.6, 3.05, 0.2), pt(3.9, 3.9, 0.3), pt(3.7, 4.6, 0.6)], parent="coil")
add("lead_b", "Coil wire", "tube", (0, 0, 0), "copper", E_COIL, 5, r=0.07,
    path=[pt(2.8, 3.05, -0.2), pt(3.0, 3.9, -0.4), pt(3.3, 4.6, -0.8)], parent="coil")
cone = [[0, 4.55], [1.3, 4.5], [2.35, 4.3], [2.8, 4.05], [3.3, 4.2], [4.2, 4.6], [5.1, 5.1], [5.55, 5.25]]
add("cone", "Speaker", "lathe", (0, 0.3, 0), "plastic", E_CONE, 4, rot=AX, profile=cone, color="#d8c08e", roughness=0.35,
    anim={"pulse": {"scale": 1.07, "hz": 2}})
add("dustcap", "Speaker", "lathe", (0, 0.3, 0), "aluminium", E_CONE, 4, rot=AX,
    profile=[[0, 4.95], [0.8, 4.88], [1.5, 4.7], [2.0, 4.5]], parent="cone")
add("surround", "Speaker", "torus", (5.25, 0.3, 0), "aluminium", E_CONE, 4, rot=[0, 90, 0], r=5.6, tube=0.32, parent="cone")
add("spk_tab", "Speaker", "box", (5.0, 0.3 + 5.75, 0), "gold", E_CONE, 4, size=[0.8, 1.0, 1.6], round=0.1, parent="cone")
add("gasket", "Gasket", "torus", (6.0, 0.6, 0), "foam", E_CONE, 4, rot=[0, 90, 0], r=3.0, tube=0.32, parent="cone")

# inner (feedback) mic just in front of the speaker, beside the nozzle root
add("mic_in", "Inner mic", "box", (6.2, 4.2, 0.6), "aluminium", E_MIC_IN, 3, size=[1.3, 1.1, 1.6], round=0.15)
add("mic_in_base", "Inner mic", "box", (6.2, 3.55, 0.6), "pcb", E_MIC_IN, 3, size=[1.8, 0.3, 2.2], parent="mic_in")

# ---------------- PCB with the ANC chip (faces -x), behind the battery
pcb_shape = []
for i in range(40):
    a = 2 * math.pi * i / 40
    x, z = 6.3 * math.cos(a), 6.0 * math.sin(a)
    x = min(x, 4.9)  # flat edge at the bottom where the flex leaves
    pcb_shape.append(pt(x, z, 0)[:2])
PCB_X = -5.2
add("pcb", "Circuit board", "extrude", (PCB_X, 0.6, 0), "pcb", E_PCB, 2, rot=AX, shape=pcb_shape, h=0.55)
add("chip", "Chip", "box", (PCB_X - 0.55, 1.4, -0.3), "chip", E_PCB, 2, size=[0.6, 3.6, 3.6], round=0.08, parent="pcb")
add("chip_mark", "Chip", "box", (PCB_X - 0.87, 2.6, 0.9), "plastic", E_PCB, 2, size=[0.05, 0.5, 0.5], round=0.02, color="#9aa1a9", parent="pcb")
add("chip_bt", "Radio chip", "box", (PCB_X - 0.45, -2.5, 1.6), "chip", E_PCB, 2, size=[0.4, 2.0, 2.2], round=0.06, parent="pcb")
add("crystal", "Crystal", "box", (PCB_X - 0.4, -2.3, -2.4), "aluminium", E_PCB, 2, size=[0.35, 1.2, 1.7], round=0.08, parent="pcb")
for k, (y, z, c) in enumerate(((3.9, 2.9, "#c9a46a"), (4.1, -2.4, "#c9a46a"), (-0.4, 4.0, "#d8d2c4"), (-0.8, -4.1, "#d8d2c4"),
                               (1.5, 4.5, "#c9a46a"), (-4.2, -0.6, "#d8d2c4"), (-3.4, 3.6, "#c9a46a"))):
    add(f"cap{k}", "Component", "box", (PCB_X - 0.42, y, z), "plastic", E_PCB, 2, size=[0.32, 0.55, 1.0], round=0.05,
        color=c, roughness=0.4, parent="pcb")
for k, (y, z) in enumerate(((4.6, 0.4), (-3.9, 2.9))):
    add(f"screw{k}", "Screw", "cylinder", (PCB_X - 0.42, y, z), "steel", E_PCB, 2, rot=AX, r=0.42, h=0.3, segments=16, parent="pcb")
add("flex", "Flex cable", "tube", (0, 0, 0), "plastic", E_PCB, 2, r=0.22, color="#d9973a", roughness=0.45, parent="pcb",
    path=[pt(PCB_X - 0.1, -4.3, 0), pt(PCB_X - 0.6, -6.5, 0), pt(-3.2, -9.0, 0), pt(-2.4, -12.0, 0)])

# ---------------- battery (button cell) between PCB and speaker
add("battery", "Battery", "cylinder", (-2.6, 0.4, 0), "battery", E_BATT, 3, rot=AX, r=4.9, h=3.2, segments=48)
add("batt_cap", "Battery", "cylinder", (-0.95, 0.4, 0), "steel", E_BATT, 3, rot=AX, r=4.1, h=0.12, segments=48, parent="battery")
add("batt_ring", "Battery", "torus", (-0.98, 0.4, 0), "plastic", E_BATT, 3, rot=[0, 90, 0], r=4.5, tube=0.18, color="#6c7279",
    parent="battery")
add("batt_tab", "Battery tab", "box", (-4.1, 4.2, 0), "copper", E_BATT, 3, size=[0.25, 2.8, 1.4], parent="battery")

# ---------------- stem (hangs down from the outer half)
STEM_X, STEM_Y = -2.6, -17.6
add("stem", "Stem", "capsule", (STEM_X, STEM_Y, 0), "plastic_white", E_STEM, 1, rot=[0, 0, 0], scale=[1, 1, 0.82],
    r=2.95, h=15.0, roughness=0.2)
add("stem_flat", "Press sensor", "box", (STEM_X - 0.1, -15.0, 2.36), "plastic", E_STEM, 1, size=[3.0, 6.0, 0.12], round=0.05,
    color="#e6e9ec", roughness=0.45, parent="stem")
add("stem_grille", "Voice mic", "box", (STEM_X - 2.78, -25.2, 0), "plastic", E_STEM, 1, size=[0.4, 2.0, 1.5], round=0.18,
    color="#5c626a", roughness=0.8, parent="stem")
add("voice_mic", "Voice mic", "box", (STEM_X - 1.4, -25.2, 0), "aluminium", E_STEM, 1, size=[1.4, 2.2, 1.8], round=0.12,
    parent="stem")
for k, dx in enumerate((-1.15, 1.15)):
    add(f"contact{k}", "Charging contact", "sphere", (STEM_X + dx, STEM_Y - 10.25, 0), "gold", E_STEM, 1,
        scale=[1, 0.42, 1], r=0.75, parent="stem")
add("antenna", "Antenna", "box", (STEM_X + 1.2, -16.5, 0), "gold", E_ANT, 1, size=[0.15, 13.0, 1.7], round=0.05)
add("ant_flex", "Antenna", "box", (STEM_X + 0.4, -16.5, 0), "plastic", E_ANT, 1, size=[0.2, 13.4, 2.4], color="#d9973a",
    roughness=0.45, parent="antenna")

# ---------------- ear context: a cut-open slice of the ear (skin flange, canal, eardrum). Arrives in beat 3.
CANAL_END = 30.0
FACE_X = 8.6
canal_inner = [[6.95, FACE_X], [6.5, 9.4], [6.38, 10.2], [6.35, 11.0], [6.28, 12.0], [5.95, 13.5], [5.5, 15.5],
               [4.95, 19.0], [4.45, 23.5], [4.2, 27.5], [4.1, CANAL_END], [4.1, CANAL_END + 1.6]]
# skin surface: a shallow bowl (the concha) curving into the canal, thin walls so the cut reads as a slice
bowl_front = [[7.8, 8.15], [9.5, 7.75], [12.0, 7.4], [15.0, 7.15], [18.0, 7.0]]
bowl_rim = [[18.7, 7.2], [18.85, 7.8], [18.3, 8.35]]
bowl_back = [[15.0, 8.5], [12.0, 8.8], [10.0, 9.3], [8.8, 10.25], [8.2, 11.4]]
canal_outer = [[7.7, 13.5], [7.15, 16.0], [6.3, 21.0], [5.8, 26.0], [5.6, CANAL_END + 1.6]]
flesh = [[6.95, FACE_X]] + bowl_front + bowl_rim + bowl_back + canal_outer + list(reversed(canal_inner))[:-1] + [[6.95, FACE_X]]
add("canal", "Ear canal", "lathe", (0, 0.6, 0), "plastic", E_CANAL, 9, rot=AX, profile=[[r2(r), r2(y)] for r, y in flesh],
    color="#e0a08a", roughness=0.62)
EAR_TILT = 18
add("eardrum", "Eardrum", "cylinder", (CANAL_END, 0.6, 0), "plastic", E_CANAL, 9, rot=[0, 0, -90 + EAR_TILT], r=4.3, h=0.22,
    segments=40, color="#f1c9b6", roughness=0.4)
add("eardrum_rim", "Eardrum", "torus", (CANAL_END, 0.6, 0), "plastic", E_CANAL, 9, rot=[0, 90, EAR_TILT], r=4.3, tube=0.2,
    color="#d58d78", roughness=0.5, parent="eardrum")

CANAL_PARTS = ["canal", "eardrum", "eardrum_rim"]
SHELLS = ["shell_out", "shell_in", "seam", "grille_out", "grille_dot0", "grille_dot1", "grille_dot2", "nozzle", "vent",
          "sensor", "vent_hole0", "vent_hole1", "vent_hole2", "mic_in_port", "stem", "stem_flat", "stem_grille"]
SPEAKER = ["cup", "magnet", "pole", "cone", "dustcap", "surround", "gasket"]
CUT = {"normal": [0, 0, 1], "offset": 0}


def cut(ids):
    return dict(CUT, parts=list(ids))


# ---------------- waves (all in the x-y plane, z = 0)
AXIS_Y = 0.6
TIP_OPEN = 16.0
gx, gy = on_shell(A_OUT, G_TH, -1, 0.0)[0]
(_, _), (gnx, gny) = surface(A_OUT, G_TH, -1)
GRILLE = [gx, gy]


def along_grille(d):
    return [r2(gx + gnx * d), r2(gy + gny * d), 0]


SEAL_TOP = [8.9, AXIS_Y + 7.0, 0]
CONE_X = 5.8
HUM_LAMBDA = 7.68  # mm on screen: one wavelength of the drawn hum (same for noise and anti-noise)


def hum(x0, x1, amp, decay, role, phase=0.0, y=AXIS_Y, origin=-32.0):
    """A hum segment on the canal axis whose phase is continuous in world x (sin(2 pi (x - origin) / lambda + phase)),
    so segments join seamlessly and the anti-noise (phase 180) is the exact mirror wherever both are drawn."""
    ph = (360.0 * (x0 - origin) / HUM_LAMBDA + phase) % 360.0
    return {"type": "sine", "from": [r2(x0), r2(y), 0], "to": [r2(x1), r2(y), 0], "amp": amp,
            "waves": r2((x1 - x0) / HUM_LAMBDA), "speed": 0.5, "phase": r2(ph), "decay": decay, "role": role}

beats = [
    # 1 Meet it: the bud alone, three-quarter from the outer face, slow turn
    {"camera": {"yaw": -34, "pitch": 12, "zoom": 1.5, "target": [1.5, -7.0, 0]}, "turn": 10, "dur": 6,
     "explode": 1, "explodeOnly": CANAL_PARTS},
    # 2 Take it apart: staged explode along the nozzle axis, the stem drops below
    {"camera": {"yaw": -30, "pitch": 5, "zoom": 0.86, "target": [-1.5, -5.0, 0]}, "explode": 1, "dur": 9, "move": 3.6,
     "stagger": 2.6, "labels": ["mic_out", "chip", "spk_tab", "tip"]},
    # 3 The seal: the slice of ear arrives, short fast waves bounce off where the tip seals the canal
    # Incoming waves come down at 31 and 40 degrees, reflect about a surface normal at about 131 degrees (up-left, out
    # of the gap between bud and skin) and leave steeply upwards, clear of the skin rim: a clear V with its tip on the seal, nothing crossing
    # into the canal behind the tip.
    {"camera": {"yaw": -6, "pitch": 6, "zoom": 1.45, "target": [8.0, -1.5, 0]}, "explode": 0, "dur": 9, "move": 3.4,
     "stagger": 1.8, "focus": ["tip", "tip_base"] + CANAL_PARTS, "labels": ["tip"], "cut": cut(CANAL_PARTS[:1]),
     "fx": [
         {"type": "sine", "from": [-12, 20, 0], "to": SEAL_TOP, "amp": 0.6, "waves": 9, "speed": 2.5, "role": "other"},
         {"type": "sine", "from": [-9, 22.5, 0], "to": SEAL_TOP, "amp": 0.6, "waves": 9, "speed": 2.5, "role": "other"},
         {"type": "sine", "from": SEAL_TOP, "to": [2.84, 21.9, 0], "amp": 0.5, "waves": 6, "speed": 2.5, "decay": 0.3, "role": "other"},
         {"type": "sine", "from": SEAL_TOP, "to": [1.21, 19.9, 0], "amp": 0.5, "waves": 6, "speed": 2.5, "decay": 0.3, "role": "other"},
         {"type": "arrow", "from": [1.2, 21.6, 0], "dir": [-0.45, 0.89, 0], "len": 3.5, "role": "other"},
         {"type": "arrow", "from": [-6.5, 19.0, 0], "dir": [0.83, -0.56, 0], "len": 3.5, "role": "other"},
     ]},
    # 4 The outer mic hears the hum first
    {"camera": {"yaw": -26, "pitch": 6, "zoom": 1.45, "target": [7.0, -1.5, 0]}, "dur": 9,
     "labels": ["grille_out", "eardrum"], "cut": cut(CANAL_PARTS[:1]),
     "fx": [
         {"type": "sine", "from": along_grille(26), "to": along_grille(0.6), "amp": 2.4, "waves": 2.0, "speed": 0.5, "role": "energy"},
         {"type": "glow", "on": "grille_out", "role": "energy", "hz": 1},
     ]},
    # 5 The chip flips it: noise above, its mirror copy right under it
    {"camera": {"yaw": -40, "pitch": 8, "zoom": 1.9, "target": [-4.0, 7.0, 0]}, "dur": 9,
     "focus": ["chip", "pcb"], "ghost": CANAL_PARTS, "labels": ["chip"], "cut": cut(SHELLS + CANAL_PARTS[:1]),
     "fx": [
         {"type": "sine", "from": [-31, 20.5, 0], "to": [-3, 20.5, 0], "amp": 2.4, "waves": 2.5, "speed": 0.5, "role": "energy"},
         {"type": "sine", "from": [-31, 13.5, 0], "to": [-3, 13.5, 0], "amp": 2.4, "waves": 2.5, "speed": 0.5, "phase": 180, "role": "actor"},
         {"type": "glow", "on": "chip", "role": "actor", "hz": 1},
         {"type": "flow", "path": [along_grille(-1.0), [-7.6, 4.6, -0.4], [-6.1, 2.4, -0.3]], "role": "energy", "speed": 3, "count": 3},
         {"type": "flow", "path": [[-6.1, 1.0, -0.3], [-5.0, 5.6, 1.5], [0.5, 6.0, 1.5], [4.6, 4.2, 0.5]], "role": "actor", "speed": 4, "count": 4},
     ]},
    # 6 The speaker plays it: both waves run into the canal and cancel to a flat green line
    {"camera": {"yaw": 14, "pitch": 6, "zoom": 1.6, "target": [15.0, -0.5, 0]}, "dur": 10,
     "focus": SPEAKER + CANAL_PARTS, "play": ["cone"], "labels": ["spk_tab", "eardrum"],
     "cut": cut(SHELLS + CANAL_PARTS[:1] + ["tip", "tip_base"]),
     # The hum comes from the room, through the bud (low sound passes the seal) into the canal; the anti-noise
     # starts at the cone. In the canal both have the same wavelength and amplitude and opposite phase.
     "fx": [
         hum(-32, CONE_X, 2.3, 1.0, "energy"),
         hum(CONE_X, 25, 2.3, 0.0, "energy"),
         hum(CONE_X, 25, 2.3, 0.0, "actor", 180),
         {"type": "sine", "from": [22, AXIS_Y, 0], "to": [CANAL_END - 0.4, AXIS_Y, 0], "amp": 0.01, "waves": 1, "speed": 0.5, "role": "answer"},
         {"type": "glow", "on": "cone", "role": "actor", "hz": 2},
     ]},
    # 7 The number
    {"camera": {"yaw": -24, "pitch": 10, "zoom": 1.05, "target": [9, -6, 0]}, "dur": 7,
     "cut": cut(CANAL_PARTS[:1]),
     "fx": [{"type": "sine", "from": [TIP_OPEN, AXIS_Y, 0], "to": [CANAL_END - 0.4, AXIS_Y, 0], "amp": 0.01, "waves": 1, "speed": 0.5, "role": "answer"}],
     "number": {"value": "30", "unit": "dB", "label": "quieter on a steady hum"}},
    # 8 So what: hum flat, voice spikes pass
    {"camera": {"yaw": -16, "pitch": 8, "zoom": 1.15, "target": [3, 2, 0]}, "dur": 10,
     "labels": ["eardrum"], "cut": cut(CANAL_PARTS[:1]),
     "fx": [
         {"type": "sine", "from": along_grille(30), "to": along_grille(0.6), "amp": 2.2, "waves": 2.0, "speed": 0.5, "role": "energy"},
         {"type": "sine", "from": [TIP_OPEN, AXIS_Y + 1.8, 0], "to": [CANAL_END - 0.4, AXIS_Y + 1.8, 0], "amp": 0.01, "waves": 1, "speed": 0.5, "role": "answer"},
         {"type": "sine", "from": [-40, AXIS_Y - 3, 0], "to": [-9.6, AXIS_Y - 3, 0], "amp": 2.0, "waves": 9, "speed": 1.5, "role": "other"},
         {"type": "sine", "from": [-40, AXIS_Y - 3, 0], "to": [-9.6, AXIS_Y - 3, 0], "amp": 1.0, "waves": 23, "speed": 3.5, "phase": 40, "role": "other"},
         {"type": "sine", "from": [TIP_OPEN, AXIS_Y - 1.2, 0], "to": [CANAL_END - 0.4, AXIS_Y - 1.2, 0], "amp": 1.4, "waves": 5, "speed": 1.5, "decay": 0.7, "role": "other"},
         {"type": "sine", "from": [TIP_OPEN, AXIS_Y - 1.2, 0], "to": [CANAL_END - 0.4, AXIS_Y - 1.2, 0], "amp": 0.7, "waves": 13, "speed": 3.5, "decay": 0.7, "phase": 40, "role": "other"},
     ]},
]

captions = [
    "These earbuds make a noisy room quiet by playing extra sound into your ear.",
    "Inside: a soft ear tip, a tiny speaker, two microphones, a chip and a battery.",
    "The silicone tip seals your ear canal, which already blocks most high-pitched sound.",
    "The outer microphone hears the low hum of the room before it reaches your eardrum.",
    "The chip makes a mirror copy of that hum: every peak becomes a dip.",
    "The speaker plays it; peak meets dip, and the two waves add up to almost nothing.",
    "About a thousand times less sound energy from a steady hum.",
    "Steady drones vanish, but sudden or high sounds like voices still get through.",
]

chapter = {
    "scene": "model3d",
    "lens": "explore",
    "title": "How it works",
    "hint": "Pinch: next step. Up/down: turn it.",
    "captions": captions,
    "spec": {"style": "real", "parts": parts, "beats": beats},
}

obj = {"id": "earbuds", "name": "Noise-cancelling earbuds", "chapters": [chapter]}

if __name__ == "__main__":
    assert len(captions) == len(beats) == 8
    assert 50 <= len(parts) <= 90, len(parts)
    ids = [p["id"] for p in parts]
    assert len(ids) == len(set(ids))
    for c in captions:
        assert len(c.split()) <= 16, c
    for b in beats:
        assert len(b.get("fx", [])) <= 6 and len(b.get("labels", [])) <= 4
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "earbuds_chapter.json"), "w", encoding="utf-8") as f:
        json.dump(chapter, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "earbuds_object.json"), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    total = sum(b.get("move", 0.8) + b.get("dur", 6) for b in beats)
    print(f"ok: {len(parts)} parts, {len(beats)} beats, {total:.1f} s")
