#!/usr/bin/env python3
"""Render the Rove app icon (1024x1024 RGBA, pure stdlib).

Dark rounded-square tile (matching the existing icon's treatment) with a soft
central glow and the Rove beacon mark centred in accent blue.
"""
import math, struct, zlib, binascii, sys

N = 1024
S = 3                      # supersample per axis
CX = CY = N / 2.0

# --- tile geometry ---
MARGIN = 72.0                       # smaller margin -> larger tile, matches
HALF = (N - 2 * MARGIN) / 2.0      # the visual size of sibling dock icons
RC = 198.0                          # corner radius (macOS-ish squircle)

# --- glyph (beacon mark) mapped from 48-unit viewBox into a centred box ---
GB = 648.0                          # size the 48u viewBox maps to (~0.74 * tile)
GX0 = CX - GB / 2.0
GY0 = CY - GB / 2.0
VC = (24.0, 24.0); RD = 7.5; R = 17.0; HS = 2.5
A = (11.98, 36.02); B = (36.02, 36.02)

def lerp(a, b, t): return a + (b - a) * t
def mix(c1, c2, t): return tuple(lerp(c1[i], c2[i], t) for i in range(3))

# colors
TILE_TOP = (0x1e, 0x20, 0x23)
TILE_BOT = (0x17, 0x18, 0x1b)
GLOW = (0x5b, 0x8c, 0xff)
GLYPH_TOP = (0x7a, 0xa4, 0xff)
GLYPH_BOT = (0x54, 0x84, 0xf5)

def in_tile(x, y):
    qx = abs(x - CX) - (HALF - RC)
    qy = abs(y - CY) - (HALF - RC)
    d = math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - RC
    return d <= 0.0

def tile_color(x, y):
    t = (y - (CY - HALF)) / (2 * HALF)
    t = min(1.0, max(0.0, t))
    base = mix(TILE_TOP, TILE_BOT, t)
    # soft radial glow centred a touch below middle, behind the glyph
    gx, gy = CX, CY + 40
    dist = math.hypot(x - gx, y - gy)
    g = max(0.0, 1.0 - dist / 430.0) ** 2 * 0.08
    return tuple(min(255.0, base[i] + (GLOW[i] - base[i]) * g) for i in range(3))

def in_glyph(x, y):
    sx = (x - GX0) / GB * 48.0
    sy = (y - GY0) / GB * 48.0
    dx, dy = sx - VC[0], sy - VC[1]
    r = math.hypot(dx, dy)
    if r <= RD:
        return True
    if abs(r - R) <= HS:
        th = math.degrees(math.atan2(dy, dx)) % 360.0
        if not (45.0 < th < 135.0):
            return True
    if math.hypot(sx - A[0], sy - A[1]) <= HS:
        return True
    if math.hypot(sx - B[0], sy - B[1]) <= HS:
        return True
    return False

def glyph_color(y):
    t = (y - (CY - GB / 2)) / GB
    t = min(1.0, max(0.0, t))
    return mix(GLYPH_TOP, GLYPH_BOT, t)

inv = 1.0 / (S * S)
rows = []
for py in range(N):
    row = bytearray()
    for px in range(N):
        ar = ag = ab = aa = 0.0
        for syi in range(S):
            y = py + (syi + 0.5) / S
            for sxi in range(S):
                x = px + (sxi + 0.5) / S
                if not in_tile(x, y):
                    continue
                if (GX0 <= x <= GX0 + GB and GY0 <= y <= GY0 + GB and in_glyph(x, y)):
                    c = glyph_color(y)
                else:
                    c = tile_color(x, y)
                ar += c[0]; ag += c[1]; ab += c[2]; aa += 1.0
        if aa > 0:
            row += bytes((int(round(ar / aa)), int(round(ag / aa)),
                          int(round(ab / aa)), int(round(aa * inv * 255))))
        else:
            row += b"\x00\x00\x00\x00"
    rows.append(bytes(row))

def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", binascii.crc32(t + d) & 0xffffffff)

raw = b"".join(b"\x00" + r for r in rows)
png = (b"\x89PNG\r\n\x1a\n" +
       chunk(b"IHDR", struct.pack(">IIBBBBB", N, N, 8, 6, 0, 0, 0)) +
       chunk(b"IDAT", zlib.compress(raw, 9)) +
       chunk(b"IEND", b""))
open(sys.argv[1], "wb").write(png)
print("wrote", sys.argv[1], f"{N}x{N}")
