# Rove design

How to build Rove's interface with these tokens, for anyone writing Rove UI, people and coding agents alike. The [token reference](#token-reference) at the end lists every value; [`docs/rationale.md`](docs/rationale.md) explains why they are what they are.

## Setup

```css
@import '@swiftsolve/rove-tokens/tokens.css';
```

Dark is the default, on `:root`. Add the `theme-light` class to the root element for Light. Every token has both values, so a screen that only uses tokens themes itself.

## Rules

- **Use a token, never a raw value.** No hex colours, no pixel gaps, no font sizes typed by hand. If nothing fits, the design needs a new token in Figma, not a one-off in code.
- **Name by job, not by look.** Pick `--bg-surface` because it's content on the backdrop, not because it's the right grey. The Palette shades (`neutral/850`) aren't CSS variables, on purpose.

### Surfaces

- Three backgrounds: `--bg-base` for the backdrop, `--bg-surface` for content that sits on it (cards, dialogs), `--bg-inset` for areas sunk into a surface (bands, inputs, soft and icon buttons). `--bg-chrome` is the title bar and rail, a half step off the backdrop. `--bg-popover` is a step lighter in Dark, for tooltips and menus. `--bg-hover` is a hovered surface, `--bg-scrim` goes behind dialogs.
- Cards get depth from `--shadow-panel`, not hard outlines. Tooltips and menus use `--shadow-popover` on `--bg-popover`; dialogs and hovered cards use `--shadow-raised`.
- Every line is `--border-default`: hairlines, and the edges of menus, tooltips and dialogs.
- For hovers, chips and tracks on a surface, use the `--fill-*` overlays, by strength: `--fill-faint` (3%), `--fill-subtle` (5%), `--fill-default` (7%), `--fill-strong` (16%). They flip with the theme, so they stay visible on both. A hovered row or expandable header uses `--fill-hover`: 3% white in Dark, 2% ink in Light, so in Light it stays lighter than an open `--bg-inset` panel below it.

### Text and icons

- `--text-primary` for content, `--text-secondary` for supporting lines, `--text-tertiary` for the quietest text and for icons by default.
- On a solid fill (accent or negative), labels and icons use `--text-on-fill`.
- Words in the accent (a link, a highlighted value) use `--text-accent`, on a surface or on `--accent-muted` (a selected item, a tinted button).

### Accent and buttons

- `--accent-default` is for accent icons and lines. It's too light for words in Light mode, and under a white label.
- Solid buttons use `--accent-fill`, hovering to `--accent-fill-hover`. Hovers deepen, never lighten, so the white label keeps its contrast.
- A solid red control (a solid negative button, the window close hover) uses `--status-negative-fill` and `--status-negative-fill-hover`.

### Status

- `--status-*` (positive, good, warning, poor, negative) colour icons, bars and dots.
- Words in a status colour use `--text-*` of the same name, which also clear a tint of their hue (a badge). The `--status-*` shades are too light for text in Light mode.
- Download and upload in charts are `--series-down` and `--series-up`.

### Tints and opacity

Tints are a colour mixed with transparent at one of the shared strengths, so a tinted tile reads the same everywhere:

```css
background: color-mix(in srgb, var(--status-positive) var(--opacity-tint-md), transparent);
```

Disabled controls use `--opacity-disabled`.

### Spacing and shape

- Every gap, padding and margin is a `--spacing-*` step.
- Cards use `--card-padding` on every side. The rail and the content column share the side inset `--spacing-12`.
- Corners are `--radius-*`. `--radius-md` is for nav items and the page-header chip, a step rounder than `--radius-sm`; `--radius-full` makes pills.

### Type

