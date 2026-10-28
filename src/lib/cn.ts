import { cx } from 'class-variance-authority'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge must know the theme's names (src/styles/tailwind.css), or it
// can't tell a font size from a colour: `text-md` and `text-secondary` would
// look like two text colours, and it would drop one. `npm run lint` checks
// these lists against the theme (scripts/check-cn-theme.mjs).
const SPACING = ['0', 'px', '2', '4', '6', '8', '10', '11', '12', '14', '16', '20']
// The Figma text styles, as `leading-*` and `tracking-*` names.
const TYPE_STYLES = [
  'title', 'section-title', 'dialog-title', 'field-label', 'body', 'meta', 'meta-strong',
  'hint', 'small', 'value', 'chart-label', 'metric-display', 'metric-compact', 'metric-unit',
  'button-large', 'button-default', 'button-secondary',
]
const FONT_SIZES = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl']
const COLORS = [
  // Tailwind's built-ins, which exist alongside the theme's colours.
  'transparent', 'current', 'inherit',
  'app', 'chrome', 'shell', 'panel', 'raised', 'inset', 'hover', 'scrim',
  'primary', 'secondary', 'tertiary', 'accent-text', 'on-fill',
  'positive', 'good', 'warning', 'poor', 'negative',
  'line', 'line-strong', 'hairline-top',
  'accent', 'accent-hover', 'accent-press', 'accent-muted', 'accent-fill', 'accent-fill-hover',
  'status-positive', 'status-good', 'status-warning', 'status-poor', 'status-negative',
  'status-negative-fill', 'status-negative-fill-hover',
  'series-down', 'series-up',
  'fill-chip', 'fill-nav-hover', 'fill-row-hover', 'fill-track', 'fill-track-lit',
  'fill-scrollbar', 'fill-selection', 'window-close-hover',
]

const mergeClasses = extendTailwindMerge({
  override: {
    theme: {
      spacing: SPACING,
      text: FONT_SIZES,
      color: COLORS,
      font: ['sans', 'numeric'],
      'font-weight': ['regular', 'medium', 'semibold'],
      leading: TYPE_STYLES,
      tracking: TYPE_STYLES,
      radius: ['xs', 'sm', 'md', 'lg', 'full'],
      shadow: ['panel', 'raised'],
      ease: ['out', 'in-out'],
      animate: ['overlay-in', 'dialog-in', 'fade-in', 'menu-in', 'scan-slide-in', 'scan-slide-out', 'wavy-scroll'],
    },
  },
})

/**
 * Join class names, skipping falsy ones, and let later Tailwind utilities win
 * over earlier ones that set the same thing: `cn('px-12', className)` with
 * `className="px-8"` gives `px-8`. Use it wherever a component merges its own
 * classes with a `className` from outside; plain joins can use `cx`.
 */
export function cn(...classNames: Parameters<typeof cx>): string {
  return mergeClasses(cx(...classNames))
}
