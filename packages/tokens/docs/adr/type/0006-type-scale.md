---
status: accepted
date: 2026-11-07
---

# Nine text styles, two text sizes, line heights on a 4px grid

The scale had grown to seventeen styles, five line heights and three heading
sizes 1px apart, with number styles that copied text ones once both used one
face. We cut it to nine (Display, Title, Stat, Heading, Body, Body/Medium,
Body/SemiBold, Caption, Badge): text is 12px, meta 11px, and every line
height a multiple of 4px, except a figure's, which is its own size (Display
28/28, Stat 17/20) since it never wraps.

## Considered options

- **Body at 13px with meta at 11px,** a clearer 2px step. Rows grow taller,
  so we kept 12 and dropped 13 to keep the window compact.
- **Keeping 13px beside 12 and 11.** Three sizes 1px apart read as mistakes
  rather than levels.

## Consequences

- **Weight, not size, separates labels from text** at 12px: Body/Medium for
  labels and menus, Body/SemiBold for buttons and chips.
- **Line heights decide screen heights.** Taller figure lines once pushed
  Rove's Home past its window, which opens at Home's height, so a
  line-height change can move that number too.
