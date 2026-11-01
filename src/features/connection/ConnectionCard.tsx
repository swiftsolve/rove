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
import { DataList, DataRow } from '@/components/DataRow'
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
import styles from './ConnectionCard.module.css'

// The connection glyph's chip, tinted by the kind of connection.
const stripIconVariants = cva(
  [
    'relative z-1 pointer-events-none self-center shrink-0',
    'flex items-center justify-center size-[36px] rounded-sm',
  ],
  {
    variants: {
      variant: {
        wifi: 'text-series-down bg-[color-mix(in_srgb,currentColor_var(--opacity-tint-sm),transparent)]',
        ethernet: 'text-status-positive bg-[color-mix(in_srgb,currentColor_var(--opacity-tint-sm),transparent)]',
        disconnected: 'text-status-negative bg-[color-mix(in_srgb,currentColor_var(--opacity-tint-xs),transparent)]',
      },
    },
  },
)

const signalMeterVariants = cva('flex items-center gap-8', {
  variants: {
    level: { good: 'text-status-positive', fair: 'text-status-warning', weak: 'text-status-negative' },
    /** Beside the strip's title, or inside the expanded Signal row. */
    placement: { strip: 'relative z-1 pointer-events-none self-center shrink-0', details: null },
  },
})

const signalBarsVariants = cva('inline-flex items-end', {
  variants: {
    // Beside the strip's title, a size up; in the Signal row, as tall as the
    // text's capitals.
    placement: {
      strip: 'gap-2 h-[11px]',
      details: 'gap-2 h-10',
    },
  },
})

// The same bars as the Home capability strip (CapabilityMeter's `isCompact`):
// whole-pixel sizes so they stay sharp, with ends rounded at half the width.
// The strip's are a size up.
const signalBarVariants = cva('', {
  variants: {
    placement: { strip: 'w-[3px] rounded-[1.5px]', details: 'w-2 rounded-[1px]' },
    isOn: {
      true: 'bg-current',
      false: 'bg-[color-mix(in_srgb,currentColor_var(--opacity-unlit),transparent)]',
    },
  },
})

const SIGNAL_BAR_HEIGHTS = {
  strip: ['h-[5px]', 'h-[7px]', 'h-[9px]', 'h-[11px]'],
  // The tallest rounds the value text's cap height (9.46px in Inter at 13px) up to
  // a whole pixel; 9px read short.
  details: ['h-4', 'h-6', 'h-8', 'h-10'],
}

// Lock + protocol, green when secured, red when open. A block flex box (not
// inline-flex) so the lock centres on the text instead of sitting on the line's
// baseline, which drops it a couple of pixels low. In the expanded rows (the
// details' <dl>) it right-aligns in the value cell.
const securityBadgeVariants = cva(
  [styles.securityBadge, 'flex items-center gap-4 min-w-0 in-[dl]:justify-end'],
  {
    variants: {
      isSecured: { true: null, false: 'text-negative' },
    },
  },
)

// The lock is taller than the text's cap height, and centring on the line box
// leaves it reading low; lift it to sit level with the protocol text (the same
// optical nudge the signal bars get).
const securityIconVariants = cva('shrink-0 transform-[translateY(-1px)]', {
  variants: {
    isSecured: { true: 'text-status-positive', false: null },
  },
})

const chevronVariants = cva(
  [
    'relative z-1 pointer-events-none self-center shrink-0 text-tertiary',
    'transition-transform duration-(--duration-normal) ease-out',
  ],
  {
    variants: {
      isOpen: { true: 'transform-[rotate(180deg)]', false: null },
    },
  },
)

const detailsWrapVariants = cva(
  'grid transition-[grid-template-rows] duration-(--duration-normal) ease-out',
  {
    variants: {
      isOpen: { true: 'grid-rows-[1fr]', false: 'grid-rows-[0fr]' },
    },
  },
)

// The rows sit on a dark inset panel below the header (like the live chart and
// bench footer): full card width, square top edge, and the card's overflow
// rounds the bottom. The panel keeps its padding whether open or not, so the
// rows hold their inset for the whole height animation; the wrapper around it
// does the clipping. Its groups (link, addresses, hardware) are split by a
// hairline that runs the card's full width, with a row gap either side.
const DETAILS = cx(
  styles.details,
  'row-list bg-inset py-(--section-header-padding-y)',
  'divide-y divide-line [&>dl:not(:first-child)]:pt-12 [&>dl:not(:last-child)]:pb-12',
)

// A group carries the side inset (so the hairlines between groups don't) and
// the interface cards' tighter rhythm; `row-list` keeps its first row's top and
// last row's bottom at 0.
const DETAILS_GROUP = cx(
  'row-list px-(--section-body-padding)',
  '[&>.data-row:not(:first-child)]:pt-4 [&>.data-row:not(:last-child)]:pb-4',
)

