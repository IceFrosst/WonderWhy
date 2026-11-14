"""Phone live-line storyboard. Units: cm; screen up (+y), phone top at -z.

Seven layers lift top-first along a slightly forward diagonal for safe framing. A short capsule fingertip touches the glass at
25 degrees; its nail is an outline. Only write_object writes the library.
"""
import json
import math
from types import SimpleNamespace
import live_common
from live_common import add, basis_to_euler, cross, norm, pt, write_object

OUT = '/tmp/claude-1000/-home-alexbelik-Github-Junction-2026/b491deb0-4b71-46e1-baff-4fc77789087d/scratchpad/live/phone'
W, D, T = 7.15, 14.7, .78


def rrect(w, d, r, n=6):
    points = []
    for cx, cz, start in [(w/2-r, d/2-r, 0), (-w/2+r, d/2-r, 90),
                          (-w/2+r, -d/2+r, 180), (w/2-r, -d/2+r, 270)]:
        for k in range(n+1):
            a = math.radians(start + k*90/n)
            points.append([round(cx+r*math.cos(a), 4), round(cz+r*math.sin(a), 4)])
    return points


parts = []
# The second value is the departure order, top-first. Forward travel keeps
# the cover inside the stage while the camera pulls back during take-apart.
LIFTS = {'back': (-3.2, 6), 'battery': (-1.4, 5), 'board': (.9, 4),
         'frame': (3.2, 3), 'screen': (5.5, 2), 'grid': (7.8, 1), 'glass': (10.1, 0)}


def part(pid, label, prim, pos=(0, 0, 0), layer=None, role='object', **kw):
    lift, order = LIFTS.get(layer, (0, 0))
    p = dict(id=pid, label=label, prim=prim, pos=pt(*pos), role=role,
             explode=[0, lift, round(max(0, lift)*.6, 3)], order=order)
    p.update(kw)
    parts.append(p)
    return p


def plate(pid, label, w, d, h, pos, layer, r=.65, **kw):
    return part(pid, label, 'extrude', pos, layer, shape=rrect(w, d, r), h=h, **kw)


def box(pid, label, size, pos, layer=None, **kw):
    return part(pid, label, 'box', pos, layer, size=list(size), **kw)


plate('back', 'Back', W, D, .08, (0, .04, 0), 'back', r=.9)
plate('camera', 'Camera', 2.65, 3.0, .16, (-1.6, -.08, -5.2), 'back', r=.55)
for i, z in enumerate((-5.85, -4.55)):
    part('lens'+str(i+1), 'Camera lens', 'cylinder', (-1.6, -.23, z), 'back',
         r=.5, h=.18, segments=32)
# Rounded ring: outer and reversed inner contours joined with a zero-width slit.
outer, inner = rrect(W, D, .9), rrect(W-.38, D-.38, .71)
ring = outer + [inner[0]] + list(reversed(inner[1:]))
assert len(ring) <= 64
part('frame', 'Mid frame', 'extrude', (0, .37, 0), 'frame', shape=ring, h=.58)
box('board', 'Board', (6.1, .09, 3.25), (0, .26, -4.9), 'board', round=.12)
box('chip', 'Processor', (1.65, .17, 1.65), (.25, .4, -4.9), 'board', round=.07)
box('spreader', 'Heat spreader', (4.8, .045, 2.0), (.1, .52, -4.9), 'board', round=.15)
box('battery', 'Battery', (6.15, .42, 8.9), (0, .34, 1.45), 'battery', round=.2)
# The case lowers in beat 6, exposing the two electrodes and the separator.
box('cathode', 'Positive electrode', (.22, .23, 8.1), (-2.55, .36, 1.45), 'battery', round=.045)
box('separator', 'Separator', (.09, .23, 8.1), (0, .36, 1.45), 'battery')
box('anode', 'Negative electrode', (.22, .23, 8.1), (2.55, .36, 1.45), 'battery', round=.045)
plate('screen', 'Screen', W-.43, D-.55, .07, (0, .61, 0), 'screen', r=.68)
# Enlarged RGB sample, using the fixed line palette's R/G/B approximations.
for pid, x, role in [('red', -.69, 'loss'), ('green', -.15, 'answer'), ('blue', .39, 'actor')]:
    box(pid, 'Sub-pixel', (.36, .045, 1.0), (x, .665, 1.4), 'screen', role=role, round=.035)
