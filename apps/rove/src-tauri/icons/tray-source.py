#!/usr/bin/env python3
"""Rasterize the Rove beacon mark to a transparent RGBA PNG (pure stdlib).

Reproduces the SVG:
  circle cx=24 cy=24 r=7.5  (filled dot)
  path   M 11.98 36.02 A 17 17 0 1 1 36.02 36.02  stroke-width=5 round caps
Output: black pixels with alpha = coverage, transparent elsewhere — a proper
macOS template image (system tints it to the menu bar).
"""
import math, struct, zlib, binascii, sys

N = 512          # output size (px)
S = 4            # supersample factor per axis
VB = 48.0        # SVG viewBox units

C = (24.0, 24.0)
RD = 7.5         # dot radius
R = 17.0         # arc radius
HS = 2.5         # half stroke width
A = (11.98, 36.02)
B = (36.02, 36.02)

def inside(x, y):
    dx, dy = x - C[0], y - C[1]
    r = math.hypot(dx, dy)
    if r <= RD:                       # centre dot
        return True
    if abs(r - R) <= HS:              # on the ring band -> check angular gap
        theta = math.degrees(math.atan2(dy, dx)) % 360.0
        # arc is drawn everywhere EXCEPT the bottom wedge (45deg, 135deg)
        if not (45.0 < theta < 135.0):
            return True
    # round caps at the two arc ends
    if math.hypot(x - A[0], y - A[1]) <= HS:
        return True
    if math.hypot(x - B[0], y - B[1]) <= HS:
        return True
    return False

scale = VB / N
inv = 1.0 / (S * S)
rows = []
for py in range(N):
    row = bytearray()
    for px in range(N):
        cov = 0
        for sy in range(S):
            y = (py + (sy + 0.5) / S) * scale
            for sx in range(S):
                x = (px + (sx + 0.5) / S) * scale
                if inside(x, y):
                    cov += 1
        a = int(round(cov * inv * 255))
        row += bytes((0, 0, 0, a))     # black, alpha = coverage
    rows.append(bytes(row))

# --- encode PNG (RGBA, 8-bit) ---
def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data +
            struct.pack(">I", binascii.crc32(tag + data) & 0xffffffff))

raw = b"".join(b"\x00" + r for r in rows)   # filter byte 0 per scanline
png = (b"\x89PNG\r\n\x1a\n" +
       chunk(b"IHDR", struct.pack(">IIBBBBB", N, N, 8, 6, 0, 0, 0)) +
       chunk(b"IDAT", zlib.compress(raw, 9)) +
       chunk(b"IEND", b""))

out = sys.argv[1]
with open(out, "wb") as f:
    f.write(png)

# sanity: alpha at a corner (should be 0) and centre (should be 255)
def alpha_at(px, py):
    return rows[py][px * 4 + 3]
print(f"wrote {out} {N}x{N}")
print("corner alpha:", alpha_at(2, 2), "centre alpha:", alpha_at(N // 2, N // 2))
