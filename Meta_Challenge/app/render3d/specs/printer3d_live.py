"""Live-line FDM printer, following Storyboards.md section 3.

Dimensions are centimetres; x is the gantry, y is up, +z faces the viewer.
The seven visible perimeter courses stand for many actual 0.2 mm layers:
their separation and the nozzle bore are enlarged for the 600 px display.
The head traverses the front edge of the rectangular outline in beat 5.
Only write_object touches the library, under its shared exclusive lock.
"""
from live_common import render_stills, write_object


OUT = (
    "/tmp/claude-1000/-home-alexbelik-Github-Junction-2026/"
    "b491deb0-4b71-46e1-baff-4fc77789087d/scratchpad/live/printer3d"
)


def part(pid, label, prim, pos, role="object", **fields):
    return dict(id=pid, label=label, prim=prim, pos=pos, role=role, **fields)


def box(pid, label, size, pos, **fields):
    return part(pid, label, "box", pos, size=size, **fields)


def cyl(pid, label, r, h, pos, **fields):
    return part(pid, label, "cylinder", pos, r=r, h=h, segments=24, **fields)


def head(pid, label, prim, pos, drop, order, **fields):
    return part(pid, label, prim, pos, parent="carriage",
                explode=[0, -drop, 0], order=order, **fields)


# A hollow rectangular print: the reversed inner polygon makes a narrow wall.
# Like the phone generator's frame, a zero-width slit joins the two outlines.
OUTER = [[4.3, 3.5], [-4.3, 3.5], [-4.3, -3.5], [4.3, -3.5]]
INNER = [[3.85, 3.05], [-3.85, 3.05], [-3.85, -3.05], [3.85, -3.05]]
WALL = OUTER + [OUTER[0], INNER[0]] + list(reversed(INNER[1:])) + [INNER[0]]
LAYER_IDS = [f"layer{i}" for i in range(6)] + ["new_line"]

