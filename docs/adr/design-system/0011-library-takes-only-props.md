---
status: accepted
date: 2026-11-07
---

# The UI library takes only props, and a view's className only places it

`src/ui` is Rove's design system in code: it imports only itself and
packages, never app code or context, so every component renders in Storybook
alone and matches its Figma component. A view adjusts a component through its
variants (`density`, `align`); `className` from outside sets only placement
(margin, position, size, grid or flex item). Padding, type, colour or surface
passed in is a missing variant.

## Consequences

- **A tweak two views need becomes a variant,** documented and drawn in
  Figma, not a class one view passes.
- **Lint and `checks/ui-classname.ts` enforce both rules.**
