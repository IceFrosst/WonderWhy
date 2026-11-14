"""Shared helpers for the Explore generators: safe objects.json write, test render, rotation maths."""
import json, math, os, subprocess, sys, time

REPO = r"E:\Documents\Github\Junction-2026"
APP = os.path.join(REPO, "Meta_Challenge", "app")
OBJECTS = os.path.join(APP, "shared", "objects.json")
LOCK = os.path.join(APP, "shared", ".objects.lock")
RENDER = os.path.join(APP, "render3d")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")


def r2(v):
    return round(float(v), 2)


def pt(*v):
    return [r2(x) for x in v]


def write_chapter(object_id, chapter):
    """Lock, load fresh, replace or insert ONLY this object's explore chapter (first), write, unlock."""
    start = time.time()
    while True:
        try:
            fd = os.open(LOCK, os.O_CREAT | os.O_EXCL)
            os.close(fd)
            break
        except FileExistsError:
            if time.time() - start > 60:
                raise SystemExit("could not take the objects.json lock in 60 s")
            time.sleep(0.2)
    try:
        with open(OBJECTS, encoding="utf-8") as f:
            data = json.load(f)
        obj = next(o for o in data["objects"] if o["id"] == object_id)
        chapters = obj["chapters"]
        idx = next((i for i, c in enumerate(chapters) if c.get("lens") == "explore" and c.get("scene") == "model3d"), None)
        if idx is None:
            chapters.insert(0, chapter)
        else:
            chapters.pop(idx)
            chapters.insert(0, chapter)
        with open(OBJECTS, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
    finally:
        os.remove(LOCK)
    print("wrote", object_id, "explore chapter")


def test_render(object_id, chapter, stills_only=True, beat=None):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"{object_id}_chapter.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(chapter, f, ensure_ascii=False, indent=1)
    cmd = ["node", "render.mjs", "--spec", path, "--id", object_id, "--out", OUT]
    if stills_only:
        cmd.append("--stills-only")
    if beat:
        cmd += ["--beat", str(beat)]
    subprocess.run(cmd, cwd=RENDER, check=True, shell=False)


def main(object_id, chapter):
    mode = sys.argv[1] if len(sys.argv) > 1 else "test"
    if mode == "test":
        test_render(object_id, chapter, stills_only=True)
    elif mode == "clips":
        test_render(object_id, chapter, stills_only=False, beat=int(sys.argv[2]) if len(sys.argv) > 2 else None)
    elif mode == "write":
        write_chapter(object_id, chapter)
    elif mode == "dump":
        print(json.dumps(chapter, ensure_ascii=False, indent=1))


# ---- rotations (three.js Euler 'XYZ', degrees)
def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def euler_xyz(m):
    """Rotation matrix (rows) -> three.js XYZ Euler degrees."""
    m13 = max(-1.0, min(1.0, m[0][2]))
    y = math.asin(m13)
    if abs(m13) < 0.9999999:
        x = math.atan2(-m[1][2], m[2][2])
        z = math.atan2(-m[0][1], m[0][0])
    else:
        x = math.atan2(m[2][1], m[1][1])
        z = 0.0
    return [r2(math.degrees(x)), r2(math.degrees(y)), r2(math.degrees(z))]


def basis_to_euler(ex, ey, ez):
    """Euler that maps local x, y, z axes onto the given (orthonormal) world vectors."""
    m = [[ex[i], ey[i], ez[i]] for i in range(3)]
    return euler_xyz(m)


def norm(v):
    n = math.sqrt(sum(c * c for c in v))
    return [c / n for c in v]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def add(a, b, s=1.0):
    return [a[i] + s * b[i] for i in range(3)]
