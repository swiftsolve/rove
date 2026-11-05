# Learning TanStack Query & Tailwind through Rove

A plain-words tour of two choices in Rove's UI: why backend data goes through
TanStack Query (often called React Query), and how styling works, from a Figma
token to a class like `p-12`, plus the three helpers `cva`, `cx` and `cn`.
Every example is real code you can open.

> **Companion pages:**
> - [Rove frontend](../../../src/README.md): the rules, checklists and component table.
> - [How Rove Is Put Together](../../architecture.md): the bridge the data comes over.
> - [`DESIGN.md`](../../../node_modules/@swiftsolve/rove-tokens/DESIGN.md) in
>   rove-tokens: which token to use for what.

## Contents

1. [TanStack Query](01-tanstack-query.md)
2. [Tailwind and the design tokens](02-tailwind-and-tokens.md)
3. [`cva`, `cx` and `cn`](03-cva-cx-cn.md)

## Cheat sheet

- New backend read → a hook in the feature's `hooks/` calling `useBackendQuery`
  with a key that names the data (and the network, if it belongs to one).
- Something the backend pushes:
  - a stream, or a long job with its own state → a store with
    `useSyncExternalStore`;
  - a new value for data you can also ask for → `setQueryData` on its query;
  - a nudge with no payload → invalidate the query it's about.
- A new spacing, colour or size → add it in Figma, release rove-tokens, map it
  in `tailwind.css`, then `npm run gen`. Never a raw value in code.
- Text → a `type-*` class.
- A shared layout → an `@utility` in `utilities.css`.
- A component's looks → `cva`; merging an outside `className` → `cn`; plain
  joins → `cx`.
