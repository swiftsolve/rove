import { cx } from 'class-variance-authority'
import { extendTailwindMerge } from 'tailwind-merge'

import { tailwindThemeNames, textStyleClasses } from './cn-theme.gen.json'

/**
 * tailwind-merge must know the theme's names, or it can't tell a font size
 * from a colour: `text-sm` and `text-secondary` would look like two text
 * colours, and it would drop one. `pnpm gen` writes them from the theme
 * (src/styles/tailwind.css) and rove-tokens' text-styles.css.
 */
const mergeClasses = extendTailwindMerge<'text-style'>({
  extend: {
    classGroups: { 'text-style': textStyleClasses },
    // One way only: `cn('type-caption', 'font-semibold')` keeps both, and the
    // weight wins, as the utilities layer beats text-styles.css's components.
    conflictingClassGroups: { 'text-style': ['font-size', 'font-family', 'font-weight', 'leading', 'tracking'] },
  },
  override: { theme: tailwindThemeNames },
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
