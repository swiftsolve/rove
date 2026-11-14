import { cva } from 'class-variance-authority'
import type { JSX, ReactNode } from 'react'

import type { VariantOf } from '../../utils/variants'

/**
 * Label left, value right. The first row sits flush to the top of its
 * container and the last to the bottom, so `py` only sets the gap between rows.
 */
const rowVariants = cva('flex justify-between gap-16 py-(--data-row-py) first:pt-0 last:pb-0', {
  variants: {
    align: { baseline: 'items-baseline', center: 'items-center' },
  },
  defaultVariants: { align: 'baseline' },
})

const LABEL = 'type-body-medium text-tertiary shrink-0'
const VALUE = 'type-body text-primary num text-right'

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
