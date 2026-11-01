import { Fragment, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '../foundations/cn'

/**
 * A dot gets 8px of air on each side: the rows it sits in space their items at
 * 6px, and its margin adds 2px for the dot alone, so the gaps between other
 * items in the same row stay at 6px.
 */
export function DotSeparator(): JSX.Element {
  return <span className="sep-dot mx-2 size-[3px] shrink-0 rounded-full bg-tertiary" aria-hidden="true" />
}

const metaVariants = cva('inline-meta min-w-0 max-w-full items-center gap-6', {
  variants: {
    shouldTruncate: { true: 'flex overflow-hidden whitespace-nowrap', false: 'inline-flex' },
  },
})

const itemVariants = cva('inline-meta-item min-w-0', {
  variants: {
    shouldTruncate: { true: 'overflow-hidden text-ellipsis' },
  },
})

interface InlineMetaProps {
  items: (ReactNode | null | undefined | false)[]
  className?: string
  /** Keep the items on one line, each ellipsizing as space runs out. */
  shouldTruncate?: boolean
}

/** Inline metadata chunks separated by a tertiary dot. */
export function InlineMeta({ items, className, shouldTruncate = false }: InlineMetaProps): JSX.Element {
  const visibleItems = items.filter((item): item is ReactNode => Boolean(item))
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
