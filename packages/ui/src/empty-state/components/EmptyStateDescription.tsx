import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../utils/cn'

/** A line of explanation under the title, also for extra notes the `actions` add. */
export function EmptyStateDescription({
  className,
  children,
  ...props
}: Omit<ComponentProps<'p'>, 'children'> & {
  /** The note. Give it `role="status"` when it appears in answer to an action, so it's announced. */
  children: ReactNode
}) {
  return (
    <p className={cn('type-body max-w-[34ch] text-tertiary', className)} {...props}>
      {children}
    </p>
  )
}
