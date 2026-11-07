---
status: accepted
date: 2026-11-07
---

# Contrast is WCAG 2.2 AA in both themes, measured by the build

Text clears 4.5:1 and icons, bars and dots 3:1, on every surface they sit on,
in Dark and Light. `scripts/checks/contrast.mjs` measures each pair, and a
release runs it, so a shade below its target can't ship. AAA (7:1) isn't a
target.

## Consequences

- **Status words get their own darker shades** (`text/positive`,
  `text/negative`): the icon shades that pass 3:1 in Light miss 4.5:1.
- **Solid buttons deepen on hover,** since a lighter solid drops its white
  label below 4.5:1.