parts = [
    box("base", "Base", [30, 1.8, 28], [0, 0.9, 0]),
    box("bed_rail", "Bed guide", [2.6, 1.0, 24], [0, 2.0, 0]),
    box("bed", "Print bed", [22, 0.65, 22], [0, 2.95, 0]),
    box("left_post", "Upright", [1.8, 25, 2.2], [-12, 14.3, -1]),
    box("right_post", "Upright", [1.8, 25, 2.2], [12, 14.3, -1]),
    box("top", "Top crossbar", [25.8, 1.8, 2.2], [0, 26.8, -1]),
    box("gantry", "Moving gantry", [24, 1.5, 1.8], [0, 12.0, -0.1]),
    cyl("lead_screw", "Lift screw", 0.23, 23.5, [-10.35, 14.5, -0.6]),
    box("z_motor", "Lift motor", [3.4, 3.4, 3.4], [-10.35, 3.1, -0.6]),
    box("x_motor", "Gantry motor", [3.3, 3.3, 3.3], [-12, 12, -2.0]),
    part("spool_mount", "Spool support", "tube", [0, 0, 0], r=0.45,
         path=[[0, 27.7, -2.4], [0, 32.6, -2.4], [0, 32.6, 0.8]]),
    cyl("spool_back", "Filament spool", 5.2, 0.32, [0, 32.6, -0.7], rot=[90, 0, 0]),
    cyl("spool_front", "Filament spool", 5.2, 0.32, [0, 32.6, 2.3], rot=[90, 0, 0]),
    cyl("spool_core", "Wound filament", 4.25, 2.7, [0, 32.6, 0.8], rot=[90, 0, 0]),
    part("filament", "Filament", "tube", [0, 0, 0], role="actor", r=0.085,
         path=[[4.2, 32.6, 0.8], [7.0, 29, 1.2], [5.4, 21, 2.4],
               [0.12, 14.0, 3.5], [0.12, 11.7, 3.5], [0.12, 8.6, 3.5]]),
    box("carriage", "Print head carriage", [2.7, 1.8, 3.0], [0, 12.2, 1.7],
        anim={"slide": {"axis": [1, 0, 0], "amp": 3.5, "hz": 0.2}}),
    head("feed_motor", "Feed motor", "box", [-0.65, 11.7, 2.0], 1.0, 3,
         size=[2.4, 2.4, 2.0]),
    head("drive_gear", "Drive gear", "gear", [-0.63, 11.7, 3.5], 1.0, 3,
         role="actor", teeth=12, r=0.75, h=0.4, toothDepth=0.18, rot=[90, 0, 0],
         anim={"spin": {"axis": [0, 0, 1], "rpm": -24}}),
    head("heatbreak", "Heat break", "cylinder", [0.12, 8.9, 3.5], 4, 2,
         r=0.28, h=0.8, segments=24),
] + [
    head(f"fin{i}", "Heat sink", "cylinder", [0.12, 9.3 + i * 0.45, 3.5], 4, 2,
         r=1.1, h=0.18, segments=24)
    for i in range(4)
] + [
    head("heater", "Heater", "box", [0.12, 7.98, 3.5], 8, 1,
         role="energy", size=[2.5, 1.1, 2.2]),
    # Cylinder's r is its bottom radius, r2 its top radius: the tip points down.
    head("nozzle", "Nozzle", "cylinder", [0.12, 7.0, 3.5], 11, 0,
         r=0.13, r2=0.7, h=0.85, segments=24),
    head("bead", "Deposited plastic", "sphere", [0.12, 6.59, 3.5], 11, 0,
         role="energy", r=0.1),
    head("fan", "Fan", "torus", [3.0, 11.2, 3.9], 8, 1,
         role="actor", r=1.35, tube=0.18),
    head("fan_blades", "Fan rotor", "extrude", [3.0, 11.2, 3.9], 8, 1,
         role="actor", h=0.15, rot=[90, 0, 0],
         shape=[[0.22, 0.2], [0.9, 0.25], [1.12, 0.85], [0.4, 0.95],
                [-0.2, 0.22], [-0.25, 0.9], [-0.85, 1.12], [-0.95, 0.4],
                [-0.22, -0.2], [-0.9, -0.25], [-1.12, -0.85], [-0.4, -0.95],
                [0.2, -0.22], [0.25, -0.9], [0.85, -1.12], [0.95, -0.4]],
         anim={"spin": {"axis": [0, 0, 1], "rpm": 90}}),
] + [
    part(f"layer{i}", "Printed layers", "extrude", [0, round(3.5 + i * 0.52, 2), 0],
         shape=WALL, h=0.4)
    for i in range(6)
] + [
    part("new_line", "Hot new line", "extrude", [0, 6.48, 0],
         role="energy", shape=WALL, h=0.18),
]

HEAD = [p["id"] for p in parts if p.get("parent") == "carriage"]
FINS = [f"fin{i}" for i in range(4)]
FRAME = ["base", "bed", "left_post", "right_post", "top", "gantry", "carriage"]
FILAMENT_DOWN = [[0.12, 15, 3.5], [0.12, 11.7, 3.5], [0.12, 8.6, 3.5]]
BEAD = [[0.12, 7.5, 3.5], [0.12, 6.62, 3.5], [0.7, 6.57, 3.5], [1.8, 6.57, 3.5]]
OUTLINE = [[x, 6.59, z] for x, z in OUTER + [OUTER[0]]]
AIR = [[3.0, 11.0, 4.1], [2.8, 8.2, 4.3], [1.8, 6.9, 4.0], [0.4, 6.7, 3.5]]


def camera(yaw, pitch, zoom, target):
    return dict(yaw=yaw, pitch=pitch, zoom=zoom, target=target)


