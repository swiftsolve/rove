# Doc diagrams

Every diagram in `docs/` is drawn in one style: the one the component
library's Storybook Introduction uses for its pipeline
(`packages/ui/.storybook/introduction.tsx` and `introduction.css`). A diagram
should read as a screenshot of that page, in Rove's dark theme, with values
taken from Rove Tokens.

The SVGs are generated. Each diagram is data in
`scripts/docs-diagrams/diagrams.ts`; `scripts/docs-diagrams/layout.ts` lays
it out with the spacing below, and `scripts/gen/docs-diagrams.ts` writes it.
Change the data, never an SVG, then run:

```bash
pnpm diagrams
```

A new diagram is a new entry there. `rove-ui-pick.png` is a terminal
screenshot, not a diagram.

## Frame

- One SVG, 960 wide, on a `#0b0b0c` backdrop (`bg-base`) with 16px corners, so
  it reads on GitHub's light and dark themes alike.
- 32px padding all round.
- A label column on the left, 168px wide, then a 24px gutter, then the cards.

## Labels

- **Section title**, at the top of the label column: Urbanist 700, 17px,
  accent `#5b8cff`. A few words: "Two directions".
- **Summary** under it: Hanken Grotesk 400, 14px, line height 20.3px,
  `#adaeb1`. One short sentence.
- **Stage label** above a column of cards: Hanken Grotesk 500, 12px,
  uppercase, letter spacing 0.72px, `#8e8f93`. Only on a section no arrow
  enters from above, or the arrow runs through it.
- A row of five steps may put its title and summary above the cards
  instead, to give them the full width. The rest keep the label column, so
  no arrow crosses a label.

## Cards

- `#151618` (`bg-surface`), 12px corners, no border, 20px padding.
- 32px between cards, across and down. A card that a whole stage passes
  through runs the full height of the stages beside it.
- Inside, top to bottom:
  1. A 24px line icon in `#adaeb1`: Lucide paths, stroke 1.75, round caps and
     joins, as `LINE_ICONS` in the Introduction has them.
  2. 16px under it, a title on a 20px line. A code name (a path, command,
     function or event) is a code chip: monospace 700, 12px, `#eeeeef`, on
     `rgba(255,255,255,0.07)`, 5px corners, 5px either side. Anything else is
     Urbanist 700, 14px, `#eeeeef`.
  3. 8px under the title, the body: Hanken Grotesk 400, 14px, line height
     20.3px, `#adaeb1`. Two or three short lines.
  4. Or, in place of a body, rows of a chip and what it is: 8px above each
     row, the text 12px after the widest chip, so it lines up down the card.
- 20px under the last line, the card ends. A card beside a taller one
  stretches to its row; nothing else changes the spacing.

## Spacing

Every distance is one entry in `SPACING` in `layout.ts`, from the Storybook
Introduction: 32 frame, 168 label column, 24 gutter, 32 between cards and
sections, 20 card padding, 24 icon, 16 icon to title, 8 title to body, 12
stage label to cards, 4 section title to summary. A distance that isn't in
that table doesn't belong on a diagram.

## Arrows

- Only between cards, in the 32px gap, level with the icons' middle.
- Dashed accent: `#5b8cff`, 1.5px, dashes 4 on and 3 off, with an open
  chevron head (2px stroke, 6px deep).
- Arrows are the only colour on a diagram besides the section titles. A
  second kind of flow is told apart by its direction or its stage, not by a
  second hue. The status colours (`#43d6a0` positive, `#f5c451` warning,
  `#f6675a` negative) appear only where they mean a status.

## Type

- Urbanist and Hanken Grotesk are embedded in the SVG as base64 WOFF2, from
  `packages/ui/src/fonts/`, since an SVG shown with `<img>` can't load a web
  font. Code chips use the system monospace, set to the width their chip was
  sized for (`textLength`), so the padding is even on every machine.
- Text is wrapped and checked with each font's measured widths, in
  `scripts/docs-diagrams/font-metrics.json`. When a font changes, measure
  again: `node scripts/docs-diagrams/measure-fonts.ts`.
- Copy follows the app's: sentences with full stops, no em dashes, no typed
  `·` or `→` (a list is commas; a flow is an arrow drawn between cards).

## Check

`pnpm lint` runs `scripts/gen/docs-diagrams.ts --check`. It fails when:

- a line of text is wider than its card, chip or label column;
- a section's title and summary are taller than its cards;
- two cards sit closer than one gap;
- an arrow misses its card's icon line, or crosses another card or a label;
- an SVG on disk isn't what its data draws, as after a hand edit.

A failure names the diagram and what to change, usually shorter copy. Then
render the SVG and read it at 1x beside the Storybook Introduction. Every
count or name on a diagram is checked against the code, as the prose around
it is.
