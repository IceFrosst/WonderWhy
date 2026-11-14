"""Finnish electric kiuas, seven fixed live-line storyboard beats.

Run from render3d: python3 specs/sauna_live.py [--render]
Coordinates are roughly decimetres, y up; deliberately no style or materials.
"""
import sys
from live_common import pt, write_object, render_stills

OUT = '/tmp/claude-1000/-home-alexbelik-Github-Junction-2026/b491deb0-4b71-46e1-baff-4fc77789087d/scratchpad/live/sauna'


def part(pid, label, prim, pos=(0, 0, 0), role='object', **fields):
    return dict(id=pid, label=label, prim=prim, pos=pt(*pos), role=role,
                explode=[0, 0, 0], **fields)


def tube(pid, label, path, r=0.08, **fields):
    return part(pid, label, 'tube', path=[pt(*p) for p in path], r=r, **fields)


def cam(yaw, pitch, zoom, target):
    return dict(yaw=yaw, pitch=pitch, zoom=zoom, target=target)


def call(text, to, side='r'):
    return dict(text=text, to=to, side=side)


parts = [part('base', 'Stove base', 'box', (0, 1, 0), size=[6.5, 2, 5.4], round=0.18)]
# A sparse cage preserves the silhouette without obscuring stones and elements.
for i, y in enumerate((2.3, 5.3, 8.5)):
    parts.append(tube(f'ring{i}', 'Steel cage',
                      [(-3.2, y, -2.6), (3.2, y, -2.6), (3.2, y, 2.6), (-3.2, y, 2.6)], closed=True))
for i, (x, z) in enumerate(((-3.2, -2.6), (3.2, -2.6), (-3.2, 2.6), (3.2, 2.6))):
    parts.append(tube(f'post{i}', 'Steel cage', [(x, 1.9, z), (x, 8.5, z)]))
# Three inverted-U resistance elements, standing among the stones.
for i, z in enumerate((-1.55, 0, 1.55)):
    p = tube(f'element{i}', 'Heating elements',
             [(-2, 1.9, z), (-2, 6.3, z), (-1.8, 7.3, z), (0, 7.7, z),
              (1.8, 7.3, z), (2, 6.3, z), (2, 1.9, z)], r=0.14, role='energy')
    p['order'] = 0
    parts.append(p)
# Fourteen flattened rocks: a broad six-stone bed, five interlocked above,
# and an uneven three-stone crown. Slight overlaps keep the heap continuous.
stone_positions = [(-1.95, 5.85, -1.05), (0.05, 5.95, -1.12), (1.98, 5.8, -0.98),
                   (-1.9, 5.9, 1.05), (0.12, 5.8, 1.12), (1.95, 5.95, 1.0),
                   (-1.55, 7.2, -0.95), (1.55, 7.15, -1.0), (0, 7.18, 0.05),
                   (-1.55, 7.25, 1.0), (1.5, 7.3, 1.05),
                   (-0.95, 8.55, -0.65), (1.0, 8.5, -0.45), (0.05, 8.65, 1.0)]
for i, pos in enumerate(stone_positions):
    # Unequal shoulders and a blunt crown break the perfect ellipsoid outline.
    # Index-based variations are repeatable, including each rock's profile.
    profile = [[0, -1], [0.55 + 0.03 * (i % 3), -0.86],
               [0.92, -0.48], [1.02 - 0.025 * (i % 4), -0.08],
               [0.91 + 0.02 * (i % 3), 0.38], [0.62, 0.79], [0, 0.96]]
    p = part(f'stone{i}', 'Stones', 'lathe', pos, profile=profile,
             scale=[1.12 + 0.045 * ((i * 3) % 5),
                    0.74 + 0.035 * ((i * 2) % 5),
                    1.02 + 0.04 * ((i * 4) % 5)],
             rot=[-12 + (i * 7) % 25, -20 + (i * 13) % 41, -14 + (i * 11) % 29])
    p.update(explode=[0, 6.5, 0], order=1 + (i >= 6) + (i >= 11))
    parts.append(p)
