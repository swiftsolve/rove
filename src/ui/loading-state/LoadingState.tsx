import type { ComponentProps } from 'react'

import { cn } from '../foundations/cn'
import { Spinner } from '../spinner/Spinner'

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
      <p className="type-body-default text-tertiary">{label}</p>
    </div>
  )
}
