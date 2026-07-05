import type { ReactNode } from 'react'
import type { DataUsageSummary } from '@/types'
import { splitBytes } from '@/lib/format'
import { ChevronRightIcon, DevicesIcon, UsageIcon } from '@/components/ui/Icons'
import DirectionIcon from '@/components/ui/DirectionIcon'
import './HomeStats.css'

interface StatCardProps {
  readonly icon: ReactNode
  readonly label: string
  /** The card body: a colour-keyed readout (or split of readouts). */
  readonly body: ReactNode
  readonly ariaLabel: string
  readonly onOpen: () => void
}

function StatCard({ icon, label, body, ariaLabel, onOpen }: StatCardProps): JSX.Element {
  return (
    <button type="button" className="home-stat surface" onClick={onOpen} aria-label={ariaLabel}>
      <div className="home-stat-head">
        <span className="home-stat-icon">{icon}</span>
        <h2 className="section-title">{label}</h2>
        <ChevronRightIcon size={16} className="home-stat-caret" />
      </div>
      {body}
    </button>
  )
}

interface StatReadoutProps {
  readonly label: string
  /** Colour of the label's key dot. */
  readonly keyClass: 'down' | 'up' | 'online'
  readonly value: string
  readonly unit: string
}

/** A colour-keyed label above a compact value, matching the Live traffic readouts. */
function StatReadout({ label, keyClass, value, unit }: StatReadoutProps): JSX.Element {
  return (
    <div className="home-usage-readout">
      <div className="home-usage-readout-label">
        {keyClass === 'online' ? (
          <span className="home-usage-key online" aria-hidden />
        ) : (
          <DirectionIcon series={keyClass} />
        )}
        <span className="field-label">{label}</span>
      </div>
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
  readonly onOpenUsage: () => void
  readonly onOpenDevices: () => void
}

export default function HomeStats({
  usage,
  usageLoading,
  deviceCount,
  deviceOnline,
  devicesLoading,
  onOpenUsage,
  onOpenDevices,
}: HomeStatsProps): JSX.Element {
  const today = usage.days[usage.days.length - 1]
  const usageResolved = today != null || !usageLoading
  const down = splitBytes(today?.rxBytes ?? 0)
  const up = splitBytes(today?.txBytes ?? 0)

  const hasDevices = deviceCount != null

  return (
    <div className="home-stats">
      <StatCard
        icon={<UsageIcon size={15} />}
        label="Today's usage"
        body={
          usageResolved ? (
            <div className="home-usage-split" aria-hidden>
              <StatReadout label="Download" keyClass="down" value={down.value} unit={down.unit} />
              <StatReadout label="Upload" keyClass="up" value={up.value} unit={up.unit} />
            </div>
          ) : (
            <div className="metric home-stat-metric" aria-hidden>
              <span className="metric-value">—</span>
            </div>
          )
        }
        ariaLabel={`Today's usage: ${
          usageResolved ? `${down.value} ${down.unit} down, ${up.value} ${up.unit} up` : 'unavailable'
        }. Open Usage.`}
        onOpen={onOpenUsage}
      />
      <StatCard
        icon={<DevicesIcon size={15} />}
        label="Devices"
        body={
          devicesLoading && !hasDevices ? (
            <div className="home-stat-loading" aria-hidden>
              <div className="spinner" />
            </div>
          ) : hasDevices ? (
            <div className="home-usage-single" aria-hidden>
              <StatReadout
                label="Online"
                keyClass="online"
                value={deviceOnline != null ? `${deviceOnline} / ${deviceCount}` : String(deviceCount)}
                unit="devices"
              />
            </div>
          ) : (
            <div className="metric home-stat-metric" aria-hidden>
              <span className="metric-value">—</span>
            </div>
          )
        }
        ariaLabel={
          devicesLoading && !hasDevices
            ? 'Devices loading. Open Devices.'
            : hasDevices
              ? `${deviceOnline != null ? `${deviceOnline} of ` : ''}${deviceCount} devices online. Open Devices.`
              : 'Devices. Open Devices.'
        }
        onOpen={onOpenDevices}
      />
    </div>
  )
}
