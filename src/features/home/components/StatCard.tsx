import type { ReactNode } from 'react'
import { Card, CardBody, CardHeader, DirectionIcon, Readout, StatusDot } from '@/ui'

// The content fills the body's height, so a control can sit at its foot.
const READOUT_AREA = 'flex h-full flex-col whitespace-nowrap'

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
  const icon = marker === 'online' ? <StatusDot tone="positive" /> : <DirectionIcon series={marker} size={12} />
  return <Readout size="compact" icon={icon} value={value} unit={unit} className={className} />
}

/** The "no reading" body: a dash where the value would be. */
export function EmptyStatReadout() {
  return (
    <div className="metric mt-2" aria-hidden>
      <span className="type-number-display metric-value">—</span>
    </div>
  )
}
