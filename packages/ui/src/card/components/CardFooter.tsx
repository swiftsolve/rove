import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../utils/cn'

type CardFooterProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** The footnote or status. */
  children: ReactNode
}

/** A sunken band below the body, flush to the card's edges: a footnote or status. */
export function CardFooter({ className, children, ...props }: CardFooterProps) {
  return (
    <div className={cn('bg-inset px-(--card-body-padding) py-12', className)} data-card-footer="" {...props}>
      {children}
    </div>
  )
}
