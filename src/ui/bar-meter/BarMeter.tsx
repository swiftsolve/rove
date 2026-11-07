import { cva } from 'class-variance-authority'

import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio'
import { cn } from '../utils/cn'
import type { VariantOf } from '../utils/variants'

// Each size's bar width and the four heights, shortest first, in CSS px. At
// 125% or 150% display scaling these fall between screen pixels, and HTML
// boxes snap each bar to 3 or 4, so the meter looked jagged: BarMeter rounds
// them to screen pixels and draws an SVG. The ends round at half the width.
const SIZES = {
  /** A data row: the tallest rounds the 11px value text's cap height up. */
  sm: { width: 2, heights: [2, 4, 6, 8] },
  /** A list row's rating. */
  lg: { width: 3, heights: [6, 8, 10, 12] },
} as const satisfies Record<string, { width: number; heights: readonly [number, number, number, number] }>
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
  /** `sm` for a data row or meta line, `lg` a list row. */
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
  const ratio = useDevicePixelRatio()
  // Drawn in whole screen pixels, then scaled back, so every bar is the same
  // number of pixels wide and none lands between two.
  const toScreen = (px: number): number => Math.max(1, Math.round(px * ratio))
  const width = toScreen(SIZES[size].width)
  const gap = toScreen(GAP)
  const heights = SIZES[size].heights.map(toScreen)
  const tallest = Math.max(...heights)
  const span = heights.length * width + (heights.length - 1) * gap
  return (
    <svg
      className={cn('inline-block shrink-0', className)}
      width={span / ratio}
      height={tallest / ratio}
      viewBox={`0 0 ${span} ${tallest}`}
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
