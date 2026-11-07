---
status: accepted
date: 2026-11-07
---

# Navigation runs on the window's history, one entry per screen

There's no router: `useHistoryNavigation` pushes one history entry per screen,
so the app's back buttons, the OS and mouse back gestures and the desktop
shortcuts all pop the same stack. `navigate` also owns focus: a new screen
focuses its title, and going back lands on the control that opened the
screen, scrolled to where it was.

## Consequences

- **Each entry carries its own depth and return point,** so Back never steps
  out of the app (or out of the website hosting the demo), and a reload or a
  forward step can't confuse them.
- **Desktop shortcuts need the app's help,** since Tauri's webviews don't map
  them (ADR 0007).
