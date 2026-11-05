# Rove design

How to build Rove's interface with these tokens, for anyone writing Rove UI, people and coding agents alike. The [token reference](#token-reference) at the end lists every value; [`docs/rationale.md`](docs/rationale.md) explains why they are what they are.

**[CHECKED]** marks a rule a check enforces: break it and `npm run check` fails. Rove's checks are in its `scripts/checks/`, the tokens' own in this repo's. A rule without the tag is judgment: no check catches a slip, so look at the result in both themes.

## Setup

```css
@import '@swiftsolve/rove-tokens/tokens.css';
```

Dark is the default, on `:root`. Add the `theme-light` class to the root element for Light. Every token has both values, so a screen that only uses tokens themes itself.

## Rules

- **Use a token, never a raw value.** No hex colours, no pixel gaps, no font sizes typed by hand. If nothing fits, the design needs a new token in Figma, not a one-off in code. The only exceptions are the off-scale lengths in [Spacing and shape](#spacing-and-shape). [CHECKED] Rove's `raw-values`, and `custom-properties` for a misspelt name.
- **Every token says what it's for.** Its Figma description is its use, listed in the [token reference](#token-reference). Pick by that, not by the value. [CHECKED] `descriptions`.
- **Name by job, not by look.** Pick `--bg-surface` because it's content on the backdrop, not because it's the right grey. The Palette shades (`neutral/850`) aren't CSS variables, on purpose.

### Surfaces

- **Backgrounds are layers; overlays sit on one.** A `--bg-*` is opaque, and each stacks on the last (base, surface, inset). An `--overlay-*` is see-through, laid over whatever background is below, so a hovered row keeps its card's `--bg-surface` and adds `--overlay-hover`. A `*-solid` is the opaque colour under a white label (`--accent-solid`, `--status-negative-solid`). Why: [rationale](docs/rationale.md).
- Three backgrounds: `--bg-base` for the backdrop, `--bg-surface` for content that sits on it (cards, dialogs), `--bg-inset` for areas sunk into a surface (bands, inputs, soft and icon buttons). `--bg-chrome` is the title bar and rail, a half step off the backdrop. `--bg-popover` is a step lighter in Dark, for tooltips and menus. `--bg-hover` is a hovered surface, `--bg-scrim` goes behind dialogs.
- Cards get depth from `--shadow-panel`, not hard outlines. Tooltips and menus use `--shadow-popover` on `--bg-popover`; dialogs and hovered cards use `--shadow-raised`.
- Every line is `--border-default`: hairlines, and the edges of menus, tooltips and dialogs.
- For hovers, chips and tracks on a surface, use the `--overlay-*` tokens, by strength: `--overlay-faint` (3%), `--overlay-subtle` (5%), `--overlay-default` (7%), `--overlay-strong` (16%). They flip with the theme, so they stay visible on both. A hovered row or expandable header uses `--overlay-hover`: 3% white in Dark, 2% ink in Light, so in Light it stays lighter than an open `--bg-inset` panel below it. Selected text is `--overlay-selection`.

### Text and icons

- `--text-primary` for content, `--text-secondary` for supporting lines, `--text-tertiary` for the quietest text and for icons by default.
- On a solid (accent or negative), labels and icons use `--text-on-solid`.
- Words in the accent (a link, a highlighted value) use `--text-accent`, on a surface or on `--accent-muted` (a selected item, a tinted button).
- Each text, status and accent token clears WCAG AA (words 4.5:1, icons and lines 3:1) on every background this page puts it on, in both themes. [CHECKED] `contrast`. Picking the token for the job is still judgment: a `--status-*` shade under words passes no check.

### Accent and buttons

- `--accent-default` is for accent icons and lines. It's too light for words in Light mode, and under a white label.
- An accent icon or line that responds to the pointer uses `--accent-hover` and `--accent-press`. They aren't for solids: a solid button has its own pair.
- Solid buttons use `--accent-solid`, hovering to `--accent-solid-hover`. Hovers deepen, never lighten, so the white label keeps its contrast. [CHECKED] `contrast`.
- A solid red control (a solid negative button, the window close hover) uses `--status-negative-solid` and `--status-negative-solid-hover`.

### Status

- `--status-*` (positive, good, warning, poor, negative) colour icons, bars and dots.
- Words in a status colour use `--text-*` of the same name, which also clear a tint of their hue (a badge). The `--status-*` shades are too light for text in Light mode. [CHECKED] `contrast`, for the tokens.
- Download and upload in charts are `--series-down` and `--series-up`.

### Tints and opacity

Tints are a colour mixed with transparent at one of the shared strengths, so a tinted tile reads the same everywhere:

```css
background: color-mix(in srgb, var(--status-positive) var(--opacity-tint-md), transparent);
```

Pick the strength by the tint's size and job:

- `--opacity-tint-xs`: a wide, faint wash, such as the top of a chart's shaded area.
- `--opacity-tint-sm`: a panel or banner in a status colour.
- `--opacity-tint-md`: chips, badges and tiles at rest, and the edge of an `sm` panel.
- `--opacity-tint-lg`: an `md` tint hovered, and unlit meter bars.
- `--opacity-tint-xl`: the strongest wash, the download series' shaded area.

Disabled controls use `--opacity-disabled`. `--opacity-high` dims a mark that should stay nearly solid, like a chart line behind another.

### Spacing and shape

- Every gap, padding and margin is a `--spacing-*` step. [CHECKED] `raw-values`.
- Cards use `--card-padding` on every side. The rail and the content column share the side inset `--spacing-12`.
- A card header is `--card-header-height` tall. A header-like strip that can grow with its content takes `--card-header-min-height` as its minimum instead.
- Corners are `--radius-*`: `xs` for small controls inside others (menu items, segments, window buttons), `sm` for controls, `md` for nav items and the page-header chip, `lg` for cards and dialogs, `full` for pills and dots. A thin bar or line takes `full` too: it rounds to half its width. [CHECKED] `raw-values`.
- **Off the scale only when something else sets the length**, and say why where it's used:
  - spacing that lines up with an icon's ink rather than its box, or gives back a 1px border;
  - spacing that lines up with something that isn't spacing, like an icon's width or a label column;
  - a corner that copies a shape from outside the system, like the app icon's.

  A value that's just "a bit more" isn't an exception: take the nearest step, or propose a token in Figma. [CHECKED] `raw-values` fails an off-scale value until its reason is in its `ALLOWED` list.
- Sizes (widths, heights, icon sizes) and line heights have no scale, so a typed one is fine.

### Type

- Set text with a text style's class from `text-styles.css` (`.type-heading-large`), or all four of its `--type-<style>-*` variables, never a font size alone. Each style's use is in [Text styles](#text-styles). [CHECKED] `text-styles`.
- Numbers that are data (speeds, totals, chart labels) use the Number styles (`number-*`), set in Questrial; everything else is Inter.

### Focus and motion

- Keyboard focus is `outline: var(--focus-outline)` with `outline-offset: var(--focus-offset)`. Rows flush with a card's edge draw it inside instead, with `--focus-inset`.
- Animate with `--ease-out` (or `--ease-in-out`) over `--duration-fast` or `--duration-normal`. A panel resizing to its content springs, with `var(--duration-spring) var(--ease-spring)`: it arrives within `--duration-normal`, and its slight overshoot settles after. A looping pulse uses `--ease-pulse`, which is symmetric, so it fades out and back in alike. [CHECKED] `raw-values` fails a raw curve, and a duration typed where a token has the value.

### Icons

- Icons share a 24px grid, a 1.75px stroke and round caps.
- Icons are `--text-tertiary` by default. The active nav item's is `--accent-default`, an icon button's `--text-secondary`, a download icon `--series-down`, a secured or passing one `--status-positive`.
- The brand mark is always `--accent-default`, 22px in the title bar.

## Changing the design

Tokens are designed in Figma and released from the rove-tokens repo, one way: change a token in Figma, export it with the plugin in `figma-plugin/` into `src/figma/` (or `npm run figma:export` through the Figma MCP), run `npm run build`, and check the repo matches the file (`npm run figma:check`). Nothing writes back to Figma. The [README](README.md#update-the-tokens) has the steps. Don't edit `tokens.css`, `tokens/` or `src/figma/` by hand. Shadows are Figma's `Shadow/*` effect styles and export with the rest; only what Figma can't hold (easing curves, the focus outline) lives in `src/code-tokens.json`. Then [release](README.md#release) a version, update Rove to it, and resync the sites that embed Rove. The `update-tokens` skill (`.claude/skills/update-tokens/SKILL.md`) runs it all.

Everything below the next line is rewritten by `npm run build`; edit only above it.

<!-- Generated by npm run build from the Figma export and tokens.css. Edit above this line. -->

## Token reference

Names and uses, from Figma. The values are in `tokens.css`; Dark and Light differ only in colour and shadow.

### Colour

- **Backgrounds:** `--bg-base` (backdrop), `--bg-surface` (content on the backdrop), `--bg-hover` (hovered rows and buttons), `--bg-scrim` (behind dialogs), `--bg-inset` (sunken areas inside a surface), `--bg-popover` (tooltips and menus), `--bg-chrome` (title bar and rail)
- **Lines:** `--border-default` (hairlines)
- **Overlays:** `--overlay-default` (default strength), `--overlay-subtle` (lighter), `--overlay-faint` (faintest), `--overlay-strong` (strongest), `--overlay-selection` (text selection), `--overlay-hover` (hovered rows and headers)
- **Text:** `--text-primary` (content), `--text-secondary` (supporting lines), `--text-tertiary` (default icon colour), `--text-accent` (accent words, also on accent/muted), `--text-positive` (positive words), `--text-good` (good words), `--text-warning` (warning words), `--text-poor` (poor words), `--text-negative` (negative words), `--text-on-solid` (labels and icons on solids)
- **Accent:** `--accent-default` (accent icons and lines), `--accent-hover` (hovered accent icon or line), `--accent-press` (pressed accent icon or line), `--accent-muted` (tinted accent background), `--accent-solid` (under white labels), `--accent-solid-hover` (hovered solid button)
- **Status:** `--status-positive` (positive icons, bars, dots), `--status-good` (between positive and warning), `--status-warning` (warning icons, bars, dots), `--status-poor` (between warning and negative), `--status-negative` (negative icons, bars, dots), `--status-negative-solid` (solid negative under white labels), `--status-negative-solid-hover` (hover)
- **Chart series:** `--series-down` (download), `--series-up` (upload)
- **Focus:** `--focus-ring` (keyboard focus ring)

### Scales

- **Spacing:** `--spacing-<n>`, n in px: 2 (meter gaps), 4 (arrow to value, badge padding), 6 (dot to label), 8 (icon to title), 10 (between cards), 12 (side and top inset), 14 (card padding), 16 (between readouts), 20 (content bottom inset)
- **Radius:** `--radius-xs` 5px (window buttons, menu items, segments), `--radius-sm` 8px (buttons, inputs, tooltips, icon tiles), `--radius-md` 10px (nav items, page-header chip), `--radius-lg` 13px (cards and dialogs), `--radius-full` 999px (badges, pills, dots)
- **Font sizes:** `--font-size-2xs` 10px (badges, overlines, chart axes), `--font-size-xs` 11px (captions, small labels), `--font-size-sm` 12px (helper text, menus, button labels), `--font-size-md` 13px (body text, data values), `--font-size-lg` 14px (card headings), `--font-size-xl` 15px (dialog titles), `--font-size-2xl` 17px (page titles, stat totals), `--font-size-3xl` 28px (live speeds)
- **Font families:** `--font-family-sans` Inter (interface text), `--font-family-numeric` Questrial (numbers)
- **Opacity:** `--opacity-tint-xs` 8% (faintest tint), `--opacity-tint-sm` 10% (light tint), `--opacity-tint-md` 14% (tint), `--opacity-tint-lg` 22% (strong tint), `--opacity-tint-xl` 28% (strongest tint), `--opacity-high` 80% (nearly opaque), `--opacity-disabled` 40% (disabled controls)
- **Layout:** `--rail-item-size` 38px (rail items), `--titlebar-height` 56px (title bar)
- **Cards:** `--card-padding` `var(--spacing-14)` (card inset), `--card-header-padding-y` `var(--card-padding)` (card header, above and below), `--card-header-padding-x` `var(--card-padding)` (card header, sides), `--card-header-min-height` 42px (compact card header), `--card-header-height` 44px (card header), `--card-body-padding` `var(--card-padding)` (card body inset), `--row-padding-y` `var(--spacing-8)` (data row, above and below)
- **Font weights:** `--weight-regular` 400 (body text), `--weight-medium` 500 (labels and menus), `--weight-semibold` 600 (headings and buttons)
- **Motion:** `--duration-fast` 140ms (hovers, small changes), `--duration-normal` 220ms (panels, page changes), `--duration-spring` 450ms (a spring’s full run)
- **Focus:** `--focus-offset` `var(--spacing-2)` (focus ring offset), `--focus-ring-width` 1px (focus ring stroke)

### Text styles

Apply a style with its class from `text-styles.css`. Each class reads four variables, `--type-<style>-size`, `-weight`, `-line-height` and `-letter-spacing`; set all four if you use them directly.

| Style | Class | Size, weight | Use |
| --- | --- | --- | --- |
| Heading/Large | `.type-heading-large` | 17px 600 | Page titles, the wordmark. |
| Heading/Medium | `.type-heading-medium` | 15px 600 | Dialog titles. |
| Heading/Small | `.type-heading-small` | 14px 600 | Card headings. |
| Body/Default | `.type-body-default` | 13px 400 | Body text. |
| Overline | `.type-overline` | 10px 500 | Uppercase labels above values. |
| Caption | `.type-caption` | 11px 400 | Live badge, captions, footer hints. |
| Label/Large | `.type-label-large` | 12px 600 | Solid button labels. In code: Button variant=solid |
| Number/Display | `.type-number-display` | 28px 400, Questrial | Live speeds. Add a 0.43px outside stroke. In code: .type-number-display .metric-value, at weight 600: Questrial has one weight, so the browser emboldens it. |
| Number/Large | `.type-number-large` | 17px 400, Questrial | Stat totals. Add a 0.26px outside stroke. In code: Readout size=compact |
| Number/Default | `.type-number-default` | 13px 400, Questrial | Data row values. |
| Number/Small | `.type-number-small` | 10px 400, Questrial | Chart axes and scale. |
| Label/Menu | `.type-label-menu` | 12px 500 | Menu items. |
| Label/Default | `.type-label-default` | 11px 600 | Bold small labels on tinted chips. |
| Label/Small | `.type-label-small` | 11px 500 | Soft buttons, title bar status. |
| Body/Small | `.type-body-small` | 12px 400 | Helper text, hints and units. |
| Heading/XSmall | `.type-heading-xsmall` | 13px 600 | Empty state titles. |
| Badge | `.type-badge` | 10px 600 | Badge labels. |

### Shadows

From Figma's `Shadow/*` effect styles. Each layer's colour is a variable, so the theme sets it.

- `--shadow-panel` (resting cards), `--shadow-raised` (hover, dialogs), `--shadow-popover` (tooltips, menus)

### Code-only tokens

What Figma can't hold, from `src/code-tokens.json`.

- **Focus:** `--focus-outline`, `--focus-inset`
- **Motion:** `--ease-out`, `--ease-in-out`, `--ease-pulse`, `--ease-spring`
