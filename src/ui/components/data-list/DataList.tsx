import type { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../foundations/cn'

// The air between rows, set on the list as a variable its rows read, so it
// reaches rows rendered by another component: 8px, or 6px and 4px for a short
// or repeated list.
const listVariants = cva('', {
  variants: {
    density: {
      default: '[--data-row-py:var(--row-padding-y)]',
      snug: '[--data-row-py:var(--spacing-6)]',
      compact: '[--data-row-py:var(--spacing-4)]',
    },
  },
  defaultVariants: { density: 'default' },
})

// Label left, value right. The first row sits flush to the top of its
// container and the last to the bottom, so `py` only sets the gap between rows.
const rowVariants = cva('flex justify-between gap-16 py-(--data-row-py) first:pt-0 last:pb-0', {
  variants: {
    /** `center` for a value with no text baseline of its own (signal bars, a badge). */
    align: { baseline: 'items-baseline', center: 'items-center' },
  },
  defaultVariants: { align: 'baseline' },
})

const LABEL = 'text-overline shrink-0'
const VALUE = 'text-number num text-right'

interface DataListProps extends VariantProps<typeof listVariants> {
  className?: string
  /** DataRows, as direct children (fragments are fine). */
  children: ReactNode
}

/**
 * A `<dl>` of DataRows: each row is a `<div>` holding a `<dt>` label and a
 * `<dd>` value, so the pairs read as a description list.
 */
export function DataList({ className, density, children }: DataListProps): JSX.Element {
  return <dl className={cn(listVariants({ density }), className)}>{children}</dl>
}

interface DataRowProps extends VariantProps<typeof rowVariants> {
  label: ReactNode
  value?: string | null
  children?: ReactNode
}

/** One label and value. Render it in a DataList, which sets its spacing. */
export function DataRow({ label, value, children, align }: DataRowProps): JSX.Element | null {
  if (value == null && !children) return null
  return (
    <div className={rowVariants({ align })}>
      <dt className={LABEL}>{label}</dt>
      <dd className={VALUE}>{children ?? value}</dd>
    </div>
  )
}

/**
 * DataLists grouped by topic, one after another: a hairline between groups,
 * with 12px of air either side of it.
 */
export function DataListStack({ className, children }: { className?: string; children: ReactNode }): JSX.Element {
  return (
    <div className={cn('divide-y divide-line [&>dl:not(:first-child)]:pt-12 [&>dl:not(:last-child)]:pb-12', className)}>
      {children}
    </div>
  )
}
