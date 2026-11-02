import type { ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { NetworkInfo } from '@/types'
import { isWifiNetwork } from '@/types'
import {
  formatLinkSpeed,
  getConnectionDisplay,
  type ConnectionDisplayVariant,
} from '@/features/connection/utils/connection-display'
import { formatBand } from '@/lib/format'
import {
  ChevronDownIcon,
  CollapsibleTrigger,
  EthernetIcon,
  IconTile,
  InlineMeta,
  OfflineIcon,
  WifiIcon,
  type IconComponent,
  type IconTileColor,
} from '@/ui'
import { SecurityBadge } from '@/features/connection/components/SecurityBadge'
import { ShareWifiButton } from '@/features/connection/components/ShareWifiButton'
import { SignalMeter } from '@/features/connection/components/SignalMeter'
import styles from './ConnectionStrip.module.css'

// Each kind of connection's icon, on a tile in its colour.
const CONNECTION_ICONS = {
  wifi: { Icon: WifiIcon, color: 'var(--series-down)' },
  ethernet: { Icon: EthernetIcon, color: 'var(--status-positive)' },
  disconnected: { Icon: OfflineIcon, color: 'var(--status-negative)' },
} as const satisfies Record<ConnectionDisplayVariant, { Icon: IconComponent; color: IconTileColor }>

// The whole strip is one expand toggle: a transparent button under everything
// else. The content sits above it but lets clicks fall through, so the toggle
// still takes them; only the share button opts back in.
const ABOVE_TOGGLE = 'relative z-1 pointer-events-none'

const STRIP = cx(
  'relative flex items-start gap-12 w-full text-left',
  'min-h-(--card-header-min-height) py-(--card-header-padding-y) px-(--card-header-padding-x)',
  'transition-[background] duration-(--duration-fast) ease-in-out hover:bg-fill-hover',
  'has-[[data-collapsible-trigger]:focus-visible]:bg-fill-hover',
)

// Keep the subtitle on one line inside the narrow strip (InlineMeta's
// `shouldTruncate`; the security badge's item in ConnectionStrip.module.css).
const STRIP_SUB = cx('type-body-default text-secondary', styles.stripSub, 'truncate')

const chevronVariants = cva(
  [
    ABOVE_TOGGLE,
    'self-center shrink-0 text-tertiary transition-transform duration-(--duration-normal) ease-out',
  ],
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
  isExpanded: boolean
}

/**
 * The card's always-visible row: the connection's name and icon, a meta line
 * (IP, then band and security or link speed), the Wi‑Fi share button and
 * signal, and the chevron for the details below.
 */
export function ConnectionStrip({ info, titleId, isExpanded }: ConnectionStripProps): JSX.Element {
  const display = getConnectionDisplay(info)
  const { Icon, color } = CONNECTION_ICONS[display.variant]
  const metaItems = stripMetaItems(info)

  return (
    <div className={STRIP}>
      {/* A button can't hold the share button (invalid HTML), so the toggle
          is an empty button stretched under the row instead. */}
      <CollapsibleTrigger className="absolute inset-0 z-0 cursor-pointer" aria-label="Connection details" />
      <IconTile size="lg" color={color} className={cx(ABOVE_TOGGLE, 'self-center')} icon={<Icon size={16} />} />
      <div className={cx(ABOVE_TOGGLE, 'flex flex-1 flex-col gap-2 min-w-0 py-2')}>
        <h2 id={titleId} className="type-heading-large text-primary truncate">
          {display.title}
        </h2>
        <div className={STRIP_SUB}>
          {metaItems.length > 0 ? <InlineMeta items={metaItems} shouldTruncate /> : display.subtitle}
        </div>
      </div>
      {isWifiNetwork(info) && (
        <>
          {/* Raised above the toggle, so it takes its own click. */}
          <span className="relative z-1 inline-flex self-center shrink-0">
            <ShareWifiButton />
          </span>
          {info.signalStrength != null && (
            <SignalMeter strength={info.signalStrength} placement="strip" className={ABOVE_TOGGLE} />
          )}
        </>
      )}
      <ChevronDownIcon size={14} className={chevronVariants({ isOpen: isExpanded })} aria-hidden />
    </div>
  )
}

/** The meta line's items: the IP, then band and security on Wi‑Fi or link
 *  speed otherwise. Missing pieces are dropped. */
function stripMetaItems(info: NetworkInfo): ReactNode[] {
  const items = isWifiNetwork(info)
    ? [
        info.ipAddress,
        formatBand(info.frequency),
        info.security != null && (
          <SecurityBadge security={info.security} isShort className={styles.securityBadge} />
        ),
      ]
    : [info.ipAddress, formatLinkSpeed(info)]
  return items.filter(Boolean)
}
