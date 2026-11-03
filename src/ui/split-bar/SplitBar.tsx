import { cva } from 'class-variance-authority'

import { cn } from '../utils/cn'

/** `value` as a percentage of `max`, guarding the divide for the all-zero case. */
function percentOf(value: number, max: number): number {
  const scale = max > 0 ? 100 / max : 0
  return value * scale
}

// The width eases so the bars glide in step with the count-up figures beside
// them; the global reduced-motion rule turns it off.
const segmentVariants = cva('h-full transition-[width] duration-400 ease-out', {
  variants: {
    series: { down: 'bg-series-down', up: 'bg-series-up' },
  },
})

type SplitBarProps = {
  /** The download segment's value, in the same unit as `max`. */
  down: number
  /** The upload segment's value, after the download one. */
  up: number
  /** The value a full track stands for. Rows in one list share it, so their bars compare at a glance. */
  max: number
  /** Reads the bar out, since it's an image to screen readers. */
  label: string
  /** Its place in a row: a width (`w-[320px]`) or an inset to line up with an icon (`ml-[3px]`). */
  className?: string
}

/**
 * A 3px track holding a download and an upload segment side by side, each
 * scaled against `max`, for comparing rows' traffic at a glance.
 */
export function SplitBar({ down, up, max, label, className }: SplitBarProps) {
  return (
    <div className={cn('flex h-[3px] overflow-hidden rounded-xs bg-inset', className)} role="img" aria-label={label}>
      <span className={segmentVariants({ series: 'down' })} style={{ width: `${percentOf(down, max)}%` }} />
      <span className={segmentVariants({ series: 'up' })} style={{ width: `${percentOf(up, max)}%` }} />
    </div>
  )
}
