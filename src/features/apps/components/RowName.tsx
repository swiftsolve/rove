import type { ReactNode } from 'react'

type RowNameProps = {
  /** What leads the name: an icon, or a disclosure chevron and an icon. */
  icon: ReactNode
  name: string
  /** What follows the name, such as a count. */
  children?: ReactNode
}

/** A row's leading cell: its icon and name, the name truncating as the row
 *  narrows. */
export function RowName({ icon, name, children }: RowNameProps) {
  return (
    <span className="inline-flex min-w-0 items-center gap-8">
      {icon}
      {/* Long names (e.g. macOS bundle identifiers) truncate rather than wrap,
          keeping the main line one row tall. */}
      <span className="truncate text-sm text-primary" title={name}>
        {name}
      </span>
      {children}
    </span>
  )
}
