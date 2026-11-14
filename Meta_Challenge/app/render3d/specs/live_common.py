"""Python stdlib helpers shared by the live-line object builders."""
import json
import os
import subprocess
import time

try:
    from .common import (
        APP, LOCK, OBJECTS, RENDER, add, basis_to_euler, cross, euler_xyz,
        mat_mul, norm, pt, r2,
    )
except ImportError:  # Builders also run directly from specs/.
    from common import (
        APP, LOCK, OBJECTS, RENDER, add, basis_to_euler, cross, euler_xyz,
        mat_mul, norm, pt, r2,
    )


def write_object(meta, chapter):
    """Load under common.py's exclusive lock; change only this object's Explore chapter."""
    object_id = meta["id"]
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
        obj = next((o for o in data["objects"] if o["id"] == object_id), None)
        if obj is None:
            data["objects"].append({**meta, "chapters": [chapter]})
        else:
            chapters = obj.setdefault("chapters", [])
            idx = next((i for i, c in enumerate(chapters)
                        if c.get("lens") == "explore" and c.get("scene") == "model3d"), None)
            if idx is not None:
                chapters.pop(idx)
            chapters.insert(0, chapter)
        with open(OBJECTS, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
    finally:
        os.remove(LOCK)
    print("wrote", object_id, "explore chapter")


def render_stills(obj_id, out_dir):
    """Render clean/captioned stills and six-frame strips to an explicit output directory."""
    subprocess.run(
        ["node", "render.mjs", "--only", str(obj_id), "--stills-only", "--strip",
         "--out", os.path.abspath(out_dir)],
        cwd=RENDER, check=True, shell=False,
    )


__all__ = [
    "write_object", "render_stills", "pt", "r2", "mat_mul", "euler_xyz",
    "basis_to_euler", "norm", "cross", "add",
]