// Keep the subtitle on one line inside the narrow strip: a flex row when it's
// an InlineMeta, so its items can shrink (see ConnectionCard.module.css).
const STRIP_SUB = cx('text-body-secondary', styles.stripSub, 'truncate [&.inline-meta]:flex')

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

function SignalMeter({
  strength,
  placement,
}: {
  strength: number
  placement: 'strip' | 'details'
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
      <span className={signalBarsVariants({ placement })} aria-hidden>
        {SIGNAL_BARS.map((bar) => (
          <span
            key={bar}
            className={cx(
              signalBarVariants({ placement, isOn: bar < filledBars }),
              SIGNAL_BAR_HEIGHTS[placement][bar],
            )}
          />
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
    <span className={securityBadgeVariants({ isSecured })} title={description}>
      {isSecured ? (
        <LockIcon size={12} className={securityIconVariants({ isSecured })} />
      ) : (
        <UnlockIcon size={12} className={securityIconVariants({ isSecured })} />
      )}
      <span className="min-w-0 overflow-hidden text-ellipsis" aria-hidden>
        {label}
      </span>
      {/* The hover title isn't announced; the full description is. */}
      <span className="sr-only">{description}</span>
    </span>
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
      <DataRow label="Signal">
        {/* Block flex (not inline-flex) avoids extra line-box strut height inside
            .text-value, which would misalign the bars with the label text. The
            bars have no text, so baseline alignment sits their bottom on the
            text's baseline, and at 10px they reach its capitals. */}
        <div className={cx(styles.signalDetail, 'flex items-baseline justify-end gap-8')}>
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
        <DataRow label="Security">
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
  const detailsId = useId()

  return (
    // The card's focus frame: the strip's toggle expands the whole card, so focus
    // rings the card (strip and, when open, the details) just inside its edge.
    <section
      className={cx(
        'bg-panel rounded-lg shadow-panel overflow-hidden',
        'has-[>div>button:focus-visible]:[outline:var(--focus-outline)]',
        'has-[>div>button:focus-visible]:outline-offset-(--focus-inset)',
      )}
      aria-labelledby={titleId}
    >
      <div
        className={cx(
          'relative flex items-start gap-12 w-full text-left',
          'min-h-(--section-header-min-height) py-(--section-header-padding-y) px-(--section-header-padding-x)',
          'transition-[background] duration-(--duration-fast) ease-in-out hover:bg-fill-row-hover',
        )}
      >
        {/* A transparent full-strip button keeps the whole row one expand target
            without wrapping the QR button inside another button (invalid HTML).
            The content above it stays click-through so the overlay still toggles;
            the QR button opts back in and handles its own click. */}
        <button
          type="button"
          className="absolute inset-0 z-0 cursor-pointer focus-visible:outline-none"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          aria-controls={detailsId}
          aria-label="Connection details"
        />
        <div className={stripIconVariants({ variant: display.variant })}>
          <ConnectionIcon variant={display.variant} />
        </div>
        <div className="relative z-1 pointer-events-none flex flex-1 flex-col gap-2 min-w-0 py-2">
          <h2 id={titleId} className="text-title truncate">
            {display.title}
          </h2>
          {subItems.length > 0 ? (
            <InlineMeta className={STRIP_SUB} items={subItems} />
          ) : (
            <div className={STRIP_SUB}>{display.subtitle}</div>
          )}
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

      {/* Collapsed, the rows are clipped to nothing but still in the DOM (for the
          height animation), so hide them from assistive tech too. */}
      <div
        id={detailsId}
        className={detailsWrapVariants({ isOpen: isExpanded })}
        aria-hidden={!isExpanded}
      >
        {/* The grid row's only child, shrinking to nothing when collapsed;
            `min-h-0` lets it go below the panel's padding. */}
        <div className="min-h-0 overflow-hidden">
          {/* Grouped by topic: the link itself, then the addresses from the
              device outward, then the hardware it runs over. */}
          <div className={DETAILS}>
            {isWifiNetwork(info) && (
              <DataList className={DETAILS_GROUP}>
                <WifiLinkRows info={info} linkSpeed={linkSpeed} />
              </DataList>
            )}
            {isEthernetNetwork(info) && (
              <DataList className={DETAILS_GROUP}>
                <EthernetLinkRows info={info} linkSpeed={linkSpeed} />
              </DataList>
            )}
            <DataList className={DETAILS_GROUP}>
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
            <DataList className={DETAILS_GROUP}>
              {isEthernetNetwork(info) && (
                <>
                  <DataRow label="Adapter" value={formatDisplayValue(info.product)} />
                  <DataRow label="Vendor" value={formatDisplayValue(info.vendor)} />
                </>
              )}
              <DataRow label="Interface" value={formatDisplayValue(info.interfaceName)} />
              <DataRow label="MAC" value={formatMac(info.macAddress)} />
            </DataList>
          </div>
        </div>
      </div>
    </section>
  )
},
(previous, next) => isNetworkInfoEqual(previous.info, next.info))

export function canRunSpeedTest(info: NetworkInfo): boolean {
  return isConnectedNetwork(info)
}
