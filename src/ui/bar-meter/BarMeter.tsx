import { cva, cx } from 'class-variance-authority'
import { cn } from '../foundations/cn'

// Each size's bar width and the four heights, shortest first. Whole pixels, or
// the thin bars blur across subpixel boundaries and read fuzzy; the ends round
// at half the width.
const SIZES = {
  /** The Home capability strip. */
  xs: { width: 'w-2', heights: ['h-[3px]', 'h-[5px]', 'h-[7px]', 'h-[9px]'] },
  /** A data row: the tallest rounds the 13px value text's cap height up. */
  sm: { width: 'w-2', heights: ['h-4', 'h-6', 'h-8', 'h-10'] },
  /** Beside a title. */
  md: { width: 'w-[3px]', heights: ['h-[5px]', 'h-[7px]', 'h-[9px]', 'h-[11px]'] },
  /** A list row's rating. */
  lg: { width: 'w-[3px]', heights: ['h-6', 'h-8', 'h-10', 'h-12'] },
}

const barVariants = cva('rounded-full', {
  variants: {
    fill: {
      lit: 'bg-current',
      // A faded tint of the colour, so the meter reads as one monochrome unit
      // rather than colour on grey.
      unlit: 'bg-current/(--opacity-tint-lg)',
      // Dark, dim greys set directly, not tinted from the colour.
      dimmed: 'bg-fill-default',
      dimmedLit: 'bg-fill-strong',
    },
  },
})

type BarMeterProps = {
  /** Lit bars, 0 to 4. */
  value: number
  /** `xs` for the Home capability strip, `sm` a data row, `md` beside a title, `lg` a list row. */
  size?: keyof typeof SIZES
  /** The bars' colour: any CSS colour, usually a status token (`var(--status-positive)`). */
  color?: string
  /** Grey bars that read as inactive: a stale rating waiting on a new test. */
  isDimmed?: boolean
  /** The meter's place in its row. */
  className?: string
}

/**
 * Four rising bars, some lit: signal strength or a rating at a glance. Visual
 * only; whatever it sits in says the value in words or with role="meter".
 */
export function BarMeter({ value, size = 'lg', color = 'currentColor', isDimmed = false, className }: BarMeterProps) {
  const { width, heights } = SIZES[size]
  return (
    <span className={cn('inline-flex items-end gap-2', heights[3], className)} style={{ color }} aria-hidden>
      {heights.map((height, i) => {
        const isLit = i < value
        const fill = isDimmed ? (isLit ? 'dimmedLit' : 'dimmed') : isLit ? 'lit' : 'unlit'
        return <span key={height} className={cx(barVariants({ fill }), width, height)} />
      })}
    </span>
  )
}
