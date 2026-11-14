import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../utils/cn'
import { moveFocusBetweenRows } from '../../utils/row-arrow-keys'

type CardListProps = Omit<ComponentProps<'ul'>, 'aria-label' | 'children'> & {
  /** Names the list. */
  label: string
  /** The rows, as `<li>`s. They own their padding, so the hairlines run edge to edge. */
  children?: ReactNode
}

/**
 * A list that is one card, with a hairline between its rows. Up and Down move
 * focus between the rows' controls, and Home and End to the ends; Tab still
 * stops on each.
 */
export function CardList({ label, className, onKeyDown, ...props }: CardListProps) {
  return (
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- handles its rows' arrow keys; the list itself never takes focus
    <ul
      // Safari drops a list's role when its markers are styled away.
      role="list"
      aria-label={label}
      className={cn('divide-y divide-line-subtle overflow-hidden surface contain-content', className)}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        moveFocusBetweenRows(event)
      }}
      {...props}
    />
  )
}
