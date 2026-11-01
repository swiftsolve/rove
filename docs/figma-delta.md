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

### Link (new)

- An accent text link for running text: no underline until hover or focus.
  Used for the About page's source link.

## Open questions

- **Devices card "Discover" button.** It has tighter sides than soft sm
  (4px gap, 8px padding). Should it be a size, or match soft sm?
