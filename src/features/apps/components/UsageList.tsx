import { forwardRef, type ReactNode } from 'react'
import { Card } from '@/ui'

interface UsageListProps {
  /** Accessible name for the list, e.g. "Apps by usage". */
  label: string
  /** The rows, as `<li>`s. */
  children: ReactNode
}

/**
 * The card the usage views list their rows in. The rows own the inset, so the
 * hairlines between them run edge to edge, clipped to the card's rounded corners.
 */
export const UsageList = forwardRef<HTMLUListElement, UsageListProps>(function UsageList(
  { label, children },
  ref,
) {
  return (
    <Card as="div">
      <ul
        ref={ref}
        role="list"
        aria-label={label}
        className="flex flex-col [&>li+li]:border-t [&>li+li]:border-t-line"
      >
        {children}
      </ul>
    </Card>
  )
})
