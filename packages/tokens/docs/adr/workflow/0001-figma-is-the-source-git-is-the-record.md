---
status: accepted
date: 2026-11-07
---

# Tokens are designed in Figma and released from git, one way

Designers work in the Rove Design System file, so tokens are made there. A
release needs what Figma lacks (review on a diff, a build that refuses a
broken reference, a version), so a token ships only once it's exported into
`src/figma/`, built and tagged here. Nothing writes back to Figma, and a check
lists anything in the repo that no longer matches the file.

## Considered options

- **Two-way sync.** Two places to edit one value, and a sync can overwrite a
  designer's change they never saw.
- **Editing tokens in code.** Designers would lose their library, and the
  Figma file would drift.

## Consequences

- **The check runs in Figma, not CI.** Figma's REST API reads variables only
  on the Enterprise plan, so the plugin or an agent runs it.
- **Only what Figma can't hold is edited here,** in `src/code-tokens.json`:
  font stacks, easing curves, CSS expressions. Shadows are Figma effect
  styles, exported like the variables.
