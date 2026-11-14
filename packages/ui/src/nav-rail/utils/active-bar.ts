import { cx } from 'class-variance-authority'

// The accent bar's shape, hugging the rail's left edge. BAR_HEIGHT is its
// `h-20` in px, for centring it on an item, and ACTIVE_BAR repeats the shape
// as `before:` classes: change all three together.
export const BAR_SHAPE = 'w-[3px] h-20 rounded-r-full bg-accent'
export const BAR_HEIGHT = 20

// The active item's own bar, for an item on its own. Inside a rail it hides,
// and the rail's single bar slides to it instead.
export const ACTIVE_BAR = cx(
  "before:absolute before:top-1/2 before:-left-12 before:-translate-y-1/2 before:content-['']",
  'before:h-20 before:w-[3px] before:rounded-r-full before:bg-accent',
  '[[data-nav-rail]_&]:before:hidden',
)
