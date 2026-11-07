import { cva } from 'class-variance-authority'
import type { JSX, ReactNode } from 'react'

import { cn } from '../utils/cn'
import type { VariantOf } from '../utils/variants'

// The air between rows, set on the list as a variable its rows read, so it
// reaches rows rendered by another component: 8px, or 4px for a short or
// repeated list.
const listVariants = cva(null, {
  variants: {
    density: {
      default: '[--data-row-py:var(--row-padding-y)]',
      compact: '[--data-row-py:var(--spacing-4)]',
    },
  },
  defaultVariants: { density: 'default' },
})

// Label left, value right. The first row sits flush to the top of its
// container and the last to the bottom, so `py` only sets the gap between rows.
const rowVariants = cva('flex justify-between gap-16 py-(--data-row-py) first:pt-0 last:pb-0', {
  variants: {
    align: { baseline: 'items-baseline', center: 'items-center' },
  },
  defaultVariants: { align: 'baseline' },
})

const LABEL = 'type-body-medium text-tertiary shrink-0'
const VALUE = 'type-body text-primary num text-right'

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

type DataRowProps = {
  /** `center` for a value with no text baseline of its own (signal bars, a badge). */
  align?: VariantOf<typeof rowVariants, 'align'>
  /** What the value is: "Gateway". */
  label: ReactNode
  /** The value as text. With no value and no children, the row isn't drawn. */
  value?: string | null
  /** A value that isn't plain text (a badge, signal bars), in `value`'s place. */
  children?: ReactNode
}

/** One label and value. Render it in a DataList, which sets its spacing. */
export function DataRow({ label, value, children, align = 'baseline' }: DataRowProps): JSX.Element | null {
  // `== null`, not falsy: a 0 is a value to show.
  if (value == null && children == null) return null
  return (
    <div className={rowVariants({ align })}>
      <dt className={LABEL}>{label}</dt>
      <dd className={VALUE}>{children ?? value}</dd>
    </div>
  )
}

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
        'divide-y divide-line [&>dl]:px-(--card-body-padding)',
        '[&>dl:not(:first-child)]:pt-12 [&>dl:not(:last-child)]:pb-12',
        className,
      )}
    >
      {children}
    </div>
  )
}
