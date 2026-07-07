import type { ReactNode } from 'react'
import type { DataUsageSummary } from '@/types'
import { splitBytes } from '@/lib/format'
import { ChevronRightIcon, DevicesIcon, SearchIcon, TodayIcon } from '@/components/ui/Icons'
import DirectionIcon from '@/components/ui/DirectionIcon'
import { ButtonSpinner } from '@/components/ui/ButtonSpinner'
import './HomeStats.css'

interface StatCardProps {
  readonly icon: ReactNode
  readonly label: string
  /** The card body: a colour-keyed readout (or split of readouts). */
  readonly body: ReactNode
  readonly ariaLabel: string
  /** Navigate into the tab when the card (or its caret) is tapped. */
  readonly onOpen?: () => void
  /**
   * The body carries its own interactive control (e.g. the Devices widget's
   * Scan button). A button can't nest inside a button, so when set the card
   * renders as a clickable div (role="button") instead — the whole widget still
   * navigates, and the nested control stops propagation to run its own action.
   */
  readonly staticBody?: boolean
}

function StatCard({ icon, label, body, ariaLabel, onOpen, staticBody }: StatCardProps): JSX.Element {
  const caret = onOpen ? <ChevronRightIcon size={16} className="home-stat-caret" /> : null

  const head = (
    <div className="home-stat-head">
      <span className="home-stat-icon">{icon}</span>
      <h2 className="section-title">{label}</h2>
      {caret}
    </div>
  )

  if (!onOpen) {
    return (
      <div className="home-stat surface home-stat-static" aria-label={ariaLabel}>
        {head}
        {body}
      </div>
    )
  }

  // Body owns a control: a <button> can't nest inside a <button>, so render the
  // card as a clickable div. The whole widget navigates (like the Usage card),
  // while the nested control (e.g. Scan) stops propagation to run its own action.
  if (staticBody) {
    return (
      <div
        role="button"
        tabIndex={0}
        className="home-stat surface"
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        }}
        aria-label={ariaLabel}
      >
        {head}
        {body}
      </div>
    )
  }

  return (
    <button type="button" className="home-stat surface" onClick={onOpen} aria-label={ariaLabel}>
      {head}
      {body}
    </button>
  )
}

interface StatReadoutProps {
  /** Colour of the key dot / direction of the arrow. */
  readonly keyClass: 'down' | 'up' | 'online'
  readonly value: string
  readonly unit: string
}

/** A direction icon (or key dot) inline with a compact value. */
function StatReadout({ keyClass, value, unit }: StatReadoutProps): JSX.Element {
  return (
    <div className="home-usage-readout">
      {keyClass === 'online' ? (
        <span className="home-usage-key online" aria-hidden />
      ) : (
        <DirectionIcon series={keyClass} size={12} />
      )}
      <div className="metric metric-compact num">
        <span className="metric-value">{value}</span>
        <span className="metric-unit">{unit}</span>
      </div>
    </div>
  )
}

interface HomeStatsProps {
  readonly usage: DataUsageSummary
  readonly usageLoading: boolean
  readonly deviceCount: number | null
  readonly deviceOnline: number | null
  readonly devicesLoading: boolean
  /** macOS only: scan from the widget instead of auto-scanning on Home load. */
  readonly onScanDevices?: () => void
  readonly onOpenUsage: () => void
  readonly onOpenDevices: () => void
}

export default function HomeStats({
  usage,
  usageLoading,
  deviceCount,
  deviceOnline,
  devicesLoading,
  onScanDevices,
  onOpenUsage,
  onOpenDevices,
}: HomeStatsProps): JSX.Element {
  const today = usage.days[usage.days.length - 1]
  const usageResolved = today != null || !usageLoading
  const down = splitBytes(today?.rxBytes ?? 0)
  const up = splitBytes(today?.txBytes ?? 0)

  const hasDevices = deviceCount != null
  // macOS before its first scan: no count yet, nothing loading, and a scan
  // handler wired up. Offer a Scan button in place of the auto-scanned count.
  const showScanButton = !hasDevices && !devicesLoading && onScanDevices != null

  return (
    <div className="home-stats">
      <StatCard
        icon={<TodayIcon size={15} />}
        label="Usage"
        body={
          usageResolved ? (
            <div className="home-usage-split" aria-hidden>
              <StatReadout keyClass="down" value={down.value} unit={down.unit} />
              <StatReadout keyClass="up" value={up.value} unit={up.unit} />
            </div>
          ) : (
            <div className="metric home-stat-metric" aria-hidden>
              <span className="metric-value">—</span>
            </div>
          )
        }
        ariaLabel={`Usage: ${
          usageResolved ? `${down.value} ${down.unit} down, ${up.value} ${up.unit} up` : 'unavailable'
        }. Open Usage.`}
        onOpen={onOpenUsage}
      />
      <StatCard
        icon={<DevicesIcon size={15} />}
        label="Devices"
        body={
          // Show the spinner whenever a scan is in flight — from the Home Scan
          // button, or a rescan started on the Devices page (shared state). A
          // background poll is silent (never toggles the busy flag), so this
          // only replaces the count during a real scan, not every refresh.
          devicesLoading ? (
            <div className="home-stat-loading" aria-hidden>
              <ButtonSpinner size={14} color="var(--text-secondary)" />
            </div>
          ) : hasDevices ? (
            <div className="home-usage-single" aria-hidden>
              <StatReadout
                keyClass="online"
                value={deviceOnline != null ? String(deviceOnline) : String(deviceCount)}
                unit="online"
              />
            </div>
          ) : showScanButton ? (
            <div className="home-stat-scan">
              <button
                type="button"
                className="btn-secondary"
                onClick={(e) => {
                  // The card navigates on click; keep Scan to its own action.
                  e.stopPropagation()
                  onScanDevices?.()
                }}
              >
                <SearchIcon size={14} />
                Scan
              </button>
            </div>
          ) : (
            <div className="metric home-stat-metric" aria-hidden>
              <span className="metric-value">—</span>
            </div>
          )
        }
        ariaLabel={
          devicesLoading
            ? 'Scanning for devices. Open Devices.'
            : hasDevices
              ? `${deviceOnline != null ? `${deviceOnline} of ` : ''}${deviceCount} devices online. Open Devices.`
              : 'Devices'
        }
        // Tapping the card opens Devices. In the pre-scan state the card is
        // static so its Scan button isn't nested inside a button, but the caret
        // stays live as a standalone control — opening Devices runs the scan.
        onOpen={onOpenDevices}
        staticBody={showScanButton}
      />
    </div>
  )
}
