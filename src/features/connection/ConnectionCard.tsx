import { memo, type ReactNode } from 'react'
import type { EthernetNetworkInfo, NetworkInfo, WifiNetworkInfo } from '@/types'
import { isConnectedNetwork, isEthernetNetwork, isWifiNetwork } from '@/types'
import {
  getConnectionDisplay,
  type ConnectionDisplayVariant,
} from '@/features/connection/utils/connection-display'
import { isNetworkInfoEqual } from '@/features/connection/utils/network-info-equal'
import { usePublicIp } from '@/features/connection/hooks/usePublicIp'
import { useDetailsExpanded } from '@/features/connection/hooks/useDetailsExpanded'
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
import { DataRow } from '@/components/DataRow'
import { InlineMeta } from '@/components/DotSeparator'
import {
  ChevronDownIcon,
  EthernetIcon,
  LockIcon,
  OfflineIcon,
  UnlockIcon,
  WifiIcon,
} from '@/components/icons/Icons'
import { ShareWifiButton } from '@/features/connection/ShareWifiButton'
import { cx } from '@/lib/cx'
import styles from './ConnectionCard.module.css'

interface ConnectionCardProps {
  info: NetworkInfo
}

const SIGNAL_BARS = [0, 1, 2, 3]

// Strongest first: the collapsed strip names the best protocol the network offers.
const SECURITY_PROTOCOLS = ['WPA3', 'WPA2', 'WPA', 'OWE', 'WEP']

function signalBarCount(strength: number): number {
  if (strength >= 80) return 4
  if (strength >= 55) return 3
  if (strength >= 35) return 2
  return 1
}

type SignalLevel = 'good' | 'fair' | 'weak'

function signalLevel(strength: number): SignalLevel {
  if (strength >= 55) return 'good'
  if (strength >= 35) return 'fair'
  return 'weak'
}

/**
 * The strongest protocol named in an OS security string, for tight spaces:
 * "WPA3-Personal (H2E)" → "WPA3", "WPA2 WPA3" (transition mode) → "WPA3".
 * Falls back to the full string when none is recognised (e.g. "802.1X").
 */
function shortSecurityLabel(security: string): string {
  const tokens = security.toUpperCase().split(/[^A-Z0-9]+/)
  return SECURITY_PROTOCOLS.find((protocol) => tokens.includes(protocol)) ?? security
}

function formatLinkSpeed(info: NetworkInfo): string | null {
  if (!isWifiNetwork(info) && !isEthernetNetwork(info)) return null
  return info.linkSpeedMbps != null ? formatSpeedMbps(info.linkSpeedMbps) : null
}

/** Signal as its rating and percent (plus dBm when known), else dBm alone, else a dash. */
function formatSignalDetail(info: WifiNetworkInfo): ReactNode {
  const { signalStrength, signalDbm } = info
  if (signalStrength != null && Number.isFinite(signalStrength)) {
    const percent = signalDbm != null ? `${signalStrength}% (${signalDbm} dBm)` : `${signalStrength}%`
    return <InlineMeta items={[formatSignalStrength(signalStrength), percent]} />
  }
  if (signalDbm != null && Number.isFinite(signalDbm)) return `${signalDbm} dBm`
  return '—'
}

function ConnectionIcon({ variant }: { variant: ConnectionDisplayVariant }): JSX.Element {
  if (variant === 'wifi') return <WifiIcon size={16} />
  if (variant === 'ethernet') return <EthernetIcon size={16} />
  return <OfflineIcon size={16} />
}

function SignalMeter({ strength }: { strength: number }): JSX.Element {
  const label = formatSignalStrength(strength)
  const filledBars = signalBarCount(strength)

  return (
    <div
      className={styles.signalMeter}
      data-level={signalLevel(strength)}
      role="meter"
      aria-label={`Wi‑Fi signal: ${label}`}
      aria-valuenow={strength}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className={styles.signalBars} aria-hidden>
        {SIGNAL_BARS.map((bar) => (
          <span key={bar} className={cx(styles.signalBar, bar < filledBars && styles.isOn)} />
        ))}
      </span>
    </div>
  )
}

/**
 * Wi‑Fi security with a lock: closed and green when the network is secured,
 * open and red when it's open. Null when the OS didn't report security.
 * `isShort` trims the label to the strongest protocol for the collapsed strip.
 */
function SecurityBadge({
  security,
  isShort = false,
}: {
  security: string | null
  isShort?: boolean
}): JSX.Element | null {
  const isSecured = isSecuredWifi(security)
  if (isSecured == null || security == null) return null
  // Collapse runs of spaces — Windows reports e.g. "WPA3-Personal  (H2E)".
  const full = security.trim().replace(/\s+/g, ' ')
  let label = 'Open'
  if (isSecured) label = isShort ? shortSecurityLabel(full) : full
  const description = isSecured ? `Secured (${full})` : 'Open network — traffic is not encrypted'
  return (
    <span
      className={cx(styles.securityBadge, isSecured ? styles.isSecured : styles.isUnsecured)}
      title={description}
    >
      {isSecured ? <LockIcon size={12} /> : <UnlockIcon size={12} />}
      <span className={styles.securityBadgeLabel}>{label}</span>
    </span>
  )
}

