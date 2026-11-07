import { cva, cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

import { SecurityBadge } from '@/features/connection/components/SecurityBadge'
import { ShareWifiButton } from '@/features/connection/components/ShareWifiButton'
import { SignalMeter } from '@/features/connection/components/SignalMeter'
import {
  type ConnectionDisplayVariant,
  formatLinkSpeed,
  getConnectionDisplay,
} from '@/features/connection/utils/connection-display'
import type { NetworkInfo } from '@/types'
import { isWifiNetwork } from '@/types'
import {
  ChevronDownIcon,
  CollapsibleTrigger,
  EthernetIcon,
  type IconComponent,
  IconTile,
  type IconTileColor,
  InlineMeta,
  OfflineIcon,
  WifiIcon,
} from '@/ui'
import { formatBand } from '@/utils/format'

import styles from './ConnectionStrip.module.css'

// Wi-Fi and Ethernet share the accent, which marks what's yours: a status or
// series colour would read as one medium being better, or as download.
const CONNECTION_ICONS = {
  wifi: { Icon: WifiIcon, color: 'var(--accent-default)' },
  ethernet: { Icon: EthernetIcon, color: 'var(--accent-default)' },
  disconnected: { Icon: OfflineIcon, color: 'var(--status-negative)' },
} as const satisfies Record<ConnectionDisplayVariant, { Icon: IconComponent; color: IconTileColor }>

// Content sits above the stretched toggle but lets clicks fall through to it;
// only the share button opts back in.
const ABOVE_TOGGLE = 'relative z-1 pointer-events-none'

const stripVariants = cva(
  [
    'relative flex w-full items-start gap-12 text-left',
    'min-h-(--card-header-min-height) px-(--card-header-padding-x) py-(--card-header-padding-y)',
  ],
  {
    variants: {
      canExpand: {
        true: [
          'transition-[background] duration-(--duration-fast) ease-in-out hover:bg-overlay-hover',
          'has-[[data-collapsible-trigger]:focus-visible]:bg-overlay-hover',
        ],
      },
    },
  },
)

// Keep the subtitle on one line inside the narrow strip (InlineMeta's
// `shouldTruncate`; the security badge's item in ConnectionStrip.module.css).
const STRIP_SUB = cx('type-body text-secondary', styles.stripSub, 'truncate')

const chevronVariants = cva(
  [ABOVE_TOGGLE, 'shrink-0 self-center text-tertiary transition-transform duration-(--duration-normal) ease-out'],
  {
    variants: {
      isOpen: { true: 'transform-[rotate(180deg)]' },
    },
  },
)

type ConnectionStripProps = {
  info: NetworkInfo
  /** Set on the title, which names the whole card. */
  titleId: string
  /** Unset when there are no details to open, so the strip doesn't expand. */
  isExpanded?: boolean
}

/**
 * The card's always-visible row: the connection's name and icon, a meta line
 * (signal, link speed, band and security on Wi‑Fi; link speed on Ethernet),
 * the Wi‑Fi share button, and the chevron for the details below, when there
 * are any.
 */
export function ConnectionStrip({ info, titleId, isExpanded }: ConnectionStripProps) {
  const display = getConnectionDisplay(info)
  const { Icon, color } = CONNECTION_ICONS[display.variant]
  const metaItems = stripMetaItems(info)
  const canExpand = isExpanded !== undefined

  return (
    <div className={stripVariants({ canExpand })}>
      {/* A button can't hold the share button (invalid HTML), so the toggle
          is an empty button stretched under the row instead. */}
      {canExpand && (
        <CollapsibleTrigger className="absolute inset-0 z-0 cursor-pointer" aria-label="Connection details" />
      )}
      <IconTile size="lg" color={color} className={cx(ABOVE_TOGGLE, 'self-center')} icon={<Icon size={16} />} />
      <div className={cx(ABOVE_TOGGLE, 'flex min-w-0 flex-1 flex-col gap-2 py-2')}>
        <h2 id={titleId} className="type-title truncate text-primary">
          {display.title}
        </h2>
        <div className={STRIP_SUB}>
          {metaItems.length > 0 ? <InlineMeta items={metaItems} shouldTruncate /> : display.subtitle}
        </div>
      </div>
      {isWifiNetwork(info) && (
        // Raised above the toggle, so it takes its own click.
        <span className="relative z-1 inline-flex shrink-0 self-center">
          <ShareWifiButton />
        </span>
      )}
      {canExpand && <ChevronDownIcon size={14} className={chevronVariants({ isOpen: isExpanded })} aria-hidden />}
    </div>
  )
}

/**
 * The meta line's items: the signal first on Wi‑Fi, as it explains the link
 * speed, then band and security. The IP is in the details below. Missing
 * pieces are dropped.
 */
function stripMetaItems(info: NetworkInfo): ReactNode[] {
  const linkSpeed = formatLinkSpeed(info)
  const speedItem = linkSpeed && <span className={styles.linkSpeed}>{linkSpeed}</span>
  const items = isWifiNetwork(info)
    ? [
        info.signalStrength != null && (
          <span className="inline-flex items-center gap-4">
            <SignalMeter strength={info.signalStrength} />
            {info.signalStrength}%
          </span>
        ),
        speedItem,
        formatBand(info.frequency),
        info.security != null && <SecurityBadge security={info.security} isShort className={styles.securityBadge} />,
      ]
    : [speedItem]
  return items.filter(Boolean)
}
