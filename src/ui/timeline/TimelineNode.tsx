import { cva, cx } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../foundations/cn'

// A marker column and the content beside it, nudged 5px in so the markers
// aren't flush with the edge. The line to the next node runs from 2px below
// this marker down to the next one; a list's last node drops it, so the line
// ends at the final marker. left: 5px of padding + half the 28px marker, minus
// half the 2px line.
const NODE = cx(
  'relative grid grid-cols-[28px_1fr] gap-(--card-padding) pl-[5px] not-last:pb-[22px]',
  "not-last:before:absolute not-last:before:content-['']",
  'not-last:before:top-[30px] not-last:before:bottom-0 not-last:before:left-[18px] not-last:before:w-2',
  'not-last:before:rounded-[1px] not-last:before:bg-line',
)

// Above the line, so it reads as passing behind the marker.
const markerVariants = cva('z-1 flex size-[28px] shrink-0 items-center justify-center rounded-full', {
  variants: {
    // Any colour but neutral washes the marker in the icon's own colour; neutral
    // is a hollow ring, for something that left.
    isNeutral: {
      true: 'bg-inset text-tertiary shadow-[inset_0_0_0_1.5px_var(--border-default)]',
      false: 'bg-current/(--opacity-tint-md)',
    },
  },
})

// One gap spaces every line, and every line gets the same line box, so the
// visual gap matches the flex gap. Nudged down so the first line's cap height
// lines up with the marker.
const CONTENT = 'flex min-w-0 flex-col gap-4 pt-2 *:leading-[1.3]'

/** A TimelineNode colour: any CSS colour, usually a token (`var(--status-positive)`), or `neutral`. */
export type TimelineNodeColor = 'neutral' | (string & {})

type TimelineNodeProps = Omit<ComponentProps<'li'>, 'color'> & {
  /** The marker's icon, sized by the caller: `<ArrowRightIcon size={15} />`. */
  icon: ReactNode
  /**
   * The icon's colour, washed across the marker: any CSS colour, usually a
   * status token (`var(--status-positive)`). `neutral` is a hollow ring with a
   * tertiary icon, for something quiet that left.
   */
  color: TimelineNodeColor
  /** The event's lines: what happened, then what it happened to. */
  children: ReactNode
}

/**
 * One event on a timeline: a round marker tinted by what happened, its lines
 * beside it, and a line down to the next node. An `<li>`: put nodes in a list.
 */
export function TimelineNode({ icon, color, className, children, ...props }: TimelineNodeProps) {
  const isNeutral = color === 'neutral'
  return (
    <li className={cn(NODE, className)} {...props}>
      <span className={markerVariants({ isNeutral })} style={isNeutral ? undefined : { color }} aria-hidden>
        {icon}
      </span>
      <div className={CONTENT}>{children}</div>
    </li>
  )
}
