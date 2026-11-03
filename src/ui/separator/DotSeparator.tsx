import { cva } from 'class-variance-authority'
import { Fragment, type ReactNode } from 'react'

import { cn } from '../utils/cn'

/**
 * A small tertiary dot between inline items. Its 2px margin on the row's 6px
 * gap gives it 8px of air a side, while other items keep their 6px.
 */
export function DotSeparator() {
  return <span className="sep-dot mx-2 size-[3px] shrink-0 rounded-full bg-tertiary" aria-hidden="true" />
}

const metaVariants = cva('inline-meta min-w-0 max-w-full items-center gap-6', {
  variants: {
    shouldTruncate: { true: 'flex overflow-hidden whitespace-nowrap', false: 'inline-flex flex-wrap' },
  },
  defaultVariants: { shouldTruncate: false },
})

const itemVariants = cva('inline-meta-item min-w-0', {
  variants: {
    shouldTruncate: { true: 'overflow-hidden text-ellipsis' },
  },
})

type InlineMetaProps = {
  /** The chunks, in order. Empty ones (null, false, '') are dropped, with their dots. */
  items: (ReactNode | null | undefined | false)[]
  /**
   * Its place in a line: `flex-[0_1_auto]` to shrink, not grow, beside other
   * items. It takes its type from the line it sits in.
   */
  className?: string
  /** Keep the items on one line, each ellipsizing as space runs out. Otherwise they wrap. */
  shouldTruncate?: boolean
}

/** Inline metadata chunks separated by a tertiary dot, in the type of the line it sits in. */
export function InlineMeta({ items, className, shouldTruncate = false }: InlineMetaProps) {
  // A 0 is a value to show; only nothing, false or an empty string drops out.
  const visibleItems = items.filter((item): item is ReactNode => item != null && item !== false && item !== '')
  if (visibleItems.length === 0) return <></>
  if (visibleItems.length === 1) {
    return className ? <span className={className}>{visibleItems[0]}</span> : <>{visibleItems[0]}</>
  }

  return (
    <span className={cn(metaVariants({ shouldTruncate }), className)}>
      {visibleItems.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && <DotSeparator />}
          <span className={itemVariants({ shouldTruncate })}>{item}</span>
        </Fragment>
      ))}
    </span>
  )
}
