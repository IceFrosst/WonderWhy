"""Shared helpers for the Explore generators (guitar, bicycle, phone): locked write of one explore chapter."""
import json, os, time

OBJECTS = r"E:\Documents\Github\Junction-2026\Meta_Challenge\app\shared\objects.json"
LOCK = r"E:\Documents\Github\Junction-2026\Meta_Challenge\app\shared\.objects.lock"


def r2(v):
    return round(float(v), 2)


def pt(x, y, z):
    return [r2(x), r2(y), r2(z)]


def is_explore(c):
    return c.get("lens") == "explore" and c.get("scene") == "model3d"


def write_chapter(obj_id, chapter):
    """Lock, load fresh, replace/insert ONLY obj_id's explore chapter as its first chapter, write, unlock."""
    t0 = time.time()
    while True:
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            break
        except FileExistsError:
            if time.time() - t0 > 60:
                raise RuntimeError("objects.json lock busy for 60 s")
            time.sleep(0.2)
    try:
        with open(OBJECTS, encoding="utf-8") as f:
            data = json.load(f)
        obj = next(o for o in data["objects"] if o["id"] == obj_id)
        chs = obj["chapters"]
        if chs and is_explore(chs[0]):
            chs[0] = chapter
        else:
            obj["chapters"] = [chapter] + [c for c in chs if not is_explore(c)]
        text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        for attempt in range(50):  # Windows: another reader may hold the file for a moment
            try:
                with open(OBJECTS, "w", encoding="utf-8", newline="\n") as f:
                    f.write(text)
                break
            except OSError:
                if attempt == 49:
                    raise
                time.sleep(0.2)
    finally:
        os.remove(LOCK)
    print("wrote", obj_id, "explore:", len(chapter["spec"]["parts"]), "parts,", len(chapter["spec"]["beats"]), "beats")


def catmull_closed(points, per_seg=40):
    """Dense closed centripetal Catmull-Rom through 2D points."""
    import math as _m
    n = len(points)
    out = []
    for i in range(n):
        p0, p1, p2, p3 = points[i - 1], points[i], points[(i + 1) % n], points[(i + 2) % n]

        def tj(ti, a, b):
            return ti + max(1e-6, _m.hypot(b[0] - a[0], b[1] - a[1])) ** 0.5
        t0 = 0.0
        t1 = tj(t0, p0, p1)
        t2 = tj(t1, p1, p2)
        t3 = tj(t2, p2, p3)
        for k in range(per_seg):
            t = t1 + (t2 - t1) * k / per_seg

            def lerp(a, b, ta, tb):
                return [(tb - t) / (tb - ta) * a[j] + (t - ta) / (tb - ta) * b[j] for j in range(2)]
            a1 = lerp(p0, p1, t0, t1)
            a2 = lerp(p1, p2, t1, t2)
            a3 = lerp(p2, p3, t2, t3)
            b1 = lerp(a1, a2, t0, t2)
            b2 = lerp(a2, a3, t1, t3)
            out.append(lerp(b1, b2, t1, t2))
    return out


def resample_closed(dense, n, bend=6.0):
    """Pick n points along a dense closed polyline, spaced by arc length plus bend * turning (so curves get more)."""
    import math as _m
    m = len(dense)
    w = []
    for i in range(m):
        a, b, c = dense[i - 1], dense[i], dense[(i + 1) % m]
        l = _m.hypot(c[0] - b[0], c[1] - b[1])
        h1 = _m.atan2(b[1] - a[1], b[0] - a[0])
        h2 = _m.atan2(c[1] - b[1], c[0] - b[0])
        turn = abs(_m.atan2(_m.sin(h2 - h1), _m.cos(h2 - h1)))
        w.append(l + bend * turn)
    total = sum(w)
    out, acc, k = [], 0.0, 0
    for i in range(m):
        if acc >= k * total / n and len(out) < n:
            out.append(dense[i])
            k += 1
        acc += w[i]
    return out


def cam_pos(R, yaw, pitch, zoom, target):
    """Camera position of render3d's orbit camera (FOV 26, zoom 1 = model radius R fills 70% of the 464 px stage)."""
    import math as _m
    dist = R * 600 / (0.7 * 464 * zoom * _m.tan(_m.radians(13)))
    d = (_m.sin(_m.radians(yaw)) * _m.cos(_m.radians(pitch)), _m.sin(_m.radians(pitch)),
         _m.cos(_m.radians(yaw)) * _m.cos(_m.radians(pitch)))
    return [target[i] + d[i] * dist for i in range(3)], dist


def far_point(R, cam, p, m):
    """A point on the ray camera->p, m times as far: fx rings drawn there look 1/m the size at p's screen spot."""
    return pt(*[cam[i] + (p[i] - cam[i]) * m for i in range(3)])
