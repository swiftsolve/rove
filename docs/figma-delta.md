# Figma delta

What the Rove Design System in Figma needs to pick up from the component
library refactor (`refactor/ui-library`). One entry per change: before → after.
The Figma pass works through this list and deletes the file when it's done.

## Components

### Button

- **Properties.** `Variant: Filled | Danger | Secondary` → three properties:
  - `variant`: `solid | soft | ghost | link`
  - `tone`: `accent | neutral | negative`
  - `size`: `sm | md | inherit`
- **Mapping.**
  - Filled → solid, accent, md
  - Danger → solid, negative, md
  - Secondary → soft, neutral, sm
- **Combinations the app already used but Figma doesn't have yet:**
  - soft md: a dialog's Cancel, sized to sit level with the main action
  - soft negative: the error banner's Retry
  - ghost negative: the error banner's Dismiss
- **Allowed pairs** (anything else isn't designed):
  - solid × accent or negative
  - soft × neutral or negative
  - ghost × neutral or negative
  - link × neutral
- **New `link` variant**, the quiet text link with glyphs ("View timeline",
  "All Results", "All hosts"):
  - `inherit` size: in a line of text, the pill's padding hanging outside
  - `sm` size: on its own line, xs text, no pill (the Capabilities footer)
- **Motion.** The press nudge now eases on soft and ghost buttons as it already
  did on solid ones; Secondary used to snap.

### Icon button

- `Variant: Secondary | Plain` → `soft | ghost`.
- Ghost now has its own colour: secondary text, hover fill and primary text.
  That's what a dialog's close button already looked like.

### Menu (new, replaces three hand-built overflow menus)

- **Parts:** a kebab trigger (30px, tertiary until hovered or open), a dropdown
  (112px min, 4px padding, 2px gap) and items (14px glyph, sm medium text).
  The `negative` item tone gives red text on a red tint.
- **Timeline aligned.** The Services timeline's menu now matches the other two:
  - its kebab is tertiary, not secondary;
  - the dropdown is 112px wide, not 148px;
  - items are medium weight;
  - it animates in.

### Text field (new)

- **Parts:** an overline label; a 38px input on the inset fill, with an accent
  border on focus and a negative one when invalid; and an optional action
  inside the border.
- **The action** (Test) is a 30px accent-muted button that collapses to a
  square spinner while loading.
- **Feedback line** under the field.
- These are the add-service dialog's fields, now a component.

### Segmented control (new in the library)

- Settings' theme picker as a component: an inset track with 2px segments,
  the checked one lit with the accent.

### Badge (was CardBadge) and Live badge

- **Badge:** CardBadge becomes a general Badge with a `tone` (positive,
  warning, negative), the same tinted uppercase pill. VPN uses warning.
- **Live badge:** now draws its dot with Status dot (`pulse: live`).

### Status dot (new)

- **5px dot** in the current text colour.
- **`pulse`** is one of three speeds:
  - `calm` (2.4s): the title bar's connection status
  - `live` (2s): the Live badge
  - `busy` (1.6s): a device scan
- These were three unnamed speeds before.

### Loading state (new)

- **The first-load block:** a spinner over a muted line, centred in the page.
- **Seven pages** built it by hand before.

### Icon tile (new)

- **The tinted glyph square** used by device rows, interfaces, the connection
  strip and capability details.
- **`size`:** sm 30, md 32, lg 36.
- **`tint`:** a wash of the glyph's own colour (`xs`, `sm` or `md` tint
  opacity), or `inset` (neutral fill, secondary glyph).
- **Colour** comes from what the item is: Wi‑Fi blue, Ethernet green, a
  capability level.

### Bar meter (new)

- **One component** for the capability meter and Wi‑Fi signal bars, which were
  built separately: four rising bars, lit or unlit (a tint of the colour), or
  dimmed greys.
- **Sizes:**

  | Size | Bar width | Heights | Where |
  | --- | --- | --- | --- |
  | xs | 2px | 3–9 | Home strip |
  | sm | 2px | 4–10 | Signal row |
  | md | 3px | 5–11 | Beside a title |
  | lg | 3px | 6–12 | Capability list |

### Readout (Readout/Large, Readout/Compact)

- No visual change. In code, one component now covers both: `Readout` is the
  labelled large figure and `ReadoutValue` the bare figure at large or compact
  size. Usage's byte totals use it too.

### Link (new)

- An accent text link for running text: no underline until hover or focus.
  Used for the About page's source link.

## Open questions

- **Devices card "Discover" button.** It has tighter sides than soft sm
  (4px gap, 8px padding). Should it be a size, or match soft sm?
