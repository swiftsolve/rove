---
status: accepted
date: 2026-11-07
---

# Every story is a test, with accessibility checked

Each component's stories run in headless Chromium with the real styles, run
their `play` interactions, and fail on any axe violation, as part of
`npm test`. A component that takes a handler has a story that drives it. So
the stories that document a component also prove its keyboard, focus and
accessibility behaviour, and they can't drift from it.

## Consequences

- **Screens need their own pass:** `npm run a11y` runs axe on every screen,
  subpage and dialog in both themes, outside `npm test`.
