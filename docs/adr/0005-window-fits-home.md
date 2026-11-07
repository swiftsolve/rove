---
status: accepted
date: 2026-11-07
---

# The window opens exactly as tall as Home

The window opens 653px tall: the bottom of Home's last card plus the content
area's 20px bottom inset, so the first screen fits without a scrollbar and
without a gap under it. It's set in `src-tauri/tauri.conf.json`, and the Figma
screens and `npm run screenshots` follow it.

## Consequences

- **The number tracks Home's content.** A change to Home's cards or to the
  type scale's line heights moves it: measure Home's last card at 545px wide
  and add the inset.