function WifiExtras({
  info,
  linkSpeed,
}: {
  info: WifiNetworkInfo
  linkSpeed: string | null
}): JSX.Element {
  return (
    <>
      <DataRow label="Signal">
        <span className={styles.signalDetail}>
          {info.signalStrength != null && <SignalMeter strength={info.signalStrength} />}
          {formatSignalDetail(info)}
        </span>
      </DataRow>
      {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
      <DataRow label="Band" value={formatBand(info.frequency)} />
      <DataRow label="Channel" value={formatChannel(info.channel, info.frequency)} />
      <DataRow label="Standard" value={formatWifiStandard(info.wifiStandard)} />
      {isSecuredWifi(info.security) != null ? (
        <DataRow label="Security">
          <SecurityBadge security={info.security} />
        </DataRow>
      ) : (
        <DataRow label="Security" value="—" />
      )}
    </>
  )
}

function EthernetExtras({
  info,
  linkSpeed,
}: {
  info: EthernetNetworkInfo
  linkSpeed: string | null
}): JSX.Element {
  return (
    <>
      {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
      <DataRow label="Duplex" value={formatDisplayValue(formatDuplex(info.duplex))} />
      <DataRow label="Adapter" value={formatDisplayValue(info.product)} />
      <DataRow label="Vendor" value={formatDisplayValue(info.vendor)} />
    </>
  )
}

/** The collapsed strip's meta line: IP, then band and security on Wi‑Fi or
 *  link speed otherwise. Missing pieces are dropped. */
function stripMetaItems(info: NetworkInfo, linkSpeed: string | null): ReactNode[] {
  const items = isWifiNetwork(info)
    ? [
        info.ipAddress,
        formatBand(info.frequency),
        isSecuredWifi(info.security) != null && <SecurityBadge security={info.security} isShort />,
      ]
    : [info.ipAddress, linkSpeed]
  return items.filter(Boolean)
}

export const ConnectionCard = memo(function ConnectionCard({ info }: ConnectionCardProps): JSX.Element {
  const [isExpanded, toggleExpanded] = useDetailsExpanded()
  const display = getConnectionDisplay(info)
  const { publicIp, isLoading: isPublicIpLoading } = usePublicIp(
    isConnectedNetwork(info),
    info.ipAddress,
  )
  const linkSpeed = formatLinkSpeed(info)
  const subItems = stripMetaItems(info, linkSpeed)
  const detailsLabel = isExpanded ? 'Hide connection details' : 'Show connection details'

  return (
    <section className={styles.root} data-variant={display.variant}>
      <div className={styles.strip}>
        {/* A transparent full-strip button keeps the whole row one expand target
            without wrapping the QR button inside another button (invalid HTML).
            The content above it stays click-through so the overlay still toggles;
            the QR button opts back in and handles its own click. */}
        <button
          type="button"
          className={styles.stripToggle}
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          aria-label={detailsLabel}
        />
        <div className={styles.stripIcon}>
          <ConnectionIcon variant={display.variant} />
        </div>
        <div className={styles.stripText}>
          <div className={cx('text-title', styles.stripTitle)}>{display.title}</div>
          {subItems.length > 0 ? (
            <InlineMeta className={cx('text-secondary', styles.stripSub)} items={subItems} />
          ) : (
            <div className={cx('text-secondary', styles.stripSub)}>{display.subtitle}</div>
          )}
        </div>
        {isWifiNetwork(info) && (
          <span className={styles.stripShare}>
            <ShareWifiButton />
          </span>
        )}
        {isWifiNetwork(info) && info.signalStrength != null && (
          <SignalMeter strength={info.signalStrength} />
        )}
        <ChevronDownIcon
          size={14}
          className={cx(styles.chevron, isExpanded && styles.isOpen)}
          aria-hidden
        />
      </div>

      <div className={cx(styles.detailsWrap, isExpanded && styles.isOpen)}>
        <div className={cx(styles.details, 'row-list')}>
          <DataRow label="IP address" value={formatDisplayValue(info.ipAddress)} />
          <DataRow
            label="Public IP"
            value={publicIp ?? (isPublicIpLoading ? 'Checking…' : null)}
          />
          {/* Grouped by topic: addresses, then the link itself, then the
              hardware it runs over. */}
          <DataRow label="Gateway" value={formatDisplayValue(info.gateway)} />
          {info.dns.length > 0 && (
            <DataRow label="DNS" value={formatDisplayValue(info.dns.join(', '))} />
          )}
          {isWifiNetwork(info) && <WifiExtras info={info} linkSpeed={linkSpeed} />}
          {isEthernetNetwork(info) && <EthernetExtras info={info} linkSpeed={linkSpeed} />}
          <DataRow label="Interface" value={formatDisplayValue(info.interfaceName)} />
          <DataRow label="MAC" value={formatMac(info.macAddress)} />
        </div>
      </div>
    </section>
  )
},
(previous, next) => isNetworkInfoEqual(previous.info, next.info))

export function canRunSpeedTest(info: NetworkInfo): boolean {
  return isConnectedNetwork(info)
}
