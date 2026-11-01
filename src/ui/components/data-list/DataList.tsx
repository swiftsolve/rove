import { createContext, useContext, type ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../foundations/cn'

// Label left, value right. The first row sits flush to the top of its
// container and the last to the bottom, so `py` only sets the gap between rows.
const rowVariants = cva('flex justify-between gap-16 first:pt-0 last:pb-0', {
  variants: {
    /** The air between rows: 8px, or 6px and 4px for a short or repeated list. */
    density: { default: 'py-(--row-padding-y)', snug: 'py-6', compact: 'py-4' },
    /** `center` for a value with no text baseline of its own (signal bars, a badge). */
    align: { baseline: 'items-baseline', center: 'items-center' },
  },
  defaultVariants: { density: 'default', align: 'baseline' },
})

type DataListDensity = NonNullable<VariantProps<typeof rowVariants>['density']>

// Inside a DataList: its density, and each row's label and value become a
// <dt>/<dd> pair. Null outside one.
const DataListContext = createContext<DataListDensity | null>(null)

const LABEL = 'text-overline shrink-0'
const VALUE = 'text-number num text-right'

interface DataListProps {
  className?: string
  density?: DataListDensity
  /** DataRows, as direct children (fragments are fine). */
  children: ReactNode
}

/**
 * A `<dl>` of DataRows: each row becomes a `<div>` holding a `<dt>` label and a
 * `<dd>` value, so the pairs read as a description list. Looks the same as a
 * plain container of rows.
 */
export function DataList({ className, density = 'default', children }: DataListProps): JSX.Element {
  return (
    <dl className={className}>
      <DataListContext.Provider value={density}>{children}</DataListContext.Provider>
    </dl>
  )
}

interface DataRowProps {
  label: ReactNode
  value?: string | null
  children?: ReactNode
  align?: VariantProps<typeof rowVariants>['align']
}

export function DataRow({ label, value, children, align }: DataRowProps): JSX.Element | null {
  const listDensity = useContext(DataListContext)
  if (value == null && !children) return null
  const rowClassName = rowVariants({ density: listDensity ?? 'default', align })

  if (listDensity != null) {
    return (
      <div className={rowClassName}>
        <dt className={LABEL}>{label}</dt>
        <dd className={VALUE}>{children ?? value}</dd>
      </div>
    )
  }

  return (
    <div className={rowClassName}>
      <span className={LABEL}>{label}</span>
      <span className={VALUE}>{children ?? value}</span>
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
