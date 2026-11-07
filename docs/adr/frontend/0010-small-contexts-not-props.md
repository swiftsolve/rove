---
status: accepted
date: 2026-11-07
---

# App-wide state comes from small contexts; views take no props

Navigation, theme, network info and the connection verdict each have their
own context, read with a hook where it's used (`useNavigation()`,
`useNetwork()`). Props are only a component's own inputs, and a view renders
with none. Small contexts mean a reader re-renders only when its own value
changes, and no component passes along a prop it doesn't use.

## Consequences

- **Only a context's provider and hook touch its object;** everything else
  reads the hook, which a lint rule enforces outside `context/` and `hooks/`.
- **The UI library reads no context** (ADR 0011).