beats = [
    dict(dur=5, move=1, camera=camera(28, 16, 1.6, [0, 16.5, 0]), turn=10),
    dict(dur=6, move=2, stagger=1.1,
         camera=camera(8, 8, 2.8, [0.5, 4.8, 3.5]),
         explode=1, explodeOnly=HEAD,
         focus=["drive_gear", "heatbreak", "heater", "nozzle", "fan", "fan_blades"] + FINS,
         ghost=FRAME, labels=["drive_gear", "heater", "nozzle", "fan"]),
    dict(dur=5, move=1, camera=camera(6, 7, 6, [0.1, 11.35, 3.5]),
         focus=["drive_gear", "filament"], ghost=["feed_motor", "carriage"],
         play=["drive_gear"],
         callouts=[dict(to=[0.12, 13.2, 3.5], text="Filament", side="r"),
                   dict(to="drive_gear", text="Drive gear", side="l")],
         fx=[dict(type="flow", path=FILAMENT_DOWN, role="actor", speed=2.8, count=7),
             dict(type="arrow", **{"from": [1.9, 13.0, 3.5]}, dir=[0, -1, 0],
                  len=2.4, role="actor")]),
    dict(dur=5, move=1, camera=camera(18, 7, 6, [0.3, 7.9, 3.5]),
         focus=["heater", "nozzle", "bead"], ghost=FINS + ["heatbreak"],
         callouts=[dict(to="heater", text="Heater block", side="l"),
                   dict(to="nozzle", text="0.4 mm nozzle", side="r")],
         fx=[dict(type="heat", on="heater", role="energy"),
             dict(type="flow", path=BEAD, role="energy", speed=1.6, count=5)]),
    dict(dur=5, move=1, camera=camera(22, 30, 4.6, [0, 7.8, 1.2]),
         focus=["carriage", "nozzle", "bead", "new_line"], ghost=FRAME,
         play=["carriage"],
         callouts=[dict(to=[-2.3, 6.59, 3.5], text="One layer", side="l")],
         fx=[dict(type="beam", path=OUTLINE, role="actor", width=1.5),
             dict(type="trail", on="bead")]),
    dict(dur=5, move=1, camera=camera(12, 18, 6, [0.8, 6.5, 3.1]),
         focus=LAYER_IDS + ["fan", "fan_blades"], ghost=["heater", "nozzle"],
         play=["fan_blades"],
         callouts=[dict(to=[-2.0, 6.57, 3.5], text="Hot new line", side="l"),
                   dict(to=[2.8, 8.2, 4.3], text="Fan cools it", side="r")],
         fx=[dict(type="glow", on="new_line", role="energy", hz=0.5),
             dict(type="flow", path=AIR, role="actor", speed=3.2, count=5),
             dict(type="flow", role="energy", speed=0.6, count=3,
                  path=[[-1.2, 6.55, 3.5], [-1.2, 6.1, 3.5], [-1.2, 5.7, 3.5]])]),
    dict(dur=5, move=1, camera=camera(-24, 24, 4.7, [0, 6.6, 0]),
         focus=LAYER_IDS, ghost=FRAME + HEAD,
         callouts=[dict(to="layer3", text="10 cm = 500 layers", side="r")],
         number=dict(value="0.2", unit="mm", label="per layer")),
]

chapter = dict(
    scene="model3d", lens="explore", title="How it works",
    hint="Pinch: next step. Up/down: turn it.",
    captions=[
        "How does a 3D printer build things?",
        "The print head, taken apart.",
        "A gear pushes the plastic in.",
        "Melted at 210 °C.",
        "It draws one slice at a time.",
        "Each hot line welds to the last.",
        "0.2 mm per layer.",
    ],
    spec=dict(parts=parts, beats=beats),
)

meta = dict(
    id="printer3d", label="3D printer", short="Printer",
    detect_hint="Open frame desktop FDM printer with filament spool, horizontal gantry, nozzle and square print bed",
    concept="A motor feeds filament into a hot nozzle that deposits and bonds one thin layer at a time.",
    tagline="Plastic becomes layers",
    answer="A hot nozzle draws stacked plastic layers that bond into a solid object.",
)


if __name__ == "__main__":
    assert 20 <= len(parts) <= 35, len(parts)
    assert len(beats) == len(chapter["captions"]) == 7
    assert all(4 <= b["dur"] <= 6 for b in beats)
    assert all(len(c.split()) <= 8 for c in chapter["captions"])
    write_object(meta, chapter)
    print(f"{len(parts)} parts; {len(beats)} beats; {sum(b['dur'] for b in beats)} seconds")
    render_stills("printer3d", OUT)
