import { memo, useState } from 'react'
import type { EthernetNetworkInfo, NetworkInfo, WifiNetworkInfo } from '@/types'
import { isConnectedNetwork, isEthernetNetwork, isWifiNetwork } from '@/types'
import { getConnectionDisplay } from '@/components/connection/connection-display'
import { networkInfoEqual } from '@/components/connection/network-info-equal'
import { usePublicIp } from '@/hooks/usePublicIp'
import {
  formatBand,
  formatChannel,
  formatDisplayValue,
  formatDuplex,
  formatMac,
  formatSignalStrength,
  formatSpeedMbps,
  formatWifiStandard,
  isSecuredWifi,
} from '@/lib/format'
import DataRow from '@/components/ui/DataRow'
import { InlineMeta } from '@/components/ui/DotSeparator'
import {
  ChevronDownIcon,
  EthernetIcon,
  LockIcon,
  OfflineIcon,
  UnlockIcon,
  WifiIcon,
} from '@/components/ui/Icons'
import ShareWifiButton from './ShareWifiButton'
import './ConnectionCard.css'

interface ConnectionCardProps {
  readonly info: NetworkInfo
}

function ConnectionIcon({ variant }: { readonly variant: string }): JSX.Element {
  if (variant === 'wifi') return <WifiIcon size={16} />
  if (variant === 'ethernet') return <EthernetIcon size={16} />
  return <OfflineIcon size={16} />
}

const SIGNAL_BARS = [0, 1, 2, 3]

function signalBarCount(strength: number): number {
  if (strength >= 80) return 4
  if (strength >= 55) return 3
  if (strength >= 35) return 2
  return 1
}

function signalLevelClass(strength: number): string {
  if (strength >= 55) return 'sig-good'
  if (strength >= 35) return 'sig-fair'
  return 'sig-weak'
}

function SignalMeter({ strength }: { readonly strength: number }): JSX.Element {
  const label = formatSignalStrength(strength)
  const filled = signalBarCount(strength)

  return (
    <div
      className={`signal-meter ${signalLevelClass(strength)}`}
      role="meter"
      aria-label={`Wi‑Fi signal: ${label}`}
      aria-valuenow={strength}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className="signal-bars" aria-hidden>
        {SIGNAL_BARS.map((i) => (
          <span key={i} className={`signal-bar${i < filled ? ' on' : ''}`} />
        ))}
      </span>
    </div>
  )
}

/**
 * Wi‑Fi security with a lock: closed and green when the network is secured,
 * open and red when it's open. Null when the OS didn't report security.
 * `iconOnly` keeps just the lock (collapsed strip, where width is tight).
 */
function SecurityBadge({
  security,
  iconOnly = false,
}: {
  readonly security: string | null
  readonly iconOnly?: boolean
}): JSX.Element | null {
  const secured = isSecuredWifi(security)
  if (secured == null || security == null) return null
  const label = secured ? security.trim() : 'Open'
  const description = secured ? `Secured (${label})` : 'Open network — traffic is not encrypted'
  return (
    <span
      className={`security-badge ${secured ? 'secured' : 'open'}`}
      title={description}
      role={iconOnly ? 'img' : undefined}
      aria-label={iconOnly ? description : undefined}
    >
      {secured ? <LockIcon size={12} /> : <UnlockIcon size={12} />}
      {!iconOnly && label}
    </span>
  )
}

function WifiExtras({ info }: { readonly info: WifiNetworkInfo }): JSX.Element {
  return (
    <>
      <DataRow label="Signal">
        <span className="signal-detail">
          {info.signalStrength != null && <SignalMeter strength={info.signalStrength} />}
          {info.signalStrength != null && Number.isFinite(info.signalStrength) ? (
            <InlineMeta
              items={[
                formatSignalStrength(info.signalStrength),
                info.signalDbm != null
                  ? `${info.signalStrength}% (${info.signalDbm} dBm)`
                  : `${info.signalStrength}%`,
              ]}
            />
          ) : info.signalDbm != null && Number.isFinite(info.signalDbm) ? (
            `${info.signalDbm} dBm`
          ) : (
            '—'
          )}
        </span>
      </DataRow>
      <DataRow label="Band" value={formatBand(info.frequency)} />
      <DataRow label="Channel" value={formatChannel(info.channel, info.frequency)} />
      {isSecuredWifi(info.security) != null ? (
        <DataRow label="Security">
          <SecurityBadge security={info.security} />
        </DataRow>
      ) : (
        <DataRow label="Security" value="—" />
      )}
      <DataRow label="Standard" value={formatWifiStandard(info.wifiStandard)} />
    </>
  )
}

