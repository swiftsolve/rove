import { createContext, useContext, type ReactNode } from 'react'
import { cx } from 'class-variance-authority'

// True inside a DataList, where each row's label and value are a <dt>/<dd> pair.
const DataListContext = createContext(false)

// Label left, value right, on a shared baseline. The first row sits flush to
// the top of its container and the last to the bottom. `data-row` is a marker
// views target to change the rhythm (`[&_.data-row:not(:first-child)]:pt-4`).
const ROW = cx(
  'data-row flex items-baseline justify-between gap-16',
  'py-(--row-padding-y) first:pt-0 last:pb-0',
)
const LABEL = 'field-label shrink-0'
const VALUE = 'text-value num text-right'

interface DataListProps {
  className?: string
  /** DataRows, as direct children (fragments are fine). */
  children: ReactNode
}

/**
 * A `<dl>` of DataRows: each row becomes a `<div>` holding a `<dt>` label and a
 * `<dd>` value, so the pairs read as a description list. Looks the same as a
 * plain container of rows.
 */
export function DataList({ className, children }: DataListProps): JSX.Element {
  return (
    <dl className={className}>
      <DataListContext.Provider value={true}>{children}</DataListContext.Provider>
    </dl>
  )
}

interface DataRowProps {
  label: ReactNode
  value?: string | null
  children?: ReactNode
}

export function DataRow({ label, value, children }: DataRowProps): JSX.Element | null {
  const isInDataList = useContext(DataListContext)
  if (value == null && !children) return null

  if (isInDataList) {
    return (
      <div className={ROW}>
        <dt className={LABEL}>{label}</dt>
        <dd className={VALUE}>{children ?? value}</dd>
      </div>
    )
  }

  return (
    <div className={ROW}>
      <span className={LABEL}>{label}</span>
      <span className={VALUE}>{children ?? value}</span>
    </div>
  )
}
