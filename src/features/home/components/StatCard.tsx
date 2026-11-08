import { cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { Card, CardBody, CardHeader, DirectionIcon, NoValue, Readout, StatusDot } from '@/ui'

// One figure's line tall whatever it holds (the value, a spinner, a placeholder
// or a button), so swapping them never resizes the card or the row.
const READOUT_AREA = cx(
  'flex flex-col whitespace-nowrap',
  'h-[calc(var(--type-stat-size)*var(--type-stat-line-height))]',
)

type StatCardProps = {
  icon: ReactNode
  title: string
  /** Name of the card's link: the readout in words, then where it goes. */
  linkLabel: string
  /** Navigate into the tab when the card is tapped. */
  onOpen: () => void
  /** The readout is loading (e.g. a device scan in flight). */
  isLoading?: boolean
  /** The readout. It may hold its own control, which sits beside the card's link rather than inside it. */
  children: ReactNode
}

/** One of the small summary cards on Home: a title over a readout, opening its tab. */
export function StatCard({ icon, title, linkLabel, onOpen, isLoading, children }: StatCardProps) {
  return (
    <Card onOpen={onOpen} linkLabel={linkLabel} aria-busy={isLoading || undefined}>
      <CardHeader title={title} icon={icon} />
      <CardBody>
        <div className={READOUT_AREA}>{children}</div>
      </CardBody>
    </Card>
  )
}

type StatReadoutProps = {
  /** What marks the value: a download/upload arrow, or the green "online" dot. */
  marker: 'down' | 'up' | 'online'
  value: string
  unit: string
  className?: string
}

/** A compact value behind its marker. */
export function StatReadout({ marker, value, unit, className }: StatReadoutProps) {
  // The small dot needs more room before the count than the arrows do, but
  // the count and its unit keep the readout's gap.
  const icon =
    marker === 'online' ? <StatusDot tone="positive" className="mr-4" /> : <DirectionIcon series={marker} size={12} />
  return <Readout size="compact" icon={icon} value={value} unit={unit} className={className} />
}

/** The "no reading" body: a NoValue bar where the value would be, at the value's size. */
export function EmptyStatReadout() {
  return (
    <span className="type-stat" aria-hidden>
      <NoValue />
    </span>
  )
}
