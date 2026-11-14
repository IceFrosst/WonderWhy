"""Insert (or replace) the kettle's Explore chapter as its first chapter in shared/objects.json."""
import json, math, sys

PATH = sys.argv[1]


def r2(v):
    return round(v, 2)


def pt(x, y, z):
    return [r2(x), r2(y), r2(z)]


# ---- geometry helpers (cm, y up; spout -x, handle +x)
RING_R, RING_Y = 4.6, 2.5
cord_dir = (-0.25, -1.0)
n = math.hypot(*cord_dir)
d = (cord_dir[0] / n, cord_dir[1] / n)
perp = (-d[1], d[0])
cord_angle = math.degrees(math.atan2(d[1], d[0]))


def along(dist, lane, y):
    return pt(d[0] * dist + perp[0] * lane, y, d[1] * dist + perp[1] * lane)


def ring(theta_deg, y=RING_Y):
    t = math.radians(theta_deg)
    return pt(RING_R * math.cos(t), y, RING_R * math.sin(t))


def radial(theta_deg, radius):
    t = math.radians(theta_deg)
    return pt(radius * math.cos(t), RING_Y, radius * math.sin(t))


# Current: in along one lane of the cord, through the base, up the connector, out to the ring,
# around the element, back to the connector and out along the other lane.
L = 0.32
th_in, th_out = cord_angle + 14, cord_angle - 14 + 360
current = [along(12.5, L, 0.45), along(10.2, L, 0.5), along(8.0, L, 0.62), along(4.0, L, 0.8), along(0.9, L, 0.95),
           along(0.35, L, 1.6), along(0.35, L, 2.25)]
current += [radial(th_in, 1.6), radial(th_in, 3.3)]
steps = 14
for k in range(steps + 1):
    current.append(ring(th_in + (th_out - th_in) * k / steps))
current += [radial(th_out, 3.3), radial(th_out, 1.6)]
current += [along(0.35, -L, 2.25), along(0.35, -L, 1.6), along(0.9, -L, 0.95), along(4.0, -L, 0.8), along(8.0, -L, 0.62),
            along(10.2, -L, 0.5), along(12.5, -L, 0.45)]
assert len(current) <= 64, len(current)

cord_path = [along(8.3, 0, 0.55), along(10.2, 0, 0.5), along(12.8, 0, 0.45)]

loop_right = [[0.7, 4.4, 0], [0.7, 6.6, 0], [1.1, 8.7, 0], [3.2, 9.35, 0], [5.6, 9.0, 0], [6.4, 7.2, 0],
              [6.2, 5.0, 0], [5.0, 4.05, 0], [3.0, 3.95, 0], [1.4, 4.05, 0]]
loop_left = [[-x, y, z] for x, y, z in loop_right]

channel = [[5.6, 11.8, 0], [6.4, 14.0, 0], [6.6, 17.5, 0], [6.7, 20.5, 0], [7.1, 22.1, 0], [7.8, 22.8, 0]]
steam = [[2.2, 10.0, 0], [4.2, 10.7, 0], [5.5, 11.7, 0]] + channel[1:] + [[8.15, 23.0, 0]]

