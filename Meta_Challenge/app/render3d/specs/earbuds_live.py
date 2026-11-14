"""Seven-beat live-line earbuds explanation, fixed by Storyboards.md.

Run from render3d: python3 specs/earbuds_live.py
Units are mm: nozzle/canal +x, stem -y, camera yaw 0 looks from +z.
The approved v2 geometry supplies the real proportions and staged explode groups;
only explanatory parts and geometry fields survive into this line-only spec.
"""
from copy import deepcopy

import earbuds_v2 as approved
from live_common import write_object


# Keep the acoustic/electronic chain, including both microphones and the coil
# leads. No grille holes, seams, fasteners, markings, or cosmetic components.
KEEP = {
    "shell_out", "shell_in", "stem", "nozzle", "tip", "tip_base",
    "mic_out", "mic_out_board", "mic_in", "pcb", "chip", "flex", "battery",
    "cup", "magnet", "pole", "coil", "lead_a", "lead_b", "cone", "dustcap",
    "surround", "antenna", "eardrum", "eardrum_rim",
}
GEOMETRY = {
    "id", "label", "prim", "pos", "rot", "scale", "role", "explode", "order",
    "parent", "anim", "profile", "shape", "path", "r", "r2", "h", "size",
    "round", "segments", "tube", "turns", "closed",
}
parts = [{k: deepcopy(v) for k, v in p.items() if k in GEOMETRY}
         for p in approved.parts if p["id"] in KEEP]
by_id = {p["id"]: p for p in parts}
by_id["cone"]["label"] = "Speaker"
by_id["chip"]["label"] = "Chip"
# Lift the detached tip slightly above the common nozzle axis, leaving a clear
# row for its fourth part-name label throughout the short staged transition.
by_id["tip"]["explode"][1] = 8
# Axial displacement moves the diaphragm and its attached surround together.
by_id["cone"]["anim"] = {"shake": {"axis": [1, 0, 0], "amp": 0.22, "hz": 2}}

# Line rendering does not apply v2's clipping planes. Build the actual ear
# section as two thin extrusions instead: bowl flowing into a tapering canal.
# The central opening stays empty, so both the sound and the eardrum are visible.
# Rotation -90 maps each [x,z] polygon point to world [x,y], thickness along z.
ear_section = [[x, r] for r, x in approved.flesh[:-1]]
for name, sign in (("canal_top", 1), ("canal_bottom", -1)):
    parts.append({
        "id": name, "label": "Ear canal", "prim": "extrude",
        "shape": [[x, round(sign * r, 2)] for x, r in ear_section],
        "h": 0.7, "pos": [0, 0.6, -0.35], "rot": [-90, 0, 0],
        "role": "object", "explode": list(approved.E_CANAL), "order": 9,
    })

EAR = ["canal_top", "canal_bottom", "eardrum", "eardrum_rim"]
SHELL = ["shell_out", "shell_in", "stem", "nozzle", "tip", "tip_base"]
SPEAKER = ["cup", "magnet", "pole", "coil", "cone", "dustcap", "surround"]


def camera(yaw, pitch, zoom, target):
    return {"yaw": yaw, "pitch": pitch, "zoom": zoom, "target": target}


def callout(text, target, side=None):
    c = {"text": text, "to": target}
    if side:
        c["side"] = side
    return c


def sine(start, end, amp, waves, role, phase=0, speed=0.6, decay=1):
    return {"type": "sine", "from": start, "to": end, "amp": amp,
            "waves": waves, "speed": speed, "phase": phase,
            "decay": decay, "role": role}


def hum(x0, x1, amp=2.3, decay=1, role="energy", phase=0):
    # World-continuous phase: splitting at the speaker preserves the wavelength.
    # Identical canal paths with phase +180 are exact additive inverses.
    wavelength, origin = 7.68, -32
    return sine([x0, 0.6, 0], [x1, 0.6, 0], amp,
                (x1 - x0) / wavelength, role,
                (360 * (x0 - origin) / wavelength + phase) % 360)


SEAL = [8.9, 7.6, 0]
MIC = by_id["mic_out"]["pos"]
ROOM = approved.along_grille(25)
MOUTH = approved.along_grille(0.3)
CHIP = by_id["chip"]["pos"]

