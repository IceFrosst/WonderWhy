"""Insert (or replace) the bicycle's Explore chapter as its first chapter in shared/objects.json.

Road bike seen from the drive side, cm. x forward (rear hub -40.4, bottom bracket 0, front hub 58.6),
y up (road at y=0), z towards the drive side (chain at z=+4.5). 48/16 gearing, 700x25 wheel (2.1 m round).
"""
import math
from r3d_common import pt, r2, write_chapter

BB = (0.0, 26.5)
H = (-40.4, 33.5)       # rear hub
HF = (58.6, 33.5)       # front hub
ZC = 4.5                # chain plane
R1, R2 = 10.35, 3.45    # chain path radius round the chainring and the cog (exactly 3:1)
CIRC = 210.0            # wheel circumference, cm
RPM1, RPM2 = 20, 60
CY = 22                 # beat 2: the chain lifts this far off its sprockets
XO = 8                  # beat 2: the whole drivetrain slides this far out from the frame (stays engaged)


def tube(pid, label, path, r, pos=(0, 0, 0), **extra):
    ox, oy, oz = pos
    part = {"id": pid, "label": label, "prim": "tube", "path": [pt(x - ox, y - oy, z - oz) for x, y, z in path], "r": r,
            "pos": pt(*pos), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]}
    part.update(extra)
    return part


# ---- chain: closed loop round both sprockets, top run from cog to chainring (direction of travel)
c1, c2 = BB, H
dx, dy = c1[0] - c2[0], c1[1] - c2[1]
D = math.hypot(dx, dy)
base = math.atan2(dy, dx)
phi = math.acos((R2 - R1) / D)  # angle between n and d
a_up, a_dn = base + phi, base - phi


def on(c, r, a):
    return (c[0] + r * math.cos(a), c[1] + r * math.sin(a))


def run(p, q, n):
    return [((p[0] + (q[0] - p[0]) * k / n), (p[1] + (q[1] - p[1]) * k / n)) for k in range(1, n)]


chain2d = []
chain2d.append(on(c2, R2, a_up))
chain2d += run(on(c2, R2, a_up), on(c1, R1, a_up), 4)
n1 = 14
for k in range(n1 + 1):  # clockwise over the front of the chainring
    chain2d.append(on(c1, R1, a_up - (a_up - a_dn) * k / n1))
chain2d += run(on(c1, R1, a_dn), on(c2, R2, a_dn), 4)
n2 = 8
span2 = (a_dn - (a_up - 2 * math.pi))
for k in range(n2):  # clockwise round the back of the cog (last point joins the first)
    chain2d.append(on(c2, R2, a_dn - span2 * k / n2))
chain = [pt(x, y, ZC) for x, y in chain2d]
assert len(chain) <= 64, len(chain)
chain_len = sum(math.dist(chain2d[i], chain2d[(i + 1) % len(chain2d)]) for i in range(len(chain2d)))
chain_speed = 2 * math.pi * R1 * RPM1 / 60  # cm/s
# count so that the dot pattern advances a whole number of gaps per 6 s loop (no speed fudge)
count = min(range(14, 33), key=lambda c: abs(chain_speed * 6 / (chain_len / c) - round(chain_speed * 6 / (chain_len / c))))

# ---- wheel geometry
TYRE_R, TYRE_T = 32.3, 1.2      # outer radius 33.5 -> 2.10 m round
RIM_R, RIM_T = 30.8, 0.6
spokes = []
for k, a in enumerate([10, 55, 100, 145]):
    t = math.radians(a)
    p = (H[0] + 30.4 * math.cos(t), H[1] + 30.4 * math.sin(t), 0)
    q = (H[0] - 30.4 * math.cos(t), H[1] - 30.4 * math.sin(t), 0)
    spokes.append(tube(f"spoke{k + 1}", "Spoke", [p, q], 0.18, pos=(H[0], H[1], 0), parent="hub"))

CRANK = 30  # crank angle above the horizontal at rest (start of the power stroke)
CA, SA = math.cos(math.radians(CRANK)), math.sin(math.radians(CRANK))
PEDAL = (BB[0] + 17.5 * CA, BB[1] + 17.5 * SA, 12.4)
SPIN = [0, 0, -1]  # forward rolling is clockwise seen from the drive side
st = (-math.cos(math.radians(73)), math.sin(math.radians(73)))  # seat tube direction


def seat(y):
    return (BB[0] + st[0] * (y - BB[1]) / st[1], y)


saddle = [(12, 0), (10, 1.8), (5, 2.9), (-2, 4.2), (-8, 6.6), (-12.5, 7.0), (-14.5, 4.6), (-15, 0)]
saddle = saddle + [(x, -z) for x, z in reversed(saddle[1:-1])]
sx, sy = seat(86.5)

