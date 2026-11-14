"""Storyboard-locked live-line explanation of display glasses (dimensions in cm).

Front is z=0; temples extend towards +z. The wearer's right is +x.
Run from render3d; --render also exports the review stills and motion strips.
"""
import math
import sys

from live_common import write_object, render_stills

OUT = "/tmp/claude-1000/-home-alexbelik-Github-Junction-2026/b491deb0-4b71-46e1-baff-4fc77789087d/scratchpad/live/glasses"
parts = []


def part(pid, label, prim, pos, role="object", explode=(0, 0, 0), order=0, **kw):
    p = dict(id=pid, label=label, prim=prim, pos=list(pos), role=role,
             explode=list(explode), order=order, **kw)
    parts.append(p)
    return p


def box(pid, label, pos, size, **kw):
    return part(pid, label, "box", pos, size=size, **kw)


def outline(cx, w, h):
    # Rounded trapezoid: broad brow, slightly narrower bottom.
    return [[cx+x, y, 0] for x, y in
            [(-w*.5, .6), (-w*.43, h*.48), (w*.36, h*.48),
             (w*.5, h*.30), (w*.44, -h*.32), (w*.28, -h*.48),
             (-w*.28, -h*.48), (-w*.45, -h*.30)]]


for side, x in [("left", -3.25), ("right", 3.25)]:
    part(f"rim_{side}", "Front frame", "tube", (0, 0, 0),
         path=outline(x, 5.6, 3.9), r=.26, closed=True)
    # Polygon lens, extruded along local y then rotated into the frame plane.
    shape = [[px-x, -py] for px, py, _ in outline(x, 5.0, 3.35)]
    part(f"lens_{side}", "Lens", "extrude", (x, 0, 0), shape=shape,
         h=.12, rot=[90, 0, 0], explode=(0, 0, -2), order=1)
    s = -1 if side == "left" else 1
    part(f"arm_{side}", "Temple arm", "tube", (0, 0, 0),
         path=[[s*6.1, .9, .1], [s*6.45, .8, 2], [s*6.3, .6, 8.8],
               [s*6.0, .2, 11.1], [s*5.7, -.8, 12.0]], r=.35,
         explode=(s*2, 0, 0), order=3)
    part(f"hinge_{side}", "Hinge", "cylinder", (s*6.1, .8, .35),
         r=.3, h=.75, explode=(s*2, 0, 0), order=3)
    box(f"battery_{side}", "Battery", (s*6.3, .6, 6.8), [.38, .46, 3.3],
        explode=(s*3, 1.9, 0), order=4)
    box(f"speaker_{side}", "Speaker", (s*6.25, .45, 9.2), [.4, .35, 1.1],
        explode=(s*2, -1.8, 0), order=4)

part("bridge", "Bridge", "tube", (0, 0, 0),
     path=[[-.6, .9, 0], [0, 1.15, 0], [.6, .9, 0]], r=.24)
box("waveguide", "Waveguide", (3.25, 0, .15), [4.8, 3.05, .10],
    explode=(0, 0, 1.7), order=2)
box("in_grating", "In-grating", (5.25, .65, .16), [.55, .9, .15],
    role="actor", explode=(0, 0, 1.7), order=2)
box("out_grating", "Out-grating", (2.85, 0, .16), [1.25, 1.4, .15],
    role="actor", explode=(0, 0, 1.7), order=2)
box("projector", "Projector", (6.0, 1.0, 1.1), [.85, .75, 1.35],
    role="energy", explode=(2, 2.5, 0), order=0)
part("camera", "Camera", "cylinder", (-5.9, 1.2, -.27), r=.32, h=.4,
     rot=[90, 0, 0], explode=(-2, 2.0, -1), order=0)
part("eye", "Your eye", "sphere", (2.85, 0, 3.2), r=1.0, role="actor")
part("iris", "Iris", "torus", (2.85, 0, 2.28), r=.36, tube=.065, role="actor")

# Wrist and pinch are below the optical assembly, outside the optical close-ups.
part("band", "Neural wristband", "torus", (0, -8.0, 2), r=1.45,
     tube=.27, rot=[90, 0, 0], role="object")
for i in range(5):
    x = (i-2)*.52
    box(f"pad{i}", "Electrode", (x, -8, 2-math.sqrt(1.45**2-x*x)),
        [.36, .44, .14], role="actor")
box("palm", "Hand", (0, -5.9, 2), [2.25, 2.8, .8], role="actor", round=.35)


def finger(pid, a, b, r=.26, pinch=False):
    delta = [b[k]-a[k] for k in range(3)]
    length = math.sqrt(sum(v*v for v in delta))
    p = part(pid, "Finger", "capsule", [(a[k]+b[k])/2 for k in range(3)],
             r=r, h=length-2*r, role="actor",
             rot=[0, 0, -math.degrees(math.atan2(delta[0], delta[1]))])
    if pinch:
        p["anim"] = {"swing": {"axis": [0, 0, 1], "deg": 6, "hz": .5}}


