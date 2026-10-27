import type { KeyboardEvent, ReactNode } from 'react'
import { cx } from '@/lib/cx'
import { ChevronRightIcon } from '@/components/icons/Icons'
import { DirectionIcon } from '@/components/icons/DirectionIcon'
import styles from './StatCard.module.css'

interface StatCardProps {
  icon: ReactNode
  label: string
  ariaLabel: string
  /** Navigate into the tab when the card (or its caret) is tapped. */
  onOpen: () => void
  /**
   * The body carries its own interactive control (e.g. the Devices card's
   * Discover button). A button can't nest inside a button, so when set the card
   * renders as a clickable div (role="button") instead — the whole card still
   * navigates, and the nested control stops propagation to run its own action.
   */
  hasInteractiveBody?: boolean
  /** The card body: a colour-keyed readout (or a split of readouts). */
  children: ReactNode
}

/** One of the small summary cards on Home: an icon + title row over a readout. */
export function StatCard({
  icon,
  label,
  ariaLabel,
  onOpen,
  hasInteractiveBody,
  children,
}: StatCardProps): JSX.Element {
  const head = (
    <div className={styles.head}>
      <span className={styles.icon}>{icon}</span>
      <h2 className="section-title">{label}</h2>
      <ChevronRightIcon size={16} className={styles.caret} />
    </div>
  )

  if (hasInteractiveBody) {
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onOpen()
      }
    }
    return (
      <div
        role="button"
        tabIndex={0}
        className={cx(styles.card, 'surface')}
        onClick={onOpen}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
      >
        {head}
        {children}
      </div>
    )
  }

  return (
    <button type="button" className={cx(styles.card, 'surface')} onClick={onOpen} aria-label={ariaLabel}>
      {head}
      {children}
    </button>
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
  return (
    <div className={cx(styles.readout, className)}>
      {marker === 'online' ? (
        <span className={cx(styles.key, styles.isOnline)} aria-hidden />
      ) : (
        <DirectionIcon series={marker} size={12} />
      )}
      <div className="metric metric-compact num">
        <span className="metric-value">{value}</span>
        <span className="metric-unit">{unit}</span>
      </div>
    </div>
  )
}

/** The "no reading" body: a dash where the value would be. */
export function EmptyStatMetric(): JSX.Element {
  return (
    <div className={cx('metric', styles.emptyMetric)} aria-hidden>
      <span className="metric-value">—</span>
    </div>
  )
}
