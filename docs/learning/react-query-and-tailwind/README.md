# Learning Rove's UI

A plain-words tour of how Rove's React UI is built: why backend data goes
through TanStack Query (often called React Query), how styling works from a
Figma token to a class like `p-12`, how state and the library's components are
put together, where code goes, accessibility, and what the checks do and don't
catch. Every example is real code you can open. The rules themselves are in the
two guides below; these chapters explain why.

> **Companion pages:**
> - [Rove frontend](../../../apps/rove/src/README.md): the rules, and where to find which component to use.
> - [Rove UI library](../../../packages/ui/README.md): the rules every library component follows.
> - [How Rove Is Put Together](../../architecture.md): the bridge the data comes over.
> - [`DESIGN.md`](../../../packages/tokens/DESIGN.md) in
>   rove-tokens: which token to use for what.

## Contents

1. [TanStack Query](01-tanstack-query.md)
2. [Tailwind and the design tokens](02-tailwind-and-tokens.md)
3. [`cva`, `cx` and `cn`](03-cva-cx-cn.md)
4. [State and context](04-state-and-context.md)
5. [How a library component is built](05-library-components.md)
6. [Where code goes, and naming](06-where-code-goes.md)
7. [Accessibility in practice](07-accessibility.md)
8. [Checks and review](08-checks-and-review.md)

## Cheat sheet

- New backend read: a hook in the feature's `hooks/` calling `useBackendQuery`
  with a key that names the data (and the network, if it belongs to one).
- Something the backend pushes:
  - a stream, or a long job with its own state: a store with
    `useSyncExternalStore`;
  - a new value for data you can also ask for: `setQueryData` on its query;
  - a nudge with no payload: invalidate the query it's about.
- A new spacing, colour or size: add it in Figma and release rove-tokens, whose
  generated `tailwind-theme.css` maps it to a class; update the package here,
  then `pnpm gen`. Code takes only tokens.
- Text: a `type-*` class.
- A shared layout: an `@utility` in `utilities.css`.
- A component's looks: `cva`. Merging an outside `className`: `cn`. Plain
  joins: `cx`.
- A view needs app state: its hook (`useNetwork()`, `useNavigation()`), not a
  prop. Opening a screen: `navigate(...)`, which moves focus itself.
- A library component: its element's props and `ref` passed through; parts
  and slots, not `cloneElement`; runtime state as `data-*`; a new look is a
  value on an axis, not a new combined variant.
- Folders: `components/`, `context/`, `hooks/`, `utils/`. A boolean:
  `is`, `has`, `can`, `should` and the like. A shape: `type`. A comment: why.
- A changing status: a region that's always mounted. A missing value:
  `NoValue`. Parts of a line: `InlineMeta`. An exit animation: `usePresence`.
- Done: `pnpm check`, then what review catches: both themes in
  `pnpm screenshots`, `pnpm a11y`, Figma.
