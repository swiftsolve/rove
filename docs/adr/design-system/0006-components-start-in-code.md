---
status: accepted
date: 2026-11-07
---

# Components start in code, and Figma mirrors them

A component's props, variants and usage guide are written in `packages/ui/`, with
its stories and tests; `components.gen.json` is generated from them, and the
Figma component follows, found by name and exported to `packages/ui/catalog/figma/components.json`. Tokens run
the other way, from Figma (rove-tokens' ADR 0001). A component is behaviour
as much as looks, and code is where that's built, tested and reviewed.

## Consequences

- **A change to a component lands in Figma in the same task,** and the
  checks flag a Figma component whose name, node or variants no longer match.
- **Figma-only or code-only differences are written down,** with why, in the
  mapping file.
