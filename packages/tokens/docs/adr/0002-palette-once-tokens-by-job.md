---
status: accepted
date: 2026-11-07
---

# Every colour lives once in a palette, and code sees only tokens named by job

Raw colours are Palette shades named by hue and OKLCH lightness (`blue/450`
is lightness 55), and every Color token points at one (`bg/surface`,
`text/secondary`). Only the tokens become CSS variables; the palette doesn't.
Code picks a colour by what it's for, so a theme or a shade changes in one
place and every use follows.

## Consequences

- **A new colour need is a new token in Figma,** not a shade used directly.
- **See-through shades are their own entries** (`neutral/850-a10`), so an
  overlay reads right on any background below it.
