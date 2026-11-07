---
status: accepted
date: 2026-11-07
---

# DESIGN.md ships in the package, for coding agents

`DESIGN.md` says which token to use for what, in the DESIGN.md format, and
its front matter lists every token with its value and use, rewritten by the
build. It ships in the npm package, so an agent working in Rove reads the
version Rove installed from `node_modules`, never a newer `main`.

## Consequences

- **A token's description is its documentation:** the build refuses a token
  without one, and DESIGN.md and `tokens.css` both carry it.
- **Rules that a check enforces are tagged** so a reader can tell them from
  judgment.
