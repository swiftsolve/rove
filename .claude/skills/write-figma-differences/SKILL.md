---
name: write-figma-differences
description: Write or fix a library component's entry in packages/ui/catalog/figma-differences.json, the hand-kept record of where a component and its Figma component differ on purpose, and why. Use when npm run gen reports a variant or prop difference with no reason, when npm run figma:export finds no Figma component for a component, or after a prop, value or Figma variant is renamed or removed.
---

# Write Figma differences

The catalog holds the Figma side in two kinds of file:

- `figma/components.json` and `figma/guides.json` are exported from the Figma
  file by `npm run figma:export`: each component's Figma name, node id and
  variant properties, and each usage guide. Never edit them: change Figma,
  then export.
- `figma-differences.json` is kept by hand: only what a script can't know.
  `schemas/figma-differences.schema.json` says what each key means. A
  component that matches its Figma component isn't in it.

`npm run gen` merges them into `components.gen.json` and fails on a
difference with no reason here, or a reason for one that's gone.

## What goes in an entry

Keyed by the code name, only the keys that apply:

- `figmaName`: its Figma component's name, when that isn't the code name in
  sentence case (`IconButton` is "Icon button" without one). A part drawn
  inside its family's component takes the family's: `CardBody` is
  `"Card"`.
- `whyNoFigmaComponent`, alone: why Figma has none, in a short sentence. It
  draws nothing of its own, or only arranges components that are in Figma.
- `propsNotInFigma`: a code prop Figma has no variant property for, with why
  (`tooltipSide`: "Figma draws the tooltip on its own.").
- `figmaVariantPropertiesNotInCode`: a Figma variant property code has no
  prop for, as `fromProps`, the component's props that decide it (empty when
  none does), and a `note` on how, with code in backticks
  (`Has label`: ``{ "fromProps": ["label"], "note": "On when `label` is set." }``).
- `propsWithDifferentValuesInFigma`: a code prop whose values differ from
  Figma's on purpose, with why.

## Steps

1. **Export**: `npm run figma:export`, with `FIGMA_TOKEN` in `.env.local`. It
   skips, and passes, without one. Then read the same data through the Figma
   MCP's `use_figma` (load Figma's `figma-use` skill first, and call
   `create_session` with the file key from `figma/components.json`'s
   `figmaFileUrl`) and pass it in with `--from`, as the header of
   `scripts/checks/figma-export.ts` says. Without either, stop and say the
   entry is left: never guess a name or a reason.
2. **Run `npm run gen`** and read what it reports.
3. **Settle each difference.** Fix the side that's wrong, in code or in
   Figma (then export again). Only a difference meant to stay gets an entry.
4. **Reread the entry's notes** against the component's current props: gen
   checks each `fromProps` name is a prop, but reads no note, so a note that
   names a prop or value that's gone stays until someone reads it.
5. `npm run gen` again, so `components.gen.json` takes the entry.

## Done

- `node scripts/checks/figma-export.ts` passes against the file, not just
  skips: with `FIGMA_TOKEN`, or with `--from` data you read through
  `use_figma`. The summary says which.
- `npm run check` passes, and `components.gen.json` is committed with
  `figma-differences.json` and any new export.
