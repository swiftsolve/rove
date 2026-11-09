import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../utils/cn'

type CardListProps = Omit<ComponentProps<'ul'>, 'aria-label' | 'children'> & {
  /** Names the list. */
  label: string
  /** The rows, as `<li>`s. They own their padding, so the hairlines run edge to edge. */
  children?: ReactNode
}

/** A list that is one card, with a hairline between its rows. */
export function CardList({ label, className, ...props }: CardListProps) {
  return (
    <ul
      // Safari drops a list's role when its markers are styled away.
      role="list"
      aria-label={label}
      className={cn('divide-y divide-line-subtle overflow-hidden surface contain-content', className)}
      {...props}
    />
  )
}