for i, x in enumerate((-1.15, 1.15)):
    parts.append(part(f'knob{i}', 'Control knob', 'cylinder', (x, 1.05, 2.9),
                      r=0.43, h=0.48, rot=[90, 0, 0], segments=24))
# Open tapered bucket, bent handle and a shallow ladle bowl beside the heater.
parts += [part('bucket', 'Bucket', 'lathe', (-7, 0, 0),
               profile=[[0, 0.25], [1.35, 0.25], [1.65, 2.7], [1.5, 2.7], [1.2, 0.5], [0, 0.5]]),
          tube('bucket_handle', 'Bucket handle', [(-8.6, 2.3, 0), (-8.4, 4, 0), (-7, 4.5, 0), (-5.6, 4, 0), (-5.4, 2.3, 0)], r=0.12)]
ladle = part('ladle', 'Ladle', 'lathe', (-6.8, 3.1, 0.7),
             profile=[[0, -0.5], [0.5, -0.38], [0.8, -0.05], [0.85, 0.3], [0.73, 0.3], [0.65, 0], [0.35, -0.25], [0, -0.3]],
             rot=[0, 0, -18], anim={'swing': {'axis': [0, 0, 1], 'deg': 35, 'hz': 0.2}})
ladle.update(explode=[6.3, 9, 0], order=0)
parts += [ladle, tube('ladle_handle', 'Ladle handle', [(-6.1, 3.1, 0.7), (-3.5, 6.1, 0.7)], r=0.13, parent='ladle')]
# Shallow curved skin slab; its front faces +z, toward the close-up camera.
arc = [[x, round(0.06 * x * x, 3)] for x in (-2.6, -1.8, -0.9, 0, 0.9, 1.8, 2.6)]
shape = arc + [[x, z + 0.26] for x, z in reversed(arc)]
skin = part('skin', 'Skin', 'extrude', (13, 7.5, 0), shape=shape, h=5.4)
skin['explode'] = [30, 0, 0]  # offstage until condensation; explode does not affect bounds
parts.append(skin)
for i, (x, y) in enumerate(((-1.3, 0.9), (0.3, -0.5), (1.45, 1.4))):
    parts.append(part(f'drop{i}', 'Condensed water', 'sphere', (13 + x, 7.5 + y, 0.6),
                      role='actor', r=0.25, scale=[0.8, 1.25, 0.65], parent='skin'))

STONES = [f'stone{i}' for i in range(14)]
ELEMENTS = [f'element{i}' for i in range(3)]
CAGE = [f'ring{i}' for i in range(3)] + [f'post{i}' for i in range(4)]
STOVE = ['base', 'knob0', 'knob1'] + CAGE + ELEMENTS + STONES
KIT = ['bucket', 'bucket_handle', 'ladle', 'ladle_handle']
DROPS = [f'drop{i}' for i in range(3)]


def beat(camera, **fields):
    return dict(camera=camera, dur=5, move=1, **fields)


