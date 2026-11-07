import type { ComponentProps } from 'react'

import { Spinner } from '../spinner/Spinner'
import { cn } from '../utils/cn'

type LoadingStateProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** What's loading, as a sentence that ends in an ellipsis: "Loading usage…". */
  label: string
}

/**
 * A page's first load: the spinner over a line saying what's coming, centred
 * in the content area. A status region, so the line is announced.
 */
export function LoadingState({ label, className, ...props }: LoadingStateProps) {
  return (
    <div className={cn('page-empty', className)} role="status" {...props}>
      <Spinner />
      <p className="type-body text-tertiary">{label}</p>
    </div>
  )
}