box('off', 'Off pixel', (1.55, .045, 1.0), (0, .665, 3.2), 'screen', round=.035)
GY = .70
ROWS, COLS = [-3.4, .4, 4.2], [-2.0, -.55, .9, 2.35]
for i, z in enumerate(ROWS):
    part('row'+str(i+1), 'Touch grid', 'tube', layer='grid',
         path=[[-3.0, GY, z], [3.0, GY, z]], r=.013)
for i, x in enumerate(COLS):
    part('col'+str(i+1), 'Touch grid', 'tube', layer='grid',
         path=[[x, GY+.012, -6.4], [x, GY+.012, 6.4]], r=.013)
plate('glass', 'Cover glass', W, D, .06, (0, .75, 0), 'glass', r=.9)
box('earpiece', 'Earpiece', (1.25, .04, .13), (0, .795, -6.55), 'glass', round=.05)
part('front_lens', 'Front camera', 'cylinder', (-1.0, .8, -6.55), 'glass', r=.12, h=.035, segments=24)

# Near hemisphere's lowest point is exactly on the cover glass. The 2.4cm
# shaft extends toward the lower right, only 25 degrees above the glass.
TOUCH = [.9, T, .4]
ANGLE = math.radians(25)
AY = [.6*math.cos(ANGLE), math.sin(ANGLE), .8*math.cos(ANGLE)]
AX = norm(cross(AY, [0, 1, 0]))
AZ = norm(cross(AX, AY))
TIP_CENTRE = add(TOUCH, [0, .67, 0])
FINGER_CENTRE = add(TIP_CENTRE, AY, 1.2)
FAR = [32, 6, 24]
part('finger', 'Fingertip', 'capsule', FINGER_CENTRE, role='actor', r=.67, h=2.4,
     rot=basis_to_euler(AX, AY, AZ), explode=FAR, order=-1)
nail = []
for k in range(32):
    a = 2*math.pi*k/32
    p = add(TIP_CENTRE, AY, .85 + .68*math.cos(a))
    p = add(p, AX, .43*math.sin(a))
    p = add(p, AZ, math.sqrt(.67**2-(.43*math.sin(a))**2)+.018)
    nail.append(pt(*p))
part('nail', 'Nail outline', 'tube', role='actor', path=nail, r=.025,
     closed=True, parent='finger')

WIRES = ['row'+str(i+1) for i in range(3)] + ['col'+str(i+1) for i in range(4)]
FINGER = ['finger', 'nail']
OUTER = ['glass', 'frame', 'back', 'earpiece', 'front_lens']
ALL = [p['id'] for p in parts]


def camera(yaw, pitch, zoom, target):
    return dict(yaw=yaw, pitch=pitch, zoom=zoom, target=target)


def call(text, to, side):
    return dict(text=text, to=to, side=side)


# Used only to point at the HUD number; the renderer computes its own sphere.
R_MODEL = 8.00082
CAM7 = camera(-18, 58, 1.55, [0, .4, .3])


def screen_point(px, py, cam):
    """Model-space target-plane point projecting to a 600px HUD position."""
    yaw, pitch = (math.radians(cam[k]) for k in ('yaw', 'pitch'))
    right = [math.cos(yaw), 0, -math.sin(yaw)]
    up = [-math.sin(yaw)*math.sin(pitch), math.cos(pitch), -math.cos(yaw)*math.sin(pitch)]
    cm_per_px = 2*R_MODEL/(.7*464*cam['zoom'])
    return pt(*add(add(cam['target'], right, (px-300)*cm_per_px), up, (268-py)*cm_per_px))


