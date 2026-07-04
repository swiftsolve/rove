import type { ReactNode } from 'react'
import './DataRow.css'

interface DataRowProps {
  readonly label: string
  readonly value?: string | null
  readonly children?: ReactNode
}

export default function DataRow({ label, value, children }: DataRowProps): JSX.Element | null {
  if (value == null && !children) return null

  return (
    <div className="data-row">
      <span className="field-label">{label}</span>
      <span className="text-value num">{children ?? value}</span>
    </div>
  )
}
