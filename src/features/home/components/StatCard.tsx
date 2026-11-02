import type { ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import { Card, CardBody, CardHeader, DirectionIcon, Readout, StatusDot } from '@/ui'

// The card used to be a <button>. Its body keeps the text settings it
// inherited from it (a button resets these), so the readouts render as
// before. It fills the body's height, so a control can sit at the foot.
const CONTENT = cx(
  'flex h-full flex-col',
  'leading-[normal] whitespace-nowrap [font-feature-settings:normal] [text-rendering:auto]',
)

interface StatCardProps {
  icon: ReactNode
  label: string
  /** Name of the card's link: the readout in words, then where it goes. */
  ariaLabel: string
  /** Navigate into the tab when the card is tapped. */
  onOpen: () => void
  /** The readout is loading (e.g. a device scan in flight). */
  isLoading?: boolean
  /**
   * The card body: a colour-keyed readout (or a split of readouts). It may hold
   * its own control (the Devices card's Discover button), which sits beside the
   * link rather than inside it.
   */
  children: ReactNode
}

/** One of the small summary cards on Home: a title over a readout, opening its tab. */
export function StatCard({ icon, label, ariaLabel, onOpen, isLoading, children }: StatCardProps): JSX.Element {
  return (
    <Card onOpen={onOpen} linkLabel={ariaLabel} aria-busy={isLoading || undefined}>
      <CardHeader title={label} icon={icon} />
      <CardBody>
        <div className={CONTENT}>{children}</div>
      </CardBody>
    </Card>
  )
}

interface StatReadoutProps {
  /** What marks the value: a download/upload arrow, or the green "online" dot. */
  marker: 'down' | 'up' | 'online'
  value: string
  unit: string
  className?: string
}

/** A direction arrow (or key dot) inline with a compact value. */
export function StatReadout({ marker, value, unit, className }: StatReadoutProps): JSX.Element {
  const icon =
    marker === 'online' ? (
      <StatusDot tone="positive" />
    ) : (
      <DirectionIcon series={marker} size={12} />
    )
  return <Readout size="compact" icon={icon} value={value} unit={unit} className={className} />
}

/** The "no reading" body: a dash where the value would be. */
export function EmptyStatMetric(): JSX.Element {
  return (
    <div className="metric mt-2" aria-hidden>
      <span className="type-number-display metric-value">—</span>
    </div>
  )
}
