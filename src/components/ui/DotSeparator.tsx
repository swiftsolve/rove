import { Fragment, type ReactNode } from 'react'
import './DotSeparator.css'

export function DotSeparator(): JSX.Element {
  return <span className="sep-dot" aria-hidden="true" />
}

interface InlineMetaProps {
  readonly items: readonly (ReactNode | null | undefined | false)[]
  readonly className?: string
}

/** Inline metadata chunks separated by a tertiary dot icon. */
export function InlineMeta({ items, className }: InlineMetaProps): JSX.Element {
  const filtered = items.filter((item): item is ReactNode => Boolean(item))
  if (filtered.length === 0) return <></>
  if (filtered.length === 1) {
    return className ? <span className={className}>{filtered[0]}</span> : <>{filtered[0]}</>
  }

  return (
    <span className={['inline-meta', className].filter(Boolean).join(' ')}>
      {filtered.map((item, index) => (
        <Fragment key={index}>
          {index > 0 && <DotSeparator />}
          <span className="inline-meta-item">{item}</span>
        </Fragment>
      ))}
    </span>
  )
}
