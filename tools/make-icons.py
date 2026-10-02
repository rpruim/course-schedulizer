#!/usr/bin/env python3
"""Draws the PNG versions of the site icon (the same design as apps/web/public/favicon.svg), stdlib only:
    python3 tools/make-icons.py
Writes apps/web/public/favicon-32.png (rounded, transparent corners) and apple-touch-icon.png (full-bleed square)."""
import struct, zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "apps" / "web" / "public"
MAROON, GOLD, WHITE = (0x8C, 0x21, 0x31), (0xF6, 0xC4, 0x53), (0xFF, 0xFF, 0xFF)
# (x, y, w, h, radius, colour) in a 64 x 64 box, as in favicon.svg
BLOCKS = [(9, 13, 13, 24, 3, GOLD), (25.5, 25, 13, 26, 3, WHITE), (42, 13, 13, 14, 3, WHITE), (42, 31, 13, 20, 3, GOLD)]

def inside(px, py, x, y, w, h, r):
    if not (x <= px <= x + w and y <= py <= y + h):
        return False
    cx = min(max(px, x + r), x + w - r)
    cy = min(max(py, y + r), y + h - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r

def render(size, radius, samples=4):
    rows = []
    scale = 64 / size
    for j in range(size):
        row = bytearray([0])  # PNG filter: none
        for i in range(size):
            r = g = b = a = 0.0
            for sj in range(samples):
                for si in range(samples):
                    px = (i + (si + 0.5) / samples) * scale
                    py = (j + (sj + 0.5) / samples) * scale
                    if not inside(px, py, 0, 0, 64, 64, radius):
                        continue
                    colour = MAROON
                    for (x, y, w, h, rad, c) in BLOCKS:
                        if inside(px, py, x, y, w, h, rad):
                            colour = c
                    r, g, b, a = r + colour[0], g + colour[1], b + colour[2], a + 1
            n = samples * samples
            row += bytes([round(r / a) if a else 0, round(g / a) if a else 0, round(b / a) if a else 0, round(255 * a / n)])
        rows.append(bytes(row))
    return b"".join(rows)

def png(size, data):
    def chunk(kind, body):
        c = struct.pack(">I", len(body)) + kind + body
        return c + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(data, 9)) + chunk(b"IEND", b"")

for name, size, radius in [("favicon-32.png", 32, 14), ("apple-touch-icon.png", 180, 0)]:
    (OUT / name).write_bytes(png(size, render(size, radius)))
    print("wrote", OUT / name)