beats = [
    dict(camera=camera(-20, 60, 1.35, [0, .4, 0]), turn=9,
         explode=1, explodeOnly=FINGER,
         ghost=[pid for pid in ALL if pid not in OUTER+FINGER], dur=5, move=1),
    dict(camera=camera(-24, 22, 1.02, [0, 3.4, 0]),
         explode=1, stagger=1.0, dur=5, move=2,
         focus=['glass', 'screen', 'frame', 'board', 'battery']+WIRES,
         labels=['row2', 'screen', 'board', 'battery']),
    dict(camera=camera(-12, 55, 1.95, [.9, .85, 1.0]),
         explode=0, dur=5, move=1, focus=['row2', 'col3', 'finger', 'nail'], ghost=OUTER,
         callouts=[call('Touch grid', [.9, GY, .4], 'l')],
         fx=[dict(type='waves', at=TOUCH, role='actor', hz=.6)]),
    dict(camera=camera(0, 62, 5.2, [-.3, .67, 2.35]),
         explode=1, explodeOnly=FINGER+WIRES+['glass', 'back', 'camera', 'lens1', 'lens2',
                     'battery', 'cathode', 'anode', 'separator', 'board', 'chip', 'spreader', 'frame'],
         dur=5, move=1,
         focus=['red', 'green', 'blue'], ghost=['screen', 'glass']+WIRES,
         callouts=[call('Red, green, blue', 'green', 'l'), call('Off = black', 'off', 'r')],
         fx=[dict(type='flow', path=[[x, .72, 1.4], [x, 1.65, 1.4]],
                  role=role, speed=.8, count=3) for x, role in [(-.69, 'loss'), (-.15, 'answer'), (.39, 'actor')]]),
    dict(camera=camera(-12, 58, 2.3, [0, .4, -4.3]),
         explode=1, explodeOnly=FINGER, dur=5, move=1,
         focus=['chip'], ghost=['glass', 'screen'],
         callouts=[call('Processor', 'chip', 'l'), call('Heat spreads', [3.45, .5, -4.9], 'r')],
         fx=[dict(type='heat', on='chip', role='loss'),
             dict(type='flow', path=[[.25, .55, -4.9], [1.5, .55, -4.9], [3.4, .48, -4.9], [3.4, .45, -2.8]],
                  role='loss', speed=2.1, count=7),
             dict(type='flow', path=[[.25, .55, -4.9], [-1.5, .55, -4.9], [-3.4, .48, -4.9], [-3.4, .45, -2.8]],
                  role='loss', speed=2.1, count=7)]),
    dict(camera=camera(-8, 68, 1.95, [0, .3, 1.4]),
         explode=1, explodeOnly=FINGER+['battery'], dur=5, move=1,
         focus=['cathode', 'separator', 'anode'], ghost=['battery']+OUTER+['screen'],
         callouts=[call('Lithium ions', [-.8, .47, 1.45], 'l')],
         fx=[dict(type='flow', path=[[-2.3, .47, z], [-1, .47, z], [1, .47, z], [2.3, .47, z]],
                  role='actor', speed=.8, count=6) for z in [-1.4, 1.45, 4.3]]),
    dict(camera=CAM7, explode=1, explodeOnly=FINGER, dur=5, move=1,
         focus=['battery'], ghost=OUTER+['screen'],
         number=dict(value='15', unit='Wh', label='energy in a full battery'),
         callouts=[call('A kettle uses it in 27 s', screen_point(89, 496, CAM7), 'r')]),
]
chapter = dict(scene='model3d', lens='explore', title='How it works',
               hint='Pinch: next step. Up/down: turn it.',
               captions=['What is inside a phone?', 'Seven thin layers.',
                         'Your finger bends the electric field.', 'Each pixel: three tiny lamps.',
                         'The chip turns power into heat.', 'Charging moves lithium ions.',
                         '15 Wh in a full battery.'],
               spec=dict(parts=parts, beats=beats))
meta = dict(id='phone', label='Smartphone', short='Phone',
            detect_hint='A rectangular smartphone with rounded corners, a glass touchscreen and rear camera lenses.',
            concept='A phone senses electric fields, lights OLED pixels, computes with chips and stores energy chemically.',
            tagline='Seven thin layers',
            answer='Seven thin layers sense touch, make light, compute and store electrical energy.')


def write_phone():
    """Apply metadata to existing phone during write_object's locked load.

    This helper currently applies metadata only for a new object. Adapt its
    reader locally so the existing phone is updated within that same exclusive
    lock, without changing any shared helper or other object.
    """
    original_json = live_common.json

    def load_with_meta(stream):
        data = json.load(stream)
        for obj in data['objects']:
            if obj['id'] == meta['id']:
                obj.update(meta)
                break
        return data

    live_common.json = SimpleNamespace(load=load_with_meta, dump=json.dump)
    try:
        write_object(meta, chapter)
    finally:
        live_common.json = original_json


if __name__ == '__main__':
    assert 20 <= len(parts) <= 35
    assert len(beats) == len(chapter['captions']) == 7
    assert all(len(c.split()) <= 8 for c in chapter['captions'])
    assert all(len(b.get('fx', [])) <= 4 for b in beats)
    write_phone()
    print(len(parts), 'parts;', len(beats), 'beats;', sum(b['dur']+b['move'] for b in beats), 'seconds including moves')
