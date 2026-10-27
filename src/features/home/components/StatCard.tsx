import type { ReactNode } from 'react'
import { cx } from 'class-variance-authority'
import { ChevronRightIcon } from '@/components/icons/Icons'
import { DirectionIcon } from '@/components/icons/DirectionIcon'
import styles from './StatCard.module.css'

interface StatCardProps {
  icon: ReactNode
  label: string
  /** Name of the open button: the readout in words, then where it goes. */
  ariaLabel: string
  /** Navigate into the tab when the card (or its caret) is tapped. */
  onOpen: () => void
  /** The readout is loading (e.g. a device scan in flight). */
  isBusy?: boolean
  /**
   * The card body: a colour-keyed readout (or a split of readouts). It may hold
   * its own control (the Devices card's Discover button), which sits beside the
   * open button rather than inside it.
   */
  children: ReactNode
}

/**
 * One of the small summary cards on Home: an icon + title row over a readout.
 * The title is a real heading, and a transparent button stretched over the
 * whole card opens the tab, so a control in the body is its sibling, never
 * nested inside it.
 */
export function StatCard({ icon, label, ariaLabel, onOpen, isBusy, children }: StatCardProps): JSX.Element {
  return (
    <div className={cx(styles.card, 'surface')} aria-busy={isBusy || undefined}>
      <div className={styles.head}>
        <span className={styles.icon}>{icon}</span>
        <h2 className="section-title">{label}</h2>
        <ChevronRightIcon size={16} className={styles.caret} />
      </div>
      <button type="button" className={styles.open} onClick={onOpen} aria-label={ariaLabel} />
      {children}
    </div>
  )
}

/**
 * Move focus to the open button of the card holding `element`. For a control
 * in the body that's about to unmount (Discover, replaced by the scan spinner),
 * so keyboard focus stays in the card instead of falling back to the page.
 */
export function focusStatCardOpenButton(element: HTMLElement): void {
  element.closest(`.${styles.card}`)?.querySelector<HTMLElement>(`:scope > .${styles.open}`)?.focus()
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
