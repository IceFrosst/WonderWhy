"""Storyboarded live-line spin bike. Run directly to write only its Explore chapter.

Centimetres, y up, front at +x; the flywheel lies in xy and its axle is z.
The circular rim stays geometrically fixed while the disc/spokes rotate: effects mark
the stationary magnetic interaction region, rather than following a piece of metal.
"""
import math
from live_common import pt, write_object, render_stills

OUT = "/tmp/claude-1000/-home-alexbelik-Github-Junction-2026/b491deb0-4b71-46e1-baff-4fc77789087d/scratchpad/live/spinbike"


def part(pid, label, prim, pos=(0, 0, 0), role="object", explode=(0, 0, 0), **kw):
    return dict(id=pid, label=label, prim=prim, pos=list(pos), role=role,
                explode=list(explode), **kw)


def tube(pid, label, path, r=1.7, **kw):
    return part(pid, label, "tube", path=path, r=r, **kw)


def box(pid, label, size, pos, **kw):
    return part(pid, label, "box", pos=pos, size=size, **kw)


def wheel(pid, label, r, h, pos, **kw):
    return part(pid, label, "cylinder", pos=pos, r=r, h=h, rot=[90, 0, 0], segments=48, **kw)


SPIN = {"spin": {"axis": [0, 0, 1], "rpm": -48}}
FAST = {"spin": {"axis": [0, 0, 1], "rpm": -144}}
FW = [25, 28, 0]
CR = [-13, 30, 0]
WEXP = [12, 0, -15]

# Exact common external tangent of the crank pulley (r=11) and hub pulley (r=4).
dx, dy, big, small = 38, -2, 11, 4
d = math.hypot(dx, dy)
phi = math.atan2(dy, dx)
alpha = math.acos((big - small) / d)
top, bottom = phi + alpha, phi - alpha
belt = []
for cx, cy, rad, a0, a1 in [(25, 28, small, top, bottom),
                            (-13, 30, big, bottom, top - 2 * math.pi)]:
    for k in range(17):
        a = a0 + (a1 - a0) * k / 16
        belt.append(pt(cx + rad * math.cos(a), cy + rad * math.sin(a), 5.5))