parts = [
    # drivetrain
    {"id": "chainring", "label": "Chainring, 48 teeth", "prim": "gear", "teeth": 48, "r": 10.2, "h": 0.35, "toothDepth": 0.55,
     "pos": pt(BB[0], BB[1], ZC), "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, XO]},
    # the spinning parts are the round-symmetric axles: label anchors on the rings and the cog then stay still
    {"id": "spindle", "label": "Crank axle", "prim": "cylinder", "r": 2.2, "h": 13.0, "segments": 24,
     "pos": pt(BB[0], BB[1], 0), "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, XO],
     "anim": {"spin": {"axis": SPIN, "rpm": RPM1}}},
    {"id": "crank", "label": "Crank", "prim": "box", "size": [19.6, 3.0, 1.4], "round": 0.6,
     "pos": pt(BB[0] + 8.75 * CA, BB[1] + 8.75 * SA, 6.6), "rot": [0, 0, CRANK], "scale": 1, "role": "object",
     "explode": [0, 0, 0], "parent": "spindle"},
    {"id": "pedal", "label": "Pedal", "prim": "box", "size": [8.0, 2.2, 9.0], "round": 0.6,
     "pos": pt(*PEDAL), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "spindle"},
    {"id": "crank_l", "label": "Left crank", "prim": "box", "size": [19.6, 3.0, 1.4], "round": 0.6,
     "pos": pt(BB[0] - 8.75 * CA, BB[1] - 8.75 * SA, -6.6), "rot": [0, 0, CRANK], "scale": 1, "role": "object",
     "explode": [0, 0, 0], "parent": "spindle"},
    {"id": "pedal_l", "label": "Left pedal", "prim": "box", "size": [8.0, 2.2, 9.0], "round": 0.6,
     "pos": pt(BB[0] - 17.5 * CA, BB[1] - 17.5 * SA, -12.4), "rot": [0, 0, 0], "scale": 1, "role": "object",
     "explode": [0, 0, 0], "parent": "spindle"},
    tube("chain", "Chain", chain, 0.3, closed=True, explode=[0, CY, XO + 5], role="actor"),
    {"id": "cog", "label": "Rear cog, 16 teeth", "prim": "gear", "teeth": 16, "r": 3.4, "h": 0.35, "toothDepth": 0.45,
     "pos": pt(H[0], H[1], ZC), "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, XO]},
    # rear wheel
    {"id": "rim", "label": "Rear wheel", "prim": "torus", "r": RIM_R, "tube": RIM_T,
     "pos": pt(H[0], H[1], 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "tyre", "label": "Tyre", "prim": "torus", "r": TYRE_R, "tube": TYRE_T,
     "pos": pt(H[0], H[1], 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "rim"},
    {"id": "hub", "label": "Hub", "prim": "cylinder", "r": 2.0, "h": 11.0, "segments": 24,
     "pos": pt(H[0], H[1], 0), "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0],
     "anim": {"spin": {"axis": SPIN, "rpm": RPM2}}},
] + spokes + [
    # frame (drive side stays only)
    tube("chainstay", "Chainstay", [(BB[0], BB[1], 3.0), (H[0], H[1], 3.0)], 1.0),
    tube("seatstay", "Seat stay", [(seat(73.5)[0], 73.5, 3.0), (H[0] + 1.0, H[1] + 2.0, 3.0)], 0.8),
    tube("seattube", "Seat tube", [(BB[0], BB[1], 0), (sx, sy, 0)], 1.4),
    tube("toptube", "Top tube", [(seat(76)[0], 76, 0), (50.4, 81.0, 0)], 1.4),
    tube("downtube", "Down tube", [(BB[0], BB[1], 0), (53.4, 71.0, 0)], 1.8),
    tube("fork", "Fork", [(48.9, 86.5, 0), (49.6, 82.8, 0), (54.0, 68.5, 0), (55.9, 50.0, 0), (HF[0], HF[1], 0)], 1.3),
    tube("bar", "Handlebar", [(44.5, 77.5, -20), (51.5, 79.5, -20), (53.0, 85.5, -20), (49.5, 88.0, -13), (48.9, 88.0, 0),
                              (49.5, 88.0, 13), (53.0, 85.5, 20), (51.5, 79.5, 20), (44.5, 77.5, 20)], 1.1),
    {"id": "saddle", "label": "Saddle", "prim": "extrude", "shape": [[r2(x), r2(z)] for x, z in saddle], "h": 2.4,
     "pos": pt(sx - 3.0, sy + 1.2, 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    # front wheel
    {"id": "rim_f", "label": "Front wheel", "prim": "torus", "r": RIM_R, "tube": RIM_T,
     "pos": pt(HF[0], HF[1], 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "tyre_f", "label": "Front tyre", "prim": "torus", "r": TYRE_R, "tube": TYRE_T,
     "pos": pt(HF[0], HF[1], 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    # the road: one wheel turn long, starting under the rear tyre
    {"id": "road", "label": "2.1 m", "prim": "box", "size": [CIRC, 0.2, 5.0],
     "pos": pt(H[0] + CIRC / 2, -0.15, 0), "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
]
assert len(parts) <= 28, len(parts)

FRAME = ["chainstay", "seatstay", "seattube", "toptube", "downtube", "fork", "bar", "saddle"]
DRIVE = ["chainring", "spindle", "crank", "pedal", "chain", "cog"]
contact = pt(H[0], 0.2, 0)

chain_x = [[x, r2(y + CY), r2(z + XO + 5)] for x, y, z in chain]  # the chain where beat 2's explode puts it
PUSH = 56

# a point on the tyre, round once clockwise from the road contact (rolling direction seen from the drive side)
LOOP_R = 36.0  # just outside the tyre (outer radius 33.5) so the dot reads against black
TYRE_LOOP = [pt(H[0] + LOOP_R * math.cos(math.radians(-90 - 360 * k / 40)), H[1] + LOOP_R * math.sin(math.radians(-90 - 360 * k / 40)), 1.3)
             for k in range(40)]
FORCE_RATIO = 17.5 / (TYRE_R + TYRE_T) * 16 / 48  # crank 17.5 cm, 48/16, wheel radius 33.5 cm -> 0.17

beats = [
    {"camera": {"yaw": -24, "pitch": 12, "zoom": 2.45, "target": [8, 42, 0]}, "turn": 8, "dur": 6,
     "ghost": ["road"], "play": ["spindle", "hub"]},
    {"camera": {"yaw": -18, "pitch": 12, "zoom": 2.2, "target": [-8, 46, 8]}, "explode": 1, "dur": 6,
     "focus": DRIVE, "play": ["spindle"], "labels": ["chainring", "chain", "cog"],
     "fx": [{"type": "flow", "path": chain_x, "role": "actor", "speed": r2(chain_speed), "count": count, "closed": True,
             "label": "chain"}]},
    {"camera": {"yaw": -16, "pitch": 10, "zoom": 2.2, "target": [-32, 36, 2]}, "dur": 6,
     "focus": DRIVE + ["tyre", "rim", "hub", "spoke1"], "play": ["spindle", "hub"], "labels": ["chainring", "cog"],
     "fx": [{"type": "flow", "path": chain, "role": "actor", "speed": r2(chain_speed), "count": count, "closed": True,
             "label": "chain"}]},
    {"camera": {"yaw": -14, "pitch": 10, "zoom": 2.6, "target": [-16, 44, 0]}, "dur": 6,
     "focus": ["crank", "pedal", "chainring", "chain", "cog", "tyre"], "labels": ["pedal", "tyre"],
     "fx": [{"type": "arrow", "from": pt(PEDAL[0], PEDAL[1] + 1.1 + PUSH, PEDAL[2]), "dir": [0, -1, 0], "len": PUSH, "role": "energy",
             "label": "foot pushes"},
            {"type": "arrow", "from": pt(H[0] + 3.0, -2.2, 1.5), "dir": [-1, 0, 0], "len": r2(PUSH * FORCE_RATIO), "role": "energy",
             "label": "tyre pushes road"}]},
    {"camera": {"yaw": -12, "pitch": 9, "zoom": 1.5, "target": [52, 40, 0]}, "dur": 6,
     "focus": ["tyre", "rim", "hub", "spoke1", "spoke2", "spoke3", "spoke4"], "play": ["hub"], "labels": ["road"],
     "fx": [{"type": "dim", "on": "road", "text": "one wheel turn"},
            {"type": "flow", "path": TYRE_LOOP, "role": "actor", "speed": r2(2 * math.pi * LOOP_R * RPM2 / 60), "count": 2,
             "closed": True, "label": "a point on the tyre"},
            {"type": "flow", "path": [pt(H[0], 3.0, 1.3), pt(H[0] + CIRC, 3.0, 1.3)], "role": "actor", "speed": CIRC * RPM2 / 60,
             "count": 2, "label": "one wheel turn"}]},
    {"camera": {"yaw": -22, "pitch": 12, "zoom": 2.3, "target": [12, 30, 0]}, "dur": 6,
     "focus": ["chainring", "crank", "pedal", "tyre"], "play": ["spindle", "hub"],
     "number": {"value": "6.3", "unit": "m", "label": "forward per pedal turn"}},
]

chapter = {
    "scene": "model3d",
    "lens": "explore",
    "title": "How it works",
    "hint": "Pinch: next step. Up/down: turn it.",
    "captions": [
        "One turn of the pedals can carry a bike over six metres. Gears decide how far.",
        "Pedals turn a big front chainring; the chain carries its turning to a small rear cog.",
        "48 teeth in front, 16 behind: the rear wheel turns three times per pedal turn.",
        "The price: the wheel turns faster, but the tyre pushes the road far more gently.",
        "Each wheel turn rolls about 2.1 metres, so one pedal turn moves you 6.3 metres.",
        "At 80 pedal turns a minute, that is 30 kilometres an hour.",
    ],
    "spec": {"parts": parts, "beats": beats},
}

if __name__ == "__main__":
    write_chapter("bicycle", chapter)
    print("chain", round(chain_len, 1), "cm, speed", round(chain_speed, 2), "cm/s, dots", count,
          "steps", round(chain_speed * 6 / (chain_len / count), 3), "tyre round", round(2 * math.pi * (TYRE_R + TYRE_T), 1))