finger("index", (.55, -4.9, 2), (1.9, -3.2, 2), pinch=True)
finger("thumb", (1, -6, 2), (1.9, -3.75, 2), r=.3, pinch=True)
finger("middle", (-.1, -4.8, 2), (-.1, -3.1, 2))
finger("ring", (-.65, -4.9, 2), (-.85, -3.5, 2))
finger("little", (-1, -5.3, 2), (-1.4, -4.2, 2), r=.22)

ACTORS = ["eye", "iris", "band", "palm", "index", "thumb", "middle", "ring", "little"] + [f"pad{i}" for i in range(5)]
OPTICS = ["projector", "waveguide", "in_grating", "out_grating"]


def cam(yaw, pitch, zoom, target):
    return dict(yaw=yaw, pitch=pitch, zoom=zoom, target=target)


def call(to, text, side="r"):
    return dict(to=to, text=text, side=side)


def beam(path):
    return dict(type="beam", path=path, role="energy", width=2)


START = [[6, 1, 1.1], [5.25, .65, .16]]
# Unfolded ray diagram: draw transverse reflections in the lens plane so
# the zig-zag remains legible on a 600 px display, rather than subpixel depth.
ZIG = [[5.25, .65, .16], [4.9, 1.2, .21], [4.5, -1.2, .10],
       [4.1, 1.2, .21], [3.7, -1.2, .10], [3.3, 1.2, .21], [2.85, 0, .16]]
beats = [
    dict(camera=cam(-155, 18, 1.7, [0, 0, 4]), turn=6,
         ghost=ACTORS, dur=4, move=1),
    dict(camera=cam(-155, 14, 1.25, [0, .8, 3]), explode=1,
         explodeOnly=[p["id"] for p in parts if any(p["explode"])],
         stagger=1.2, move=2, dur=4, focus=OPTICS+["camera", "battery_right"],
         labels=["projector", "waveguide", "camera", "battery_right"]),
    dict(camera=cam(-135, 18, 4.5, [5.4, .7, .6]), focus=["projector"],
         callouts=[call("projector", "Projector", "l")], fx=[beam(START)]),
    dict(camera=cam(-160, 15, 5.0, [4.8, .5, .16]), focus=["in_grating"],
         callouts=[call("in_grating", "In-grating", "l")], fx=[beam(START+ZIG[1:3])]),
    dict(camera=cam(-150, 22, 4.1, [3.8, .15, .16]), focus=["waveguide"],
         callouts=[call([4.1, 1.2, .21], "Trapped light", "l")], fx=[beam(ZIG)]),
    dict(camera=cam(-115, 12, 3.8, [2.85, 0, 1.6]), focus=["out_grating", "eye", "iris"],
         callouts=[call("out_grating", "Out-grating", "l"), call("eye", "Your eye")],
         fx=[beam(ZIG+[[2.85, 0, 2.28]])]),
    dict(camera=cam(-165, 12, 2.8, [0, -5.8, 2]),
         focus=["band", "palm", "index", "thumb", "middle", "ring", "little"]+[f"pad{i}" for i in range(5)],
         play=["index", "thumb"], callouts=[call("pad2", "Muscle signals", "l")],
         fx=[dict(type="glow", on=f"pad{i}", role="actor", hz=1) for i in range(5)]),
    dict(camera=cam(-155, 12, 2, [0, 0, 2]), focus=["rim_left", "rim_right", "bridge", "lens_left", "lens_right"],
         callouts=[call("lens_right", "World passes through", "l")],
         number=dict(value="600 × 600", unit="pixels", label="in one lens"),
         fx=[dict(type="beam", path=[[3.25, 0, -3], [3.25, 0, .15], [3.25, 0, 2.2]], role="actor", width=1)]),
]
for b in beats:
    b.setdefault("dur", 4)
    b.setdefault("move", 1)

captions = [
    "How do these glasses show a picture?",
    "Projector, lens, camera, battery.",
    "A tiny projector makes the image.",
    "A grating bends light into the lens.",
    "Light zig-zags inside the glass.",
    "A second grating aims it at your eye.",
    "The band reads your finger muscles.",
    "600 × 600 pixels in one lens.",
]
meta = dict(id="glasses", label="Display glasses", short="Glasses",
            detect_hint="Thick framed smart glasses with two lenses, broad electronic temples and a small corner camera",
            concept="A projector guides light through a transparent lens while a wristband senses muscle signals.",
            tagline="Light inside glass", answer="A waveguide routes projector light into your eye while the world passes through.")
chapter = dict(lens="explore", scene="model3d", title="How it works",
               hint="Pinch: next step. Up/down: turn it.", captions=captions,
               spec=dict(parts=parts, beats=beats))

if __name__ == "__main__":
    assert 20 <= len(parts) <= 35, len(parts)
    write_object(meta, chapter)
    hold = sum(b["dur"] for b in beats)
    total = hold + sum(b["move"] for b in beats)
    print(f"{len(parts)} parts; {len(beats)} beats; {total} seconds including transitions ({hold} seconds holds)")
    if "--render" in sys.argv:
        render_stills("glasses", OUT)
