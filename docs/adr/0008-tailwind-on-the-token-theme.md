---
status: accepted
date: 2026-11-07
---

# Styles are Tailwind utilities from the token theme, with no defaults

Components are styled with Tailwind v4 utilities whose theme is generated
from rove-tokens (`tailwind-theme.css`), so `p-12` is `--spacing-12` and
`bg-surface` is `--bg-surface`. Tailwind's own scales and preflight are left
out, so there's no default to reach for instead of a token; text takes a
text style's `type-*` class, never a bare size. Checks fail a raw value, an
off-scale length or a size without a style unless an allow-list says why.

## Considered options

- **CSS modules or styled components with token variables.** Nothing would
  stop a hand-typed value, and every component would restate the same
  layout rules.

## Consequences

- **A view adjusts a library component through its variants,** and
  `className` only places it (ADR 0011).
- **`cn` knows the theme's names,** so a later utility overrides an earlier
  one that sets the same thing; a new theme name needs `npm run gen`.