beats = [
    # The ear is parked off-stage until beat 3; only the recognisable bud turns.
    {"camera": camera(-35, 35, 1.55, [1.5, -7, 0]), "turn": 8,
     "dur": 5, "move": 1, "explode": 1, "explodeOnly": EAR,
     "ghost": [p["id"] for p in parts if p["id"] not in SHELL + EAR]},
    {"camera": camera(-30, 22, 0.88, [-1, -5, 0]),
     "dur": 5, "move": 2, "stagger": 1.2, "explode": 1,
     "focus": ["mic_out", "chip", "cone", "tip"],
     "labels": ["mic_out", "chip", "cone", "tip"]},
    {"camera": camera(-5, 4, 1.35, [18, 2, 0]),
     "dur": 5, "move": 1, "focus": ["tip", "tip_base"] + EAR,
     "callouts": [callout("Blocks high sounds", "tip", "r")],
     "fx": [
         sine([-12, 20, 0], SEAL, 0.6, 9, "other", speed=2.4),
         sine([-9, 22.5, 0], SEAL, 0.6, 9, "other", speed=2.4),
         sine(SEAL, [2.84, 21.9, 0], 0.5, 6, "other", speed=2.4, decay=0.3),
         sine(SEAL, [1.21, 19.9, 0], 0.5, 6, "other", speed=2.4, decay=0.3),
     ]},
    {"camera": camera(-16, 5, 1.5, [-6, 4, 0]),
     "dur": 5, "move": 1, "focus": ["mic_out", "mic_out_board"],
     "ghost": SHELL,
     "callouts": [callout("Room hum", approved.along_grille(18.825), "l"),
                  callout("Outer mic", "mic_out", "r")],
     "fx": [sine(ROOM, MOUTH, 2.4, 2, "energy"),
            {"type": "glow", "on": "mic_out", "role": "energy", "hz": 0.6}]},
    {"camera": camera(-14, 6, 1.65, [-10, 8, 0]),
     "dur": 5, "move": 1, "focus": ["chip", "pcb"], "ghost": SHELL + EAR,
     "callouts": [callout("Anti-noise", [-17.8, 13.5, 0], "l"),
                  callout("Chip", "chip", "r")],
     "fx": [
         sine([-29, 20.5, 0], [-1, 20.5, 0], 2.4, 2.5, "energy"),
         sine([-29, 13.5, 0], [-1, 13.5, 0], 2.4, 2.5, "actor", phase=180),
         {"type": "glow", "on": "chip", "role": "actor", "hz": 0.6},
         {"type": "flow", "path": [MIC, [-7.6, 4.6, -0.4], CHIP],
          "role": "energy", "speed": 3, "count": 3},
         {"type": "flow", "path": [CHIP, [-5, 5.6, 1.5], [0.5, 6, 1.5], [4.6, 4.2, 0.5]],
          "role": "actor", "speed": 4, "count": 4},
     ]},
    {"camera": camera(0, 3, 1.25, [24, 0, 0]),
     "dur": 5, "move": 1, "focus": SPEAKER + EAR, "ghost": SHELL,
     "play": ["cone"],
     "callouts": [callout("Flat at the eardrum", [27.5, 0.6, 0], "r"),
                  callout("Speaker", "cone", "l")],
     "fx": [
         hum(-16, 5.8),
         hum(5.8, 25, decay=0),
         hum(5.8, 25, decay=0, role="actor", phase=180),
         sine([22, 0.6, 0], [29.6, 0.6, 0], 0.01, 1, "answer"),
         {"type": "glow", "on": "cone", "role": "actor", "hz": 0.6},
     ]},
    {"camera": camera(-5, 5, 1.25, [24, 0, 0]),
     "dur": 5, "move": 1, "focus": EAR, "ghost": SHELL,
     "callouts": [callout("Voices still get through", [22.8, -0.6, 0], "r")],
     "number": {"value": "30", "unit": "dB", "label": "quieter on a steady hum"},
     "fx": [
         sine([16, 2.4, 0], [29.6, 2.4, 0], 0.01, 1, "answer"),
         sine([-16, -2.4, 0], [-9.6, -2.4, 0], 2, 3, "other", speed=1.6),
         sine([-16, -2.4, 0], [-9.6, -2.4, 0], 1, 8, "other", phase=40, speed=3.6),
         sine([16, -0.6, 0], [29.6, -0.6, 0], 1.4, 5, "other", speed=1.6, decay=0.7),
         sine([16, -0.6, 0], [29.6, -0.6, 0], 0.7, 13, "other", phase=40, speed=3.6, decay=0.7),
     ]},
]

captions = [
    "How do earbuds cancel noise?",
    "Inside: mics, chip, speaker.",
    "The tip seals your ear.",
    "The outer mic hears the hum.",
    "The chip flips it upside down.",
    "Peak meets dip: silence.",
    "30 dB quieter on a steady hum.",
]
chapter = {
    "lens": "explore", "scene": "model3d", "title": "How it works",
    "hint": "Pinch: next step. Up/down: turn it.", "captions": captions,
    "spec": {"parts": parts, "beats": beats},
}
meta = {
    "id": "earbuds", "label": "Noise-cancelling earbuds", "short": "Earbuds",
    "detect_hint": "wireless earbuds or headphones, or their charging case, held in a hand or in an ear",
    "concept": "Noise cancelling: a microphone hears the noise and the earbud plays the same wave flipped, so the two cancel",
    "tagline": "How silence is made",
    "answer": "They play the noise back flipped, so the two waves cancel into silence.",
}


if __name__ == "__main__":
    assert 25 <= len(parts) <= 30, len(parts)
    assert len(beats) == len(captions) == 7
    assert len({p["id"] for p in parts}) == len(parts)
    assert not any("material" in p for p in parts)
    for b, caption in zip(beats, captions):
        assert 4 <= b["dur"] <= 6 and len(caption.split()) <= 8
        assert len(b.get("fx", [])) <= 6
        assert len(b.get("callouts", [])) <= 3
        assert len(b.get("labels", [])) + len(b.get("callouts", [])) <= 4
    write_object(meta, chapter)
    print(f'{len(parts)} parts; {len(beats)} beats; '
          f'{sum(b["dur"] + b["move"] for b in beats)} seconds including moves')
