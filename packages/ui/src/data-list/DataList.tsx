import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { cn } from '../utils/cn'
import type { VariantOf } from '../utils/variants'

/**
 * The air between rows, set on the list as a variable its rows read, so it
 * reaches rows rendered by another component: 8px, or 4px for a short or
 * repeated list.
 */
const listVariants = cva(null, {
  variants: {
    density: {
      default: '[--data-row-py:var(--row-padding-y)]',
      compact: '[--data-row-py:var(--spacing-4)]',
    },
  },
  defaultVariants: { density: 'default' },
})

type DataListProps = {
  /** The air between rows: `default` 8px, `compact` 4px for a short or repeated list. */
  density?: VariantOf<typeof listVariants, 'density'>
  /** Its place in a layout: space above it (`mt-12`). */
  className?: string
  /** DataRows, as direct children (fragments are fine). */
  children: ReactNode
}

/**
 * A `<dl>` of DataRows: each row is a `<div>` holding a `<dt>` label and a
 * `<dd>` value, so the pairs read as a description list.
 */
export function DataList({ className, density = 'default', children }: DataListProps) {
  return <dl className={cn(listVariants({ density }), className)}>{children}</dl>
}
