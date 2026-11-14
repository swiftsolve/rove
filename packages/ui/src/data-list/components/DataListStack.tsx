import type { ReactNode } from 'react'

import { cn } from '../../utils/cn'

/**
 * DataLists grouped by topic, one after another: a hairline between groups,
 * with 12px of air either side of it. The hairline runs end to end, so place
 * the stack flush to the card's sides (`CardBody layout="flush"`); each
 * group carries the side inset itself.
 */
export function DataListStack({
  className,
  children,
}: {
  /** Its place in a layout: space above it (`mt-12`). */
  className?: string
  /** The DataLists, one per topic. */
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'divide-y divide-line-subtle [&>dl]:px-(--card-body-padding)',
        '[&>dl:not(:first-child)]:pt-12 [&>dl:not(:last-child)]:pb-12',
        className,
      )}
    >
      {children}
    </div>
  )
}