parts = [
    tube("rear_foot", "Rear stabiliser", [[-43, 3, -23], [-43, 3, 23]], r=2.3),
    tube("front_foot", "Front stabiliser", [[43, 3, -23], [43, 3, 23]], r=2.3),
    tube("rear_leg", "Rear support", [[-43, 4, 0], [-34, 20, 0], [-13, 30, 0]], r=2.5),
    tube("front_leg", "Front support", [[43, 4, 0], [40, 15, 0], [35, 28, 0]], r=2.5),
    tube("lower_frame", "Frame", [[-43, 9, 0], [37, 9, 0]], r=2.3),
    tube("seat_tube", "Seat tube", [[-13, 30, 0], [-29, 72, 0]], r=3),
    tube("main_frame", "Frame", [[-29, 66, 0], [23, 59, 0], [36, 16, 0]], r=3.5),
    tube("seat_post", "Saddle post", [[-29, 70, 0], [-34, 91, 0]], r=1.6),
    # Broad back and narrow nose give the saddle a bike silhouette, rather than a seat block.
    part("saddle", "Saddle", "extrude", pos=[-33, 94, 0], h=3.2,
         shape=[[-10, -8], [-3, -8], [9, -2.3], [11, 0], [9, 2.3], [-3, 8], [-10, 8]]),
    tube("bar_post", "Handlebar post", [[23, 59, 0], [30, 93, 0], [34, 98, 0]], r=2),
    tube("handlebar", "Handlebar", [[40, 101, -20], [31, 98, -20], [29, 98, -12],
         [32, 98, 0], [29, 98, 12], [31, 98, 20], [40, 101, 20]], r=1.6),
    tube("knob_stem", "Resistance linkage", [[7, 61, 0], [7, 73, 0]], r=0.8),
    part("knob", "Knob", "cylinder", pos=[7, 75, 0], r=3.5, h=2.5,
         explode=[0, 19, 0], order=3,
         anim={"spin": {"axis": [0, 1, 0], "rpm": 12}}),
    wheel("flywheel", "Flywheel", 20.8, 3.5, FW, explode=WEXP, order=1, anim=FAST),
    part("rim", "Metal rim", "torus", pos=FW, r=21.7, tube=1.9,
         explode=WEXP, order=1),
    # An extra +96 rpm on the axle gives the visible web -48 rpm in the drag beat.
    # Earlier beats inherit the disc's -144 rpm through this unplayed parent.
    wheel("axle", "Flywheel axle", 2.2, 12, FW, parent="flywheel",
          anim={"spin": {"axis": [0, 0, 1], "rpm": 96}}),
    wheel("hub_pulley", "Drive hub", 4, 1.5, [25, 28, 5.5], parent="axle"),
    wheel("pulley", "Crank pulley", 11, 1.2, [-13, 30, 5.5], role="object", anim=SPIN),
    tube("belt", "Belt", belt, r=0.55, closed=True, explode=[0, -6, 17], order=2),
    tube("crank_right", "Crank", [[0, 0, 0], [0, -16, 0]], r=1.2,
         pos=[-13, 30, 9], anim=SPIN),
    tube("crank_left", "Crank", [[0, 0, 0], [0, 16, 0]], r=1.2,
         pos=[-13, 30, -9], anim=SPIN),
    box("pedal_right", "Pedal", [10, 2, 8], [-13, 14, 13], parent="crank_right"),
    box("pedal_left", "Pedal", [10, 2, 8], [-13, 46, -13], parent="crank_left"),
    box("cover", "Drive cover", [37, 25, 1.2], [0, 29, 8],
         round=0.5, explode=[-18, 0, 36], order=0),
    # Pivot is at the left end, so the arm and its three blocks swing together.
    tube("magnet_arm", "Magnet arm", [[0, 0, 0], [3, 5, 0], [13, 6, 0], [23, 3, 0]],
         r=1, pos=[12, 46, 5.1], explode=[0, 17, 12], order=3,
         anim={"swing": {"axis": [1, 0, 0], "deg": 13, "hz": 0.2}}),
]
for k, (x, y) in enumerate([(18, 48.5), (25, 49.8), (32, 48.5)]):
    parts.append(box(f"magnet{k+1}", "Magnets", [4.5, 4, 2], [x, y, 4.7],
                     parent="magnet_arm"))
for k in range(3):
    a = 2 * math.pi * k / 3
    parts.append(tube(f"spoke{k+1}", "Flywheel web", [[0, 0, 0],
        pt(18 * math.cos(a), 18 * math.sin(a), 0)], r=0.7,
        pos=[25, 28, 2.1], parent="axle"))


def cam(yaw, pitch, zoom, target):
    return dict(yaw=yaw, pitch=pitch, zoom=zoom, target=target)


def call(text, to, side="r"):
    return dict(text=text, to=to, side=side)


def loop(cx, cy, rx=2.2, ry=1.15):
    return [pt(cx + rx * math.cos(2 * math.pi * k / 24),
               cy + ry * math.sin(2 * math.pi * k / 24), 2.2) for k in range(24)]


# Keep the currents on the visible metal face, below the magnet outlines. Bright
# closed guides make the complete circuits readable between the moving flow dots.
eddy_paths = [loop(x, y) for x, y in [(18, 45.1), (25, 46.3), (32, 45.1)]]
eddies = [dict(type="flow", path=path, role="actor", closed=True,
               speed=9, count=6) for path in eddy_paths]
eddy_guides = [dict(type="beam", path=path + [path[0]], role="actor", width=2.5)
               for path in eddy_paths]
