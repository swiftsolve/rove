import { cx } from 'class-variance-authority'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge must know the theme's names (src/styles/tailwind.css), or it
// can't tell a font size from a colour: `text-md` and `text-secondary` would
// look like two text colours, and it would drop one. `npm run lint` checks
// these lists against the theme (scripts/checks/cn-theme.mjs).
const SPACING = ['0', 'px', '2', '4', '6', '8', '10', '12', '14', '16', '20']
// The Figma text styles, as `leading-*` and `tracking-*` names.
const TYPE_STYLES = [
  'heading-large',
  'heading-medium',
  'heading-small',
  'body-default',
  'body-small',
  'caption',
  'label-large',
  'label-default',
  'label-small',
  'overline',
  'number-display',
  'number-large',
  'number-default',
  'number-small',
]
// The text style classes from rove-tokens' text-styles.css. Each sets the font,
// size, weight, line height and letter spacing, so a later one replaces an
// earlier one, and anything they set before it.
const TEXT_STYLE_CLASSES = [
  'type-heading-large',
  'type-heading-medium',
  'type-heading-small',
  'type-heading-xsmall',
  'type-body-default',
  'type-body-small',
  'type-caption',
  'type-overline',
  'type-badge',
  'type-label-large',
  'type-label-default',
  'type-label-small',
  'type-label-menu',
  'type-number-display',
  'type-number-large',
  'type-number-default',
  'type-number-small',
]
const FONT_SIZES = ['2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']
const COLORS = [
  // Tailwind's built-ins, which exist alongside the theme's colours.
  'transparent',
  'current',
  'inherit',
  'base',
  'chrome',
  'surface',
  'popover',
  'inset',
  'hover',
  'scrim',
  'primary',
  'secondary',
  'tertiary',
  'accent-text',
  'on-solid',
  'positive',
  'good',
  'warning',
  'poor',
  'negative',
  'line',
  'accent',
  'accent-hover',
  'accent-press',
  'accent-muted',
  'accent-solid',
  'accent-solid-hover',
  'status-positive',
  'status-good',
  'status-warning',
  'status-poor',
  'status-negative',
  'status-negative-solid',
  'status-negative-solid-hover',
  'series-down',
  'series-up',
  'overlay-faint',
  'overlay-subtle',
  'overlay-default',
  'overlay-hover',
  'overlay-strong',
  'overlay-selection',
]

const mergeClasses = extendTailwindMerge<'text-style'>({
  extend: {
    classGroups: { 'text-style': TEXT_STYLE_CLASSES },
    // One way only: `cn('type-caption', 'font-semibold')` keeps both, and the
    // weight wins, as the utilities layer beats text-styles.css's components.
    conflictingClassGroups: { 'text-style': ['font-size', 'font-family', 'font-weight', 'leading', 'tracking'] },
  },
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
      shadow: ['panel', 'raised', 'popover'],
      ease: ['out', 'in-out', 'spring'],
      animate: [
        'overlay-in',
        'dialog-in',
        'overlay-out',
        'dialog-out',
        'fade-in',
        'menu-in',
        'pulse-calm',
        'pulse-live',
        'pulse-busy',
        'ring-rotate',
        'ring-stretch',
        'scan-slide-in',
        'scan-slide-out',
        'wavy-scroll',
      ],
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
