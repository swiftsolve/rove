import { cva } from 'class-variance-authority'
import { cn } from '@/ui'
import { percentOf } from '@/features/apps/utils/transfer'

/** One segment of the bar, coloured by its series. Its width eases as the
 *  values (and the shared max) change, so the bars glide in step with the
 *  count-up figures; the global reduced-motion rule neutralises it. */
const segVariants = cva('h-full transition-[width] duration-400 ease-out', {
  variants: {
    series: { down: 'bg-series-down', up: 'bg-series-up' },
  },
})

interface SplitBarProps {
  down: number
  up: number
  /** The value a full track stands for. Rows in one list share it, so their
   *  bars read comparably at a glance. */
  max: number
  /** Reads the bar out, since it's an image to screen readers. */
  label: string
  className?: string
}

/** One track, a download and an upload segment side by side, each scaled
 *  against `max`; an empty segment collapses to zero width. */
export function SplitBar({ down, up, max, label, className }: SplitBarProps): JSX.Element {
  return (
    <div
      className={cn('flex h-[3px] overflow-hidden rounded-xs bg-inset', className)}
      role="img"
      aria-label={label}
    >
      <span className={segVariants({ series: 'down' })} style={{ width: `${percentOf(down, max)}%` }} />
      <span className={segVariants({ series: 'up' })} style={{ width: `${percentOf(up, max)}%` }} />
    </div>
  )
}