function EthernetExtras({ info }: { readonly info: EthernetNetworkInfo }): JSX.Element {
  return (
    <>
      <DataRow label="Adapter" value={formatDisplayValue(info.product)} />
      <DataRow label="Duplex" value={formatDisplayValue(formatDuplex(info.duplex))} />
      <DataRow label="Vendor" value={formatDisplayValue(info.vendor)} />
    </>
  )
}

const EXPANDED_KEY = 'rove.connection-details-expanded'

function ConnectionCard({ info }: ConnectionCardProps): JSX.Element {
  // Persisted so the choice survives tab switches (which unmount this card)
  // and restarts. Defaults to collapsed rather than auto-expanding.
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(EXPANDED_KEY) === 'true'
    } catch {
      return false
    }
  })

  const toggleExpanded = (): void => {
    setExpanded((open) => {
      const next = !open
      try {
        localStorage.setItem(EXPANDED_KEY, String(next))
      } catch {
        // Storage unavailable — remember for this session only.
      }
      return next
    })
  }
  const display = getConnectionDisplay(info)
  const { publicIp, isLoading: publicIpLoading } = usePublicIp(
    isConnectedNetwork(info),
    info.ipAddress,
  )
  const linkSpeed =
    (isWifiNetwork(info) || isEthernetNetwork(info)) && info.linkSpeedMbps != null
      ? formatSpeedMbps(info.linkSpeedMbps)
      : null
  const subBits = isWifiNetwork(info)
    ? [
        info.ipAddress,
        formatBand(info.frequency),
        isSecuredWifi(info.security) != null && (
          <SecurityBadge security={info.security} iconOnly />
        ),
      ]
    : [info.ipAddress, linkSpeed]
  const subItems = subBits.filter(Boolean)
  const detailsLabel = expanded ? 'Hide connection details' : 'Show connection details'

  return (
    <section className={`conn-card ${display.variant}`}>
      <div className="conn-strip">
        {/* A transparent full-strip button keeps the whole row one expand target
            without wrapping the QR button inside another button (invalid HTML).
            The content above it stays click-through so the overlay still toggles;
            the QR button opts back in and handles its own click. */}
        <button
          type="button"
          className="conn-strip-toggle"
          onClick={toggleExpanded}
          aria-expanded={expanded}
          aria-label={detailsLabel}
        />
        <div className="conn-strip-icon">
          <ConnectionIcon variant={display.variant} />
        </div>
        <div className="conn-strip-text">
          <div className="text-title conn-strip-title">{display.title}</div>
          {subItems.length > 0 ? (
            <InlineMeta className="text-secondary conn-strip-sub" items={subItems} />
          ) : (
            <div className="text-secondary conn-strip-sub">{display.subtitle}</div>
          )}
        </div>
        {isWifiNetwork(info) && (
          <span className="conn-strip-share">
            <ShareWifiButton />
          </span>
        )}
        {isWifiNetwork(info) && info.signalStrength != null && (
          <SignalMeter strength={info.signalStrength} />
        )}
        <ChevronDownIcon
          size={14}
          className={`conn-chevron ${expanded ? 'open' : ''}`}
          aria-hidden
        />
      </div>

      <div className={`conn-details-wrap ${expanded ? 'open' : ''}`}>
        <div className="conn-details row-list">
          <DataRow label="IP address" value={formatDisplayValue(info.ipAddress)} />
          <DataRow
            label="Public IP"
            value={publicIp ?? (publicIpLoading ? 'Checking…' : null)}
          />
          <DataRow label="Gateway" value={formatDisplayValue(info.gateway)} />
          {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
          {isWifiNetwork(info) && <WifiExtras info={info} />}
          {isEthernetNetwork(info) && <EthernetExtras info={info} />}
          <DataRow label="Interface" value={formatDisplayValue(info.interfaceName)} />
          <DataRow label="MAC" value={formatMac(info.macAddress)} />
          {info.dns.length > 0 && (
            <DataRow label="DNS" value={formatDisplayValue(info.dns.join(', '))} />
          )}
        </div>
      </div>
    </section>
  )
}

export function canRunSpeedTest(info: NetworkInfo): boolean {
  return isConnectedNetwork(info)
}

export default memo(
  ConnectionCard,
  (previous, next) => networkInfoEqual(previous.info, next.info),
)