drive = ["pulley", "crank_right", "crank_left", "flywheel"]
drivetrain = drive + ["belt", "rim", "hub_pulley", "spoke1", "spoke2", "spoke3", "pedal_left", "pedal_right"]
magnets = ["magnet_arm", "magnet1", "magnet2", "magnet3"]
spin_path = [pt(25 + 25 * math.cos(a), 28 + 25 * math.sin(a), 3)
             for a in [math.radians(125 - k * 10) for k in range(12)]]

beats = [
    dict(camera=cam(-20, 10, 1.25, [0, 51, 0]), turn=8,
         ghost=["cover"]),
    dict(camera=cam(-22, 16, 0.95, [1, 53, 5]), explode=1, move=2.4, stagger=1.2,
         focus=["flywheel", "rim", "belt", "knob"] + magnets,
         labels=["flywheel", "belt", "magnet2", "knob"]),
    dict(camera=cam(-12, 10, 1.8, [6, 32, 3]), ghost=["cover"],
         focus=drivetrain, play=drive,
         callouts=[call("Belt drive", "belt", "l")],
         fx=[dict(type="flow", path=belt, closed=True, role="actor", speed=40, count=14),
             dict(type="flow", path=spin_path, role="actor", speed=45, count=4)]),
    dict(camera=cam(-35, 9, 4.1, [23, 49, 3]), focus=magnets + ["rim"],
         ghost=["cover"], play=["knob", "magnet_arm", "flywheel"],
         callouts=[call("Gap: no touch", [25, 49.8, 2.8], "l")],
         fx=eddies + eddy_guides),
    dict(camera=cam(-8, 7, 4.1, [25, 48, 2.8]), focus=["rim"],
         ghost=["cover"], play=["flywheel"],
         callouts=[call("Eddy currents", eddy_paths[0][12], "l")],
         fx=eddies + eddy_guides),
    dict(camera=cam(-10, 8, 2.7, [25, 35, 1]), focus=["rim"] + magnets,
         ghost=["cover"], play=["flywheel", "axle"],
         callouts=[call("Drag", [14, 54, 3], "l")],
         fx=eddies + [dict(type="arrow", **{"from": [31, 54, 3], "dir": [-1, 0, 0]},
                          len=17, role="energy"),
                      dict(type="flow", path=spin_path, role="actor", speed=25, count=5)]),
    dict(camera=cam(-16, 10, 2.25, [23, 30, 0]), focus=["rim"], ghost=["cover"],
         play=["flywheel", "axle"], callouts=[call("Warms the flywheel", [44.41, 37.7, 1.9], "r")],
         number=dict(value="200", unit="W", label="effort becomes heat"),
         fx=[dict(type="heat", on="rim", role="loss")]),
]
for beat in beats:
    beat.setdefault("dur", 5)
    beat.setdefault("move", 1)

chapter = dict(lens="explore", scene="model3d", title="How it works",
               hint="Pinch: next step. Up/down: turn it.", captions=[
                   "How does it brake without touching?",
                   "Flywheel, belt and magnets.",
                   "Pedals spin a heavy flywheel.",
                   "The knob brings magnets close.",
                   "Swirling currents appear in the metal.",
                   "They push back and slow it.",
                   "200 W of effort becomes heat.",
               ], spec=dict(parts=parts, beats=beats))
meta = dict(id="spinbike", label="Spin bike", short="Bike",
            detect_hint="Indoor stationary exercise bike with saddle, handlebars, pedals and a large front flywheel.",
            concept="Magnets induce eddy currents in the moving metal flywheel, producing drag and heat.",
            tagline="Braking without touching",
            answer="Magnets induce eddy currents that oppose the flywheel's motion and turn effort into heat.")

if __name__ == "__main__":
    import sys
    assert 20 <= len(parts) <= 35, len(parts)
    assert len(meta["answer"].split()) <= 14
    write_object(meta, chapter)
    print(len(parts), "parts;", len(beats), "beats;",
          sum(b["dur"] for b in beats), "seconds hold;",
          sum(b["dur"] + b["move"] for b in beats), "seconds including moves")
    if "--render" in sys.argv:
        render_stills("spinbike", OUT)