beats = [
    beat(cam(25, 18, 2.1, [-2, 5, 0]), turn=7, explode=1, explodeOnly=['skin'], focus=STOVE + KIT),
    dict(camera=cam(20, 15, 1.65, [-1.5, 8, 0]), dur=5, move=2, stagger=1.2,
         explode=1, explodeOnly=STONES + ['skin'], focus=STONES + ELEMENTS + ['ladle', 'ladle_handle'],
         labels=['element2', 'stone10', 'ladle']),
    beat(cam(22, 22, 2.6, [0, 6.5, 0]), explode=1, explodeOnly=['skin'], focus=STONES + ELEMENTS,
         ghost=CAGE, callouts=[call('About 300 °C', 'stone10')],
         fx=[{'type': 'heat', 'on': 'element2', 'role': 'energy'}] +
            [{'type': 'flow', 'path': [[x, 3, 1.6], [x, 6.5, 1.8], [x, 9, 1.4]],
              'role': 'energy', 'speed': 2, 'count': 5} for x in (-1.5, 1.5)]),
    beat(cam(12, 16, 2.1, [0, 10.5, 0]), explode=1, explodeOnly=['skin', 'ladle'],
         focus=STONES + ['ladle', 'ladle_handle'], play=['ladle'],
         callouts=[call('1 ladle = 170 L steam', [0, 13, 0], 'l')],
         fx=[{'type': 'flow', 'path': [[-0.5, 12, 0.7], [-0.7, 11, 0.7], [-0.9, 9.8, 0.7]],
              'role': 'actor', 'count': 8, 'speed': 3},
             {'type': 'steam', 'at': [0, 10, 0], 'radius': 0.8, 'rise': 6, 'role': 'actor'}]),
    beat(cam(8, 12, 1.5, [4, 10, 0]), explode=1, explodeOnly=['skin'], focus=STONES,
         callouts=[call('Hot steam', [3, 18, 0], 'r')],
         fx=[{'type': 'steam', 'at': [0, 10, 0], 'radius': 0.65, 'rise': 7, 'role': 'actor'},
             {'type': 'flow', 'path': [[0, 10, 0], [0, 16, 0], [3, 18, 0], [9, 17, 0], [13, 13, 0], [13, 7, 0]],
              'role': 'actor', 'speed': 5, 'count': 18},
             {'type': 'arrow', 'from': [13, 12, 0], 'dir': [0, -1, 0], 'len': 3, 'role': 'actor'}]),
    beat(cam(8, 12, 4.1, [13, 7.5, 0.3]), focus=['skin'] + DROPS,
         callouts=[call('Hidden heat released', 'skin', 'l')],
         fx=[{'type': 'flow', 'path': [[12, 10, 4], [12, 9, 2], [11.7, 8.4, 0.6]],
              'role': 'actor', 'speed': 1.5, 'count': 6}] +
            [{'type': 'arrow', 'from': [x, y, 3], 'dir': [0, 0, -1], 'len': 2.3, 'role': 'energy'}
             for x, y in ((11.7, 8.4), (13.3, 7), (14.45, 8.9))]),
    beat(cam(8, 12, 3.5, [13, 7.7, 0.3]), focus=['skin'] + DROPS,
         number={'value': '2260', 'unit': 'kJ/kg', 'label': 'from condensing steam'},
         callouts=[call('5× heating cold water', [12.543, 2.233, 0.5], 'l')],
         fx=[{'type': 'arrow', 'from': [13.3, 7.4, 3], 'dir': [0, 0, -1], 'len': 2.3, 'role': 'energy'}]),
]
chapter = dict(scene='model3d', lens='explore', title='How it works',
               hint='Pinch: next step. Up/down: turn it.',
               captions=['Why does sauna steam bite?', 'Elements under a pile of stones.',
                         'The stones store heat.', 'Water flashes into steam.',
                         'Steam rolls down over you.', 'On skin it turns back to water.',
                         '2260 kJ/kg from condensing steam.'],
               spec=dict(parts=parts, beats=beats))
meta = dict(id='sauna', label='Sauna stove', short='Sauna',
            detect_hint='Finnish electric sauna heater with a steel cage full of stones and control knobs',
            concept='Hot stones vaporise ladled water, and condensing steam transfers hidden heat to skin.',
            tagline='Why steam bites', answer='Steam condenses on cooler skin, releasing the heat stored when water evaporated.')
assert len(parts) <= 35
assert len(STONES) == len(stone_positions) == 14
assert len(beats) == len(chapter['captions']) == 7
assert all(len(c.split()) <= 8 for c in chapter['captions'])

if __name__ == '__main__':
    write_object(meta, chapter)
    print(f'{len(parts)} parts; {len(beats)} beats; {sum(b["dur"] for b in beats)} seconds hold; ' 
          f'{sum(b["dur"] + b["move"] for b in beats)} seconds including moves')
    if '--render' in sys.argv:
        render_stills('sauna', OUT)
