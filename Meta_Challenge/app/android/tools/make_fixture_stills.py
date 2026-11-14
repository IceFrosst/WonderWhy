#!/usr/bin/env python3
"""Draws the fixture scene stills (264x264, bright lines on black) for fixture mode and tests.

Standard library only. Run from anywhere:
    python3 tools/make_fixture_stills.py
Writes app/src/main/assets/fixture/media/{ball/s1.png, ball/s2.png, guitar/s1.png}.
Colours follow shared/DESIGN.md: white = object, cyan = the moving thing, amber = force, soft = labels.
"""
import math
import os
import struct
import zlib

W = H = 264
WHITE = (255, 255, 255)
CYAN = (0x4D, 0xF0, 0xFF)
AMBER = (0xFF, 0xC2, 0x47)
SOFT = (0xC9, 0xD4, 0xFF)
DIM = (0x55, 0x55, 0x55)


class Canvas:
    def __init__(self):
        self.px = bytearray(W * H * 3)  # black = see-through on the glasses

    def dot(self, cx, cy, r, c):
        for y in range(int(cy - r), int(cy + r) + 1):
            for x in range(int(cx - r), int(cx + r) + 1):
                if 0 <= x < W and 0 <= y < H and (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    i = (y * W + x) * 3
                    self.px[i:i + 3] = bytes(c)

    def line(self, x0, y0, x1, y1, c, w=2.0):
        n = max(1, int(math.hypot(x1 - x0, y1 - y0) * 2))
        for k in range(n + 1):
            t = k / n
            self.dot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c)

    def dashed(self, pts, c, w=2.0, dash=6, gap=6):
        on, acc = True, 0.0
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            seg = math.hypot(x1 - x0, y1 - y0)
            if on:
                self.line(x0, y0, x1, y1, c, w)
            acc += seg
            if acc >= (dash if on else gap):
                on, acc = not on, 0.0

    def arrow(self, x0, y0, x1, y1, c, w=3.0):
        self.line(x0, y0, x1, y1, c, w)
        a = math.atan2(y1 - y0, x1 - x0)
        for s in (-1, 1):
            self.line(x1, y1, x1 - 12 * math.cos(a + s * 0.5), y1 - 12 * math.sin(a + s * 0.5), c, w)

    def png(self, path):
        raw = b"".join(b"\x00" + bytes(self.px[y * W * 3:(y + 1) * W * 3]) for y in range(H))

        def chunk(t, d):
            return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n")
            f.write(chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)))
            f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
            f.write(chunk(b"IEND", b""))


def parabola(t):
    """Ball path from (30, 220) to (234, 220), apex near y = 60."""
    x = 30 + 204 * t
    y = 220 - 640 * t * (1 - t)
    return x, y


def ball_s1(out):
    c = Canvas()
    c.line(16, 228, 248, 228, WHITE, 2)  # ground
    for k in range(0, 21):  # dot trail = path
        x, y = parabola(k / 20)
        c.dot(x, y, 2.5, CYAN)
    x, y = parabola(0.35)
    c.dot(x, y, 9, CYAN)  # the ball
    c.arrow(x, y + 14, x, y + 58, AMBER)  # gravity, always down
    c.png(out)


def ball_s2(out):
    c = Canvas()
    c.line(16, 228, 248, 228, WHITE, 2)
    pts = [parabola(k / 40) for k in range(41)]
    c.dashed(pts, DIM, 2)
    for k in range(1, 6):  # equal sideways steps: sideways speed never changes
        x, y = parabola(k / 6)
        c.dot(x, y, 5, CYAN)
        c.arrow(x, y, x + 24, y, SOFT, 2)
        c.line(x, 232, x, 240, SOFT, 2)  # equal ticks on the ground
    c.png(out)


def guitar_s1(out):
    c = Canvas()
    c.line(24, 96, 24, 168, WHITE, 3)  # nut
    c.line(240, 96, 240, 168, WHITE, 3)  # bridge
    up = [(24 + 216 * k / 60, 132 - 34 * math.sin(math.pi * k / 60)) for k in range(61)]
    down = [(x, 264 - y) for x, y in up]
    c.dashed(down, DIM, 2)  # ghost of the other half swing
    for a, b in zip(up, up[1:]):
        c.line(a[0], a[1], b[0], b[1], CYAN, 3)  # the vibrating string, fundamental
    c.arrow(132, 196, 132, 176, SOFT, 2)  # antinode marker
    c.png(out)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    media = os.path.join(here, "..", "app", "src", "main", "assets", "fixture", "media")
    ball_s1(os.path.join(media, "ball", "s1.png"))
    ball_s2(os.path.join(media, "ball", "s2.png"))
    guitar_s1(os.path.join(media, "guitar", "s1.png"))
    print("wrote stills to", os.path.normpath(media))
