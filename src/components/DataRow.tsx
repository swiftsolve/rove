import { createContext, useContext, type ReactNode } from 'react'
import './DataRow.css'

// True inside a DataList, where each row's label and value are a <dt>/<dd> pair.
const DataListContext = createContext(false)

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
      <div className="data-row">
        <dt className="field-label">{label}</dt>
        <dd className="text-value num">{children ?? value}</dd>
      </div>
    )
  }

  return (
    <div className="data-row">
      <span className="field-label">{label}</span>
      <span className="text-value num">{children ?? value}</span>
    </div>
  )
}