- Set text with a text style's class from `text-styles.css` (`.type-heading-large`), or all four of its `--type-<style>-*` variables, never a font size alone. Each style's use is in [Text styles](#text-styles).
- Numbers that are data (speeds, totals, chart labels) use the Number styles (`number-*`), set in Questrial; everything else is Inter.

### Focus and motion

- Keyboard focus is `outline: var(--focus-outline)` with `outline-offset: var(--focus-offset)`. Rows flush with a card's edge draw it inside instead, with `--focus-inset`.
- Animate with `--ease-out` (or `--ease-in-out`) over `--duration-fast` or `--duration-normal`. A looping pulse uses `--ease-pulse`, which is symmetric, so it fades out and back in alike.

### Icons

- Icons share a 24px grid, a 1.75px stroke and round caps.
- Icons are `--text-tertiary` by default. The active nav item's is `--accent-default`, an icon button's `--text-secondary`, a download icon `--series-down`, a secured or passing one `--status-positive`.
- The brand mark is always `--accent-default`, 22px in the title bar.

## Changing the design

Figma is the source of truth. Change a token in the Rove Design System Figma file, export it with the plugin in `figma-plugin/` into `src/figma/`, then run `npm run build` (see the [README](README.md#update-the-tokens)). Don't edit `tokens.css`, `tokens/` or the values in `src/figma/` by hand. What Figma can't hold (shadows, easing curves, the focus outline) lives in `src/code-tokens.json`.

Everything below the next line is rewritten by `npm run build`; edit only above it.

<!-- Generated by npm run build from the Figma export and tokens.css. Edit above this line. -->

## Token reference

Names and uses, from Figma. The values are in `tokens.css`; Dark and Light differ only in colour and shadow.

### Colour

- **Backgrounds:** `--bg-base` (backdrop), `--bg-surface` (content on the backdrop), `--bg-hover` (hovered rows and buttons), `--bg-scrim` (behind dialogs), `--bg-inset` (sunken areas inside a surface), `--bg-popover` (tooltips and menus), `--bg-chrome` (title bar and rail)
- **Lines:** `--border-default` (hairlines)
- **Fills and overlays:** `--fill-default` (overlay), `--fill-subtle` (light overlay), `--fill-faint` (faintest overlay), `--fill-strong` (strong overlay), `--fill-selection` (text selection), `--fill-hover` (hovered rows and headers)
- **Text:** `--text-primary`, `--text-secondary`, `--text-tertiary` (default icon colour), `--text-accent` (accent words, also on accent/muted), `--text-positive`, `--text-good`, `--text-warning`, `--text-poor`, `--text-negative`, `--text-on-fill` (labels and icons on solid fills)
- **Accent:** `--accent-default`, `--accent-hover`, `--accent-press`, `--accent-muted` (tinted accent background), `--accent-fill` (fill under white labels), `--accent-fill-hover`
- **Status:** `--status-positive`, `--status-good` (between positive and warning), `--status-warning`, `--status-poor` (between warning and negative), `--status-negative`, `--status-negative-fill` (solid negative under white labels), `--status-negative-fill-hover` (negative fill hover)
- **Chart series:** `--series-down` (download), `--series-up` (upload)
- **Focus:** `--focus-ring` (keyboard focus ring)

### Scales

- **Spacing:** `--spacing-<n>`, n in px: 2, 4, 6, 8, 10, 12, 14, 16, 20
- **Radius:** `--radius-xs` 5px, `--radius-sm` 8px, `--radius-md` 10px, `--radius-lg` 13px, `--radius-full` 999px
- **Font sizes:** `--font-size-2xs` 10px, `--font-size-xs` 11px, `--font-size-sm` 12px, `--font-size-md` 13px, `--font-size-lg` 14px, `--font-size-xl` 15px (dialog titles), `--font-size-2xl` 17px, `--font-size-3xl` 28px
- **Font families:** `--font-family-sans` Inter, `--font-family-numeric` Questrial
- **Focus:** `--focus-ring-width` 1px (focus ring stroke), `--focus-offset` 2px (focus ring offset)
- **Opacity:** `--opacity-tint-xs` 8% (faintest tint), `--opacity-tint-sm` 10% (light tint), `--opacity-tint-md` 14% (tint), `--opacity-tint-lg` 22% (strong tint), `--opacity-tint-xl` 28% (strongest tint), `--opacity-high` 80% (nearly opaque), `--opacity-disabled` 40% (disabled controls)
- **Layout:** `--rail-item-size` 38px (rail items), `--titlebar-height` 56px (title bar)
- **Cards:** `--card-padding` `var(--spacing-14)` (card inset), `--card-header-padding-y` `var(--card-padding)`, `--card-header-padding-x` `var(--card-padding)`, `--card-header-min-height` 42px (compact card header), `--card-header-height` 44px (card header), `--card-body-padding` `var(--card-padding)`, `--row-padding-y` 8px (data row, above and below)
- **Font weights:** `--weight-regular` 400, `--weight-medium` 500, `--weight-semibold` 600
- **Motion:** `--duration-fast` 140ms (hovers, small changes), `--duration-normal` 220ms (panels, page changes)

### Text styles

Apply a style with its class from `text-styles.css`. Each class reads four variables, `--type-<style>-size`, `-weight`, `-line-height` and `-letter-spacing`; set all four if you use them directly.

| Style | Class | Size, weight | Use |
| --- | --- | --- | --- |
| Heading/Large | `.type-heading-large` | 17px 600 | Page titles, the wordmark. Code: .type-heading-large |
| Heading/Medium | `.type-heading-medium` | 15px 600 | Dialog titles. Code: .type-heading-medium |
| Heading/Small | `.type-heading-small` | 14px 600 | Card headings. Code: .type-heading-small |
| Body/Default | `.type-body-default` | 13px 400 | Body text. Code: .type-body-default |
| Overline | `.type-overline` | 11px 500 | Uppercase labels above values. Code: .type-overline |
| Caption | `.type-caption` | 11px 400 | Badges, captions, footer hints. Code: .type-caption |
| Label/Large | `.type-label-large` | 12px 600 | Solid button labels. Code: Button variant=solid |
| Number/Display | `.type-number-display` | 28px 400, Questrial | Live speeds. Add a 0.43px outside stroke. Code: .type-number-display .metric-value, at weight 600: Questrial has one weight, so the browser emboldens it. |
| Number/Large | `.type-number-large` | 17px 400, Questrial | Stat totals. Add a 0.26px outside stroke. Code: Readout size=compact |
| Number/Default | `.type-number-default` | 13px 400, Questrial | Data row values. Code: .type-number-default |
| Number/Small | `.type-number-small` | 10px 400, Questrial | Chart axes and scale. Code: .type-number-small |
| Label/Default | `.type-label-default` | 11px 600 | Bold small labels on tinted chips. Code: .type-label-default |
| Label/Small | `.type-label-small` | 11px 500 | Soft buttons, title bar status. Code: .type-label-small |
| Body/Small | `.type-body-small` | 12px 400 | Helper text, hints and units. Code: .type-body-small |

### Code-only tokens

What Figma variables can't hold, from `src/code-tokens.json`.

- **Shadows:** `--shadow-panel`, `--shadow-raised`, `--shadow-popover`
- **Focus:** `--focus-outline`, `--focus-inset`
- **Motion:** `--ease-out`, `--ease-in-out`, `--ease-pulse`
