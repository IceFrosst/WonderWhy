"""Spoon (metal spoon in hot tea): Explore chapter. Usage: python spoon_explore.py [test|clips [beat]|write|dump]"""
import math
from common import main, pt, r2, basis_to_euler, norm, cross, add

# cm, y up. Mug of tea at the origin with a steel teaspoon leaning on the rim towards +x.
# A second mug with a wooden spoon waits out of frame at -x (beats 4-5), a saucepan at +x (beat 6).
CUP_R, CUP_H = 4.25, 9.5
TEA_Y = 7.6
A = math.radians(28)                 # spoon lean from vertical
U = [math.sin(A), math.cos(A), 0.0]  # along the spoon, bowl -> handle end
NZ = [0.0, 0.0, 1.0]                 # bowl opening faces the viewer
XL = cross(NZ, U)                    # local x of the spoon frame
SPOON_EUL = basis_to_euler(XL, NZ, U)
X2 = -26.0                           # second mug
XP = 46.0                            # saucepan


def bowl_origin(xc):
    return [xc + 0.32, 2.4, 0.0]


def along(b0, s, lift=0.0):
    return [b0[i] + U[i] * s + NZ[i] * lift for i in range(3)]


def mug(prefix, xc, label_cup):
    return [
        {"id": f"{prefix}cup", "label": label_cup, "prim": "lathe",
         "profile": [[0, 0], [3.5, 0], [3.95, 0.25], [4.15, 1.0], [CUP_R, 8.9], [CUP_R + 0.05, CUP_H]],
         "pos": pt(xc, 0, 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
        {"id": f"{prefix}mugh", "label": "Mug handle", "prim": "tube",
         "path": [pt(-4.15, 7.9, 0), pt(-6.3, 7.6, 0), pt(-7.1, 5.4, 0), pt(-6.5, 3.0, 0), pt(-4.2, 2.3, 0)], "r": 0.5,
         "pos": pt(xc, 0, 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
        {"id": f"{prefix}tea", "label": "Hot tea", "prim": "lathe",
         "profile": [[0, 0.3], [3.9, 0.3], [4.05, 1.0], [4.12, TEA_Y], [0, TEA_Y]],
         "pos": pt(xc, 0, 0), "rot": [0, 0, 0], "scale": 1, "role": "energy", "explode": [0, 0, 0]},
    ]


BOWL_PROFILE = [[0, 0], [0.55, 0.04], [1.0, 0.16], [1.32, 0.38], [1.5, 0.7]]


def outline(sections, end):
    """Symmetric paddle outline [x, z] from (z, half width) sections, rounded at the far end."""
    right = [[w, z] for z, w in sections]
    cap = []
    zc, w = sections[-1][0], sections[-1][1]
    for k in range(1, 6):
        th = math.pi / 2 * k / 6
        cap.append([w * math.cos(th), zc + (end - zc) * math.sin(th)])
    left = [[-x, z] for x, z in reversed(right + cap)]
    return [[r2(x), r2(z)] for x, z in right + cap + [[0, end]] + left]


B0 = bowl_origin(0.0)
BW = bowl_origin(X2)
END = 13.2
TIP_CONTACT = along(B0, 12.4, 0.62 + 0.11)
F = norm([0.86, 0.46, 0.22])         # finger axis, tip -> hand (comes in from the right, towards the viewer)
NAIL_N = norm([NZ[i] - sum(NZ[j] * F[j] for j in range(3)) * F[i] for i in range(3)])   # nail side faces the viewer
FX = cross(F, NAIL_N)
FINGER_EUL = basis_to_euler(FX, F, NAIL_N)
NAIL_EUL = basis_to_euler(FX, NAIL_N, [-c for c in F])
TIP_C = add(TIP_CONTACT, NZ, 0.8)
FINGER_C = add(TIP_C, F, 7.0)
NAIL_C = add(add(TIP_C, F, 0.75), NAIL_N, 0.74)

parts = mug("", 0.0, "Mug") + [
    {"id": "bowl", "label": "Bowl", "prim": "lathe", "profile": BOWL_PROFILE,
     "pos": pt(*B0), "rot": SPOON_EUL, "scale": [1, 1, 1.45], "role": "object", "explode": [0, 0, 0]},
    {"id": "neck", "label": "Steel", "prim": "extrude", "h": 0.22,
     "shape": [[0.3, 1.9], [0.36, 6.6], [-0.36, 6.6], [-0.3, 1.9]],
     "pos": pt(*along(B0, 0, 0.62)), "rot": SPOON_EUL, "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "handle", "label": "Handle", "prim": "extrude", "h": 0.22,
     "shape": outline([(6.6, 0.36), (9.0, 0.5), (11.2, 0.68), (12.0, 0.72)], END),
     "pos": pt(*along(B0, 0, 0.62)), "rot": SPOON_EUL, "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "finger", "label": "Your finger", "prim": "cylinder", "r": 0.8, "r2": 0.98, "h": 14.0, "segments": 28,
     "pos": pt(*FINGER_C), "rot": FINGER_EUL, "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "tip", "label": "Your finger", "prim": "sphere", "r": 0.8,
     "pos": pt(*TIP_C), "rot": FINGER_EUL, "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "nail", "label": "Nail", "prim": "box", "size": [1.05, 0.14, 1.25], "round": 0.06,
     "pos": pt(*NAIL_C), "rot": NAIL_EUL, "scale": 1, "role": "object", "explode": [0, 0, 0]},
] + mug("w_", X2, "Mug") + [
    {"id": "w_bowl", "label": "Wooden bowl", "prim": "lathe", "profile": [[0, 0], [0.6, 0.05], [1.1, 0.16], [1.45, 0.34], [1.62, 0.62]],
     "pos": pt(*BW), "rot": SPOON_EUL, "scale": [1, 1, 1.42], "role": "other", "explode": [0, 0, 0]},
    {"id": "w_handle", "label": "Wood", "prim": "tube",
     "path": [pt(*along(BW, 2.1, 0.55)), pt(*along(BW, 4.0, 0.62)), pt(*along(BW, 8.0, 0.6)), pt(*along(BW, END, 0.5))], "r": 0.42,
     "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": "other", "explode": [0, 0, 0]},
    # saucepan for the last beat
    {"id": "pan", "label": "Saucepan", "prim": "lathe",
     "profile": [[0, 0.6], [7.7, 0.6], [8.3, 1.1], [8.6, 7.0], [8.95, 7.35]],
     "pos": pt(XP, 0, 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "copper", "label": "Copper", "prim": "cylinder", "r": 7.9, "r2": 7.9, "h": 0.6, "segments": 48,
     "pos": pt(XP, 0.3, 0), "rot": [0, 0, 0], "scale": 1, "role": "energy", "explode": [0, 0, 0]},
    {"id": "bracket", "label": "Steel bracket", "prim": "tube",
     "path": [pt(XP + 8.5, 5.3, 0), pt(XP + 10.6, 5.9, 0)], "r": 0.5,
     "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "panh", "label": "Wood", "prim": "tube",
     "path": [pt(XP + 10.4, 5.85, 0), pt(XP + 17.0, 7.4, 0), pt(XP + 24.0, 8.7, 0)], "r": 0.95,
     "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": "other", "explode": [0, 0, 0]},
]

STEEL = ["bowl", "neck", "handle"]
WOOD = ["w_bowl", "w_handle"]

# heat routes
steel_flow = [pt(*along(B0, s, 0.95)) for s in (-1.4, 0.0, 1.5, 3.0, 5.0, 7.0, 9.0, 11.0, 12.4)]
wood_flow = [pt(*along(BW, s, 1.05)) for s in (-1.4, 0.0, 1.5, 3.0)]
pan_flow = [pt(XP - 6.5, 0.85, 1.0), pt(XP, 0.85, 1.0), pt(XP + 6.5, 0.85, 1.0), pt(XP + 8.3, 2.0, 1.0),
            pt(XP + 8.55, 5.0, 0.6), pt(XP + 9.6, 5.6, 0.4)]
pan_slow = [pt(XP + 10.6, 5.9, 0.9), pt(XP + 12.6, 6.4, 0.95)]

R_MODEL = 52.18


def zoom(ppc):
    return r2(ppc * R_MODEL / (0.7 * 464 / 2))


beats = [
    {"camera": {"yaw": -16, "pitch": 18, "zoom": zoom(21), "target": [1.6, 7.6, 0]}, "turn": 6, "dur": 6,
     "ghost": ["cup", "mugh"],
     "fx": [{"type": "heat", "on": "tea", "role": "energy"}]},
    {"camera": {"yaw": 20, "pitch": 22, "zoom": zoom(23), "target": [1.8, 7.4, 0]}, "dur": 6,
     "focus": ["tea"] + STEEL + ["finger", "tip", "nail"], "labels": ["tea", "bowl", "handle"]},
    {"camera": {"yaw": 16, "pitch": 18, "zoom": zoom(23), "target": [2.2, 7.6, 0]}, "dur": 6,
     "focus": STEEL + ["finger", "tip", "nail"], "labels": ["tip"],
     "fx": [{"type": "flow", "path": steel_flow, "role": "energy", "speed": 7, "count": 9, "label": "heat", "closed": False},
            {"type": "heat", "on": "bowl", "role": "energy"}]},
    {"camera": {"yaw": 16, "pitch": 16, "zoom": zoom(12), "target": [X2 / 2 + 1.5, 7.5, 0]}, "dur": 6,
     "focus": WOOD + STEEL, "labels": ["w_handle", "neck"],
     "fx": [{"type": "flow", "path": steel_flow, "role": "energy", "speed": 7, "count": 9, "label": "fast", "closed": False},
            {"type": "flow", "path": wood_flow, "role": "energy", "speed": 0.7, "count": 3, "label": "slow", "closed": False},
            {"type": "heat", "on": "tea", "role": "energy"},
            {"type": "heat", "on": "w_tea", "role": "energy"}]},
    {"camera": {"yaw": 16, "pitch": 16, "zoom": zoom(14.5), "target": [X2 / 2 + 1.5, 5.5, 0]}, "dur": 6,
     "focus": STEEL,
     "fx": [{"type": "flow", "path": steel_flow, "role": "energy", "speed": 7, "count": 9, "label": "fast", "closed": False},
            {"type": "flow", "path": wood_flow, "role": "energy", "speed": 0.7, "count": 3, "label": "slow", "closed": False}],
     "number": {"value": "100", "unit": "times", "label": "steel versus wood"}},
    {"camera": {"yaw": -32, "pitch": 24, "zoom": zoom(12.5), "target": [XP + 7.0, 5.0, 0]}, "dur": 6,
     "focus": ["copper", "panh"], "labels": ["copper", "panh"],
     "fx": [{"type": "heat", "on": "copper", "role": "energy"},
            {"type": "flow", "path": pan_flow, "role": "energy", "speed": 7, "count": 8, "label": "fast", "closed": False},
            {"type": "flow", "path": pan_slow, "role": "energy", "speed": 0.5, "count": 2, "label": "slow", "closed": False}]},
]

chapter = {
    "scene": "model3d",
    "lens": "explore",
    "title": "How it works",
    "hint": "Pinch: next step. Up/down: turn it.",
    "captions": [
        "Leave a metal spoon in hot tea and the handle soon feels hot.",
        "Heat must travel from the tea, through the bowl, up the handle to your fingers.",
        "Hot tea shakes the metal's atoms; free electrons carry that shaking quickly up the handle.",
        "Wood has no free electrons, so heat creeps along a wooden spoon far more slowly.",
        "100 times: how much faster heat moves through steel than through wood.",
        "That is why pan handles are wood or plastic, and good pans have copper bottoms.",
    ],
    "spec": {"parts": parts, "beats": beats},
}

if __name__ == "__main__":
    print(len(parts), "parts")
    main("spoon", chapter)
