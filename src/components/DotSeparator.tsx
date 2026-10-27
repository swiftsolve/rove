import { Fragment, type ReactNode } from 'react'
import './DotSeparator.css'

export function DotSeparator(): JSX.Element {
  return <span className="sep-dot" aria-hidden="true" />
}

interface InlineMetaProps {
  items: (ReactNode | null | undefined | false)[]
  className?: string
}

/** Inline metadata chunks separated by a tertiary dot icon. */
export function InlineMeta({ items, className }: InlineMetaProps): JSX.Element {
  const visibleItems = items.filter((item): item is ReactNode => Boolean(item))
  if (visibleItems.length === 0) return <></>
  if (visibleItems.length === 1) {
    return className ? <span className={className}>{visibleItems[0]}</span> : <>{visibleItems[0]}</>
  }

  return (
    <span className={['inline-meta', className].filter(Boolean).join(' ')}>
      {visibleItems.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && <DotSeparator />}
          <span className="inline-meta-item">{item}</span>
        </Fragment>
      ))}
    </span>
  )
}
