import { cva } from 'class-variance-authority'

import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio'
import { cn } from '../utils/cn'
import type { VariantOf } from '../utils/variants'

// The bar width and the four heights, shortest first, in CSS px: the tallest
// rounds a 12px line's cap height up, so the meter sits in a data row's text.
// At 125% or 150% display scaling these fall between screen pixels, and HTML
// boxes snap each bar to 3 or 4, so the meter looked jagged: BarMeter rounds
// them to screen pixels and draws an SVG. The ends round at half the width.
const BAR_WIDTH = 2
const BAR_HEIGHTS = [3, 5, 7, 9] as const
// The gap between bars, --spacing-2.
const GAP = 2

const barVariants = cva(null, {
  variants: {
    fill: {
      lit: 'fill-current',
      // A faded tint of the colour, so the meter reads as one monochrome unit
      // rather than colour on grey.
      unlit: 'fill-current/(--opacity-tint-lg)',
      // Dark, dim greys set directly, not tinted from the colour.
      dimmed: 'fill-overlay-default',
      dimmedLit: 'fill-overlay-strong',
    },
  },
})

type BarFill = VariantOf<typeof barVariants, 'fill'>

function barFill(isLit: boolean, isDimmed: boolean): BarFill {
  if (isDimmed) return isLit ? 'dimmedLit' : 'dimmed'
  return isLit ? 'lit' : 'unlit'
}

type BarMeterProps = {
  /** Lit bars, 0 to 4. */
  value: number
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
export function BarMeter({ value, color = 'currentColor', isDimmed = false, className }: BarMeterProps) {
  const pixelRatio = useDevicePixelRatio()
  // Drawn in whole screen pixels, then scaled back, so every bar is the same
  // number of pixels wide and none lands between two.
  const toScreen = (px: number): number => Math.max(1, Math.round(px * pixelRatio))
  const width = toScreen(BAR_WIDTH)
  const gap = toScreen(GAP)
  const heights = BAR_HEIGHTS.map(toScreen)
  const tallest = Math.max(...heights)
  const meterWidth = heights.length * width + (heights.length - 1) * gap
  return (
    <svg
      className={cn('inline-block shrink-0', className)}
      width={meterWidth / pixelRatio}
      height={tallest / pixelRatio}
      viewBox={`0 0 ${meterWidth} ${tallest}`}
      style={{ color }}
      aria-hidden
    >
      {heights.map((height, i) => (
        <rect
          // A fixed set of four that never reorders.
          key={i}
          className={barVariants({ fill: barFill(i < value, isDimmed) })}
          x={i * (width + gap)}
          y={tallest - height}
          width={width}
          height={height}
          rx={width / 2}
        />
      ))}
    </svg>
  )
}
