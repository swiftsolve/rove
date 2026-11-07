---
name: map-figma-component
description: Write or fix a library component's entry in src/ui/figma-components.json, which maps it to its Figma component in the Rove Design System file, with any deliberate differences and why. Use once a component exists in Figma, when gen/components.mjs reports a missing entry, when checks/figma-library.mjs reports a stale node, name or variant, or after a Figma component is renamed or rebuilt.
---

# Map a component to Figma

`src/ui/figma-components.json` maps each library component to its Figma component. It's
edited directly, and `npm run gen` copies each entry into
`components.gen.json`. Two checks hold it true:

- `gen/components.mjs --check` fails while a component has no entry.
- `checks/figma-library.mjs` fails when a node is gone or renamed, or when its
  variants and the component's props disagree, unless the entry gives the
  reason.

## What you need

The Figma MCP server (the claude.ai Figma connector) and Figma's `figma-use`
skill, loaded before the first `use_figma` call. Call `create_session` with the
file key first (the part after `/design/` in figma-components.json's `file`), and pass
its session id to every call after. Without the server, stop and say the entry
is left: never guess a node id.

## Steps

1. **Find the node.** The component sits on its group's page
   (`↳ Overlays` for `Overlays/Dialog`). Read it with `use_figma`:

   ```js
   const page = figma.root.children.find((p) => p.name === '↳ Overlays')
   await figma.setCurrentPageAsync(page)
   return page
     .findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })
     .filter((n) => n.parent?.type !== 'COMPONENT_SET' && /dialog/i.test(n.name))
     .map((n) => ({ id: n.id, name: n.name, type: n.type, props: n.componentPropertyDefinitions }))
   ```

   Map the component set, never one of its variants (the filter drops them).
   Its Figma name is the code name in sentence case (`IconButton` is
   `Icon button`).

2. **Write the entry**, keyed by the code name: `{ "name": "…", "node": "…" }`,
   with the node id as `use_figma` returns it (`42:189`; a link's `node-id`
   has `-` for `:`). A component with no Figma counterpart is `null`. Two
   components can share one node, as `DataList` and `DataRow` share
   `Data row`.

3. **Run the check**: `node scripts/checks/figma-library.mjs`, with
   `FIGMA_TOKEN` in `.env.local`. It skips, and passes, without one: read the
   same data through `use_figma` instead and pass it in with `--from` (the
   script's header says how).

4. **Settle each difference it reports.** Fix the side that's wrong, in code
   or in Figma. Only a difference meant to stay goes in the entry, keyed by
   the side that has it:
   - `codeOnly`: a code prop Figma has no variant for, with why
     (`tooltipSide`: "Figma draws the tooltip on its own.").
   - `figmaOnly`: a Figma variant code has no prop for, with the props it
     comes from (`Type`: "External is a link with href.").
   - `valuesDiffer`: a code prop whose values differ from Figma's on purpose,
     with why.

   An exception that no longer applies fails the check too, so drop it. The
   check reads only the keys, so reread each string already in the entry
   against the component's current props, and fix one that names a prop or
   value that's gone.

5. `npm run gen`, so `components.gen.json` takes the entry.

## Done

- `node scripts/checks/figma-library.mjs` passes against the file, not just
  skips: with `FIGMA_TOKEN`, or with `--from` data you read through
  `use_figma`. The summary says which.
- `npm run check` passes, and `components.gen.json` is committed with
  `figma-components.json`.
