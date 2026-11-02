import { memo, useId, type ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
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
import {
  BarMeter,
  Card,
  ChevronDownIcon,
  DataList,
  DataListStack,
  DataRow,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  EthernetIcon,
  IconTile,
  InlineMeta,
  LockIcon,
  OfflineIcon,
  Tooltip,
  UnlockIcon,
  WifiIcon,
  type VariantOf,
  type IconTileColor,
} from '@/ui'
import { ShareWifiButton } from '@/features/connection/ShareWifiButton'
import styles from './ConnectionCard.module.css'

// The connection icon's tile, coloured by the kind of connection.
const STRIP_ICON_COLORS = {
  wifi: 'var(--series-down)',
  ethernet: 'var(--status-positive)',
  disconnected: 'var(--status-negative)',
} as const satisfies Record<string, IconTileColor>

const signalMeterVariants = cva('flex items-center gap-8', {
  variants: {
    level: { good: 'text-status-positive', fair: 'text-status-warning', poor: 'text-status-negative' },
    /** Beside the strip's title, or inside the expanded Signal row. */
    placement: { strip: 'relative z-1 pointer-events-none self-center shrink-0', details: null },
  },
})

// Lock + protocol, green when secured, red when open. A block flex box (not
// inline-flex) so the lock centres on the text instead of sitting on the line's
// baseline, which drops it a couple of pixels low. In the expanded rows (the
// details' <dl>) it right-aligns in the value cell.
const securityBadgeVariants = cva(
  [styles.securityBadge, 'flex items-center gap-6 min-w-0 in-[dl]:justify-end'],
  {
    variants: {
      isSecured: { true: null, false: 'text-negative' },
    },
    defaultVariants: { isSecured: false },
  },
)

// The lock is taller than the text's cap height, and centring on the line box
// leaves it reading low; lift it to sit level with the protocol text (the same
// optical nudge the signal bars get).
const securityIconVariants = cva('shrink-0 transform-[translateY(-1px)]', {
  variants: {
    isSecured: { true: 'text-status-positive' },
  },
})

const chevronVariants = cva(
  [
    'relative z-1 pointer-events-none self-center shrink-0 text-tertiary',
    'transition-transform duration-(--duration-normal) ease-out',
  ],
  {
    variants: {
      isOpen: { true: 'transform-[rotate(180deg)]' },
    },
  },
)

// The rows sit on a dark inset panel below the header (like the live chart and
// bench footer): full card width, square top edge, and the card's overflow
// rounds the bottom. The panel keeps its padding whether open or not, so the
// rows hold their inset for the whole height animation; the wrapper around it
// does the clipping. Its groups (link, addresses, hardware) are split by a
// hairline that runs the card's full width, with a row gap either side.
const DETAILS = 'bg-inset py-(--card-header-padding-y)'

// Keep the subtitle on one line inside the narrow strip (InlineMeta's
// `shouldTruncate`; the security badge's item in ConnectionCard.module.css).
const STRIP_SUB = cx('type-body-default text-secondary', styles.stripSub, 'truncate')

type ConnectionCardProps = {
  info: NetworkInfo
}

// Strongest first: the collapsed strip names the best protocol the network offers.
const SECURITY_PROTOCOLS = ['WPA3', 'WPA2', 'WPA', 'OWE', 'WEP']

function signalBarCount(strength: number): number {
  if (strength >= 80) return 4
  if (strength >= 55) return 3
  if (strength >= 35) return 2
  return 1
}

type SignalLevel = 'good' | 'fair' | 'poor'

function signalLevel(strength: number): SignalLevel {
  if (strength >= 55) return 'good'
  if (strength >= 35) return 'fair'
  return 'poor'
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

function SignalMeter({
  strength,
  placement,
}: {
  strength: number
  placement: VariantOf<typeof signalMeterVariants, 'placement'>
}): JSX.Element {
  const label = formatSignalStrength(strength)
  const filledBars = signalBarCount(strength)

  return (
    <div
      className={signalMeterVariants({ level: signalLevel(strength), placement })}
      role="meter"
      aria-label={`Wi‑Fi signal: ${label}`}
      aria-valuenow={strength}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* A size up beside the strip's title; as tall as the text's capitals in the Signal row. */}
      <BarMeter value={filledBars} size={placement === 'strip' ? 'md' : 'sm'} />
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
    <Tooltip content={description} shouldDescribe={false}>
      <span className={securityBadgeVariants({ isSecured })}>
        {isSecured ? (
          <LockIcon size={12} className={securityIconVariants({ isSecured })} />
        ) : (
          <UnlockIcon size={12} className={securityIconVariants({ isSecured })} />
        )}
        <span className="min-w-0 overflow-hidden text-ellipsis" aria-hidden>
          {label}
        </span>
        {/* The hint isn't announced here; the full description is. */}
        <span className="sr-only">{description}</span>
      </span>
    </Tooltip>
  )
}

function WifiLinkRows({
  info,
  linkSpeed,
}: {
  info: WifiNetworkInfo
  linkSpeed: string | null
}): JSX.Element {
  return (
    <>
      {/* The strip's title falls back to "WiFi Network" when the OS withholds
          the name (e.g. without location permission); here the row just drops. */}
      <DataRow label="Network name" value={info.ssid || null} />
      <DataRow label="Signal" align="center">
        {/* Block flex (not inline-flex) avoids extra line-box strut height inside
            .type-number-default, which would misalign the bars with the label text. The
            bars have no text, so baseline alignment sits their bottom on the
            text's baseline, and at 10px they reach its capitals. */}
        <div className="flex items-baseline justify-end gap-6">
          {info.signalStrength != null && (
            <SignalMeter strength={info.signalStrength} placement="details" />
          )}
          {formatSignalDetail(info)}
        </div>
      </DataRow>
      {linkSpeed && <DataRow label="Link speed" value={linkSpeed} />}
      <DataRow label="Band" value={formatBand(info.frequency)} />
      <DataRow label="Channel" value={formatChannel(info.channel, info.frequency)} />
      <DataRow label="Standard" value={formatWifiStandard(info.wifiStandard)} />
      {isSecuredWifi(info.security) != null ? (
        <DataRow label="Security" align="center">
          <SecurityBadge security={info.security} />
        </DataRow>
      ) : (
        <DataRow label="Security" value="—" />
      )}
    </>
  )
}

function EthernetLinkRows({
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
  const titleId = useId()

  return (
    // Named by its own heading, as it has no CardHeader.
    <Card aria-labelledby={titleId}>
      {/* The strip's toggle expands the whole card, so focus rings the card
          (strip and, when open, the details) just inside its rounded edge. */}
      <Collapsible isOpen={isExpanded} onOpenChange={toggleExpanded} hasFocusFrame className="rounded-[inherit]">
        <div
          className={cx(
            'relative flex items-start gap-12 w-full text-left',
            'min-h-(--card-header-min-height) py-(--card-header-padding-y) px-(--card-header-padding-x)',
            'transition-[background] duration-(--duration-fast) ease-in-out hover:bg-fill-hover',
            'has-[[data-collapsible-trigger]:focus-visible]:bg-fill-hover',
          )}
        >
          {/* A transparent full-strip button keeps the whole row one expand target
              without wrapping the QR button inside another button (invalid HTML).
              The content above it stays click-through so the overlay still toggles;
              the QR button opts back in and handles its own click. */}
          <CollapsibleTrigger
            className="absolute inset-0 z-0 cursor-pointer"
            aria-label="Connection details"
          />
          <IconTile
            size="lg"
            color={STRIP_ICON_COLORS[display.variant]}
            className="relative z-1 pointer-events-none self-center"
            icon={<ConnectionIcon variant={display.variant} />}
          />
          <div className="relative z-1 pointer-events-none flex flex-1 flex-col gap-2 min-w-0 py-2">
            <h2 id={titleId} className="type-heading-large text-primary truncate">
              {display.title}
            </h2>
            <div className={STRIP_SUB}>
              {subItems.length > 0 ? <InlineMeta items={subItems} shouldTruncate /> : display.subtitle}
            </div>
          </div>
          {isWifiNetwork(info) && (
            // Raised above the toggle, so it takes its own click.
            <span className="relative z-1 inline-flex self-center shrink-0">
              <ShareWifiButton />
            </span>
          )}
          {isWifiNetwork(info) && info.signalStrength != null && (
            <SignalMeter strength={info.signalStrength} placement="strip" />
          )}
          <ChevronDownIcon
            size={14}
            className={chevronVariants({ isOpen: isExpanded })}
            aria-hidden
          />
        </div>

        <CollapsiblePanel>
          {/* Grouped by topic: the link itself, then the addresses from the
              device outward, then the hardware it runs over. */}
          <div className={DETAILS}>
            <DataListStack>
              {isWifiNetwork(info) && (
                <DataList density="compact">
                  <WifiLinkRows info={info} linkSpeed={linkSpeed} />
                </DataList>
              )}
              {isEthernetNetwork(info) && (
                <DataList density="compact">
                  <EthernetLinkRows info={info} linkSpeed={linkSpeed} />
                </DataList>
              )}
              <DataList density="compact">
                <DataRow label="IP address" value={formatDisplayValue(info.ipAddress)} />
                <DataRow label="Gateway" value={formatDisplayValue(info.gateway)} />
                {info.dns.length > 0 && (
                  <DataRow label="DNS" value={formatDisplayValue(info.dns.join(', '))} />
                )}
                <DataRow
                  label="Public IP"
                  value={publicIp ?? (isPublicIpLoading ? 'Checking…' : null)}
                />
              </DataList>
              <DataList density="compact">
                {isEthernetNetwork(info) && (
                  <>
                    <DataRow label="Adapter" value={formatDisplayValue(info.product)} />
                    <DataRow label="Vendor" value={formatDisplayValue(info.vendor)} />
                  </>
                )}
                <DataRow label="Interface" value={formatDisplayValue(info.interfaceName)} />
                <DataRow label="MAC" value={formatMac(info.macAddress)} />
              </DataList>
            </DataListStack>
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  )
},
(previous, next) => isNetworkInfoEqual(previous.info, next.info))

export function canRunSpeedTest(info: NetworkInfo): boolean {
  return isConnectedNetwork(info)
}
