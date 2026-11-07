---
status: accepted
date: 2026-11-07
---

# The desktop app handles back and forward shortcuts itself

Navigation runs on the window's history, which a browser steps with Alt+←/→,
⌘[ ⌘] and the mouse's thumb buttons, but Tauri's webviews map none of them.
So the app listens for those keys and buttons and steps its own history,
only when running under Tauri.

## Considered options

- **Listening everywhere.** In a browser (the web demo) each press would step
  twice, once by the browser and once by us.

## Consequences

- **Back from the first screen goes to its parent,** like the app's own back
  button, rather than leaving the app.
- **The arrow shortcuts give way in text fields,** where they move the caret.