parts = [
    {"id": "base", "label": "Power base", "prim": "cylinder", "r": 8.6, "r2": 8.2, "h": 1.5, "segments": 48,
     "pos": [0, 0.75, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, -7, 0]},
    {"id": "connector", "label": "Power connector", "prim": "cylinder", "r": 1.2, "r2": 0.95, "h": 1.3, "segments": 24,
     "pos": [0, 1.95, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "base"},
    {"id": "cord", "label": "Cord", "prim": "tube", "path": cord_path, "r": 0.42,
     "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "base"},
    {"id": "body", "label": "Jug", "prim": "lathe",
     "profile": [[0, 1.6], [7.55, 1.6], [7.95, 2.2], [7.75, 9.5], [7.4, 16], [7.05, 21], [6.85, 22.6], [6.4, 23.45], [5.9, 23.7]],
     "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0]},
    {"id": "floor", "label": "Floor", "prim": "cylinder", "r": 7.4, "h": 0.2, "segments": 48,
     "pos": [0, 3.3, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "body"},
    {"id": "element", "label": "Heating element", "prim": "torus", "r": RING_R, "tube": 0.45,
     "pos": [0, RING_Y, 0], "rot": [90, 0, 0], "scale": 1, "role": "energy", "explode": [0, -3.4, 0]},
    {"id": "water", "label": "Water", "prim": "lathe",
     "profile": [[0, 3.42], [7.25, 3.42], [7.2, 9.92], [0, 9.92]],
     "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": "actor", "explode": [0, 0, 0]},
    {"id": "lid", "label": "Lid", "prim": "lathe",
     "profile": [[0, 24.75], [2.6, 24.62], [4.6, 24.3], [5.75, 23.9], [6.0, 23.72]],
     "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 7, 0]},
    {"id": "knob", "label": "Lid knob", "prim": "cylinder", "r": 1.2, "r2": 1.0, "h": 0.8, "segments": 24,
     "pos": [0, 25.1, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "lid"},
    {"id": "spout", "label": "Spout", "prim": "extrude",
     "shape": [[-6.95, -19.8], [-9.0, -23.0], [-9.7, -24.05], [-8.7, -24.1], [-5.9, -23.75], [-6.5, -21.6]], "h": 2.4,
     "pos": [0, 0, 0], "rot": [90, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "body"},
    {"id": "handle", "label": "Handle", "prim": "tube",
     "path": [[6.95, 22.0, 0], [9.6, 22.8, 0], [11.7, 21.6, 0], [12.5, 18.5, 0], [12.4, 10.5, 0], [11.6, 6.6, 0], [9.7, 5.0, 0], [7.85, 4.6, 0]],
     "r": 1.05, "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "body"},
    {"id": "channel", "label": "Steam channel", "prim": "tube", "path": channel, "r": 0.38,
     "pos": [0, 0, 0], "rot": [0, 0, 0], "scale": 1, "role": "object", "explode": [0, 0, 0], "parent": "body"},
    {"id": "switch", "label": "Steam switch", "prim": "box", "size": [3.2, 1.0, 2.1], "round": 0.42,
     "pos": [9.7, 23.95, 0], "rot": [0, 0, -12], "scale": 1, "role": "object", "explode": [3, 4.5, 0],
     "anim": {"swing": {"axis": [0, 0, 1], "deg": 7, "hz": 0.5}}},
    {"id": "disc", "label": "Bimetal disc", "prim": "cylinder", "r": 0.95, "h": 0.16, "segments": 32,
     "pos": [8.15, 23.0, 0], "rot": [0, 0, 0], "scale": 1, "role": "energy", "explode": [0, 0, 0], "parent": "switch",
     "anim": {"swing": {"axis": [0, 0, 1], "deg": 24, "hz": 0.5}}},
]

beats = [
    {"camera": {"yaw": -32, "pitch": 16, "zoom": 1.35, "target": None}, "turn": 10, "dur": 6},
    {"camera": {"yaw": -24, "pitch": 18, "zoom": 1.05, "target": None}, "explode": 1, "dur": 6,
     "focus": ["element", "water", "switch", "disc"], "labels": ["element", "water", "switch"]},
    {"camera": {"yaw": -20, "pitch": 42, "zoom": 2.2, "target": "element"}, "dur": 6,
     "focus": ["element"], "labels": ["element"],
     "fx": [{"type": "heat", "on": "element", "role": "energy"},
            {"type": "flow", "path": current, "role": "energy", "speed": 8, "count": 14, "label": "current", "closed": False}]},
    {"camera": {"yaw": 0, "pitch": 8, "zoom": 1.9, "target": "water"}, "dur": 6,
     "focus": ["element"], "ghost": ["body"], "labels": ["water"],
     "fx": [{"type": "heat", "on": "element", "role": "energy"},
            {"type": "flow", "path": loop_right, "role": "actor", "speed": 2.6, "count": 6, "label": "warm water rises", "closed": True},
            {"type": "flow", "path": loop_left, "role": "actor", "speed": 2.6, "count": 6, "label": "warm water rises", "closed": True}]},
    {"camera": {"yaw": 8, "pitch": 12, "zoom": 4.5, "target": [7.6, 20.6, 0]}, "dur": 6,
     "focus": ["switch", "disc"], "play": ["switch", "disc"], "labels": ["disc", "channel"],
     "fx": [{"type": "flow", "path": steam, "role": "actor", "speed": 3.5, "count": 6, "label": "steam", "closed": False},
            {"type": "heat", "on": "disc", "role": "energy"}]},
    {"camera": {"yaw": -30, "pitch": 20, "zoom": 1.4, "target": [-2.5, 11.0, 0]}, "dur": 6,
     "focus": ["element"], "labels": ["element"],
     "number": {"value": "2000", "unit": "W", "label": "heating power"}},
]

chapter = {
    "scene": "model3d",
    "lens": "explore",
    "title": "How it works",
    "hint": "Pinch: next step. Up/down: turn it.",
    "captions": [
        "A kettle brings a litre of water to the boil in about three minutes.",
        "Inside: a heating element under the floor, the water, and a steam switch.",
        "Current forced through the element's resistance turns electrical energy into heat.",
        "Water touching the hot floor expands, gets lighter and rises; cooler water sinks.",
        "Steam reaches a bimetal disc that bends when hot and snaps the power off.",
        "2000 joules every second: enough to warm a litre by half a degree.",
    ],
    "spec": {"parts": parts, "beats": beats},
}

with open(PATH, encoding="utf-8") as f:
    data = json.load(f)
kettle = next(o for o in data["objects"] if o["id"] == "kettle")
kettle["chapters"] = [c for c in kettle["chapters"] if not (c.get("lens") == "explore" and c.get("scene") == "model3d")]
kettle["chapters"].insert(0, chapter)
with open(PATH, "w", encoding="utf-8", newline="\n") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write("\n")
print("ok", len(parts), "parts,", len(current), "current points")
