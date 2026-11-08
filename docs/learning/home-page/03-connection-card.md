# The network card: `ConnectionCard` and `ConnectionStrip`

Part 3 of [The Home page, line by line](README.md).

[← `HomeView.tsx`](02-home-view.md) · [What opens below it →](04-connection-details.md)

The network card is two files: the box with its open/close behaviour, and the row you always see (icon, network name, meta line, share button and arrow).

Lines starting `// →` are this guide's notes; every other line is the real code, including its own comments.

## ConnectionCard.tsx

[`src/features/connection/ConnectionCard.tsx`](../../../src/features/connection/ConnectionCard.tsx)

The box, and opening and closing the details.

```tsx
// → useId makes a unique id string, used to link the card to its title for
// → screen readers.
import { useId } from 'react'

// → The card's two parts (the strip and the details panel) and two helpers:
// → one remembers whether the card is open, one fetches your public IP.
import { ConnectionDetailsPanel } from '@/features/connection/components/ConnectionDetailsPanel'
import { ConnectionStrip } from '@/features/connection/components/ConnectionStrip'
import { useDetailsExpanded } from '@/features/connection/hooks/useDetailsExpanded'
import { usePublicIp } from '@/features/connection/hooks/usePublicIp'
// → The shape of the network info, and the "are we connected?" check.
import type { NetworkInfo } from '@/types'
import { isConnectedNetwork } from '@/types'
// → Ready-made pieces from Rove's component library: a card box, and a
// → wrapper that opens and closes a panel.
import { Card, Collapsible, CollapsiblePanel } from '@/ui'

// → Says what the card must be given: the network info, nothing else.
type ConnectionCardProps = {
  info: NetworkInfo
}

/** Home's connection card: a strip naming the network, which expands into its link, address and hardware details. */
// → Starts the card and unpacks `info` from what it's given.
export function ConnectionCard({ info }: ConnectionCardProps) {
  // → isExpanded says whether the details are open; toggleExpanded opens or
  // → closes them. The choice is remembered between visits.
  const [isExpanded, toggleExpanded] = useDetailsExpanded()
  // Fetched here rather than in the details, which unmount while closed, so
  // the row is ready when they open.
  // → Starts fetching your public IP, only when connected. `isLoading:
  // → isPublicIpLoading` renames a field as it's unpacked.
  const { publicIp, isLoading: isPublicIpLoading } = usePublicIp(isConnectedNetwork(info))
  // → Makes the unique id that ties the card to its title.
  const titleId = useId()

  // Offline, the details would be three empty address rows, so the strip stands alone.
  // → Offline there's nothing to expand, so the card is just the strip. aria-
  // → labelledby tells screen readers the card is named by its title.
  if (!isConnectedNetwork(info)) {
    return (
      <Card aria-labelledby={titleId}>
        <ConnectionStrip info={info} titleId={titleId} />
      </Card>
    )
  }

  // → Connected: the full card, still named by its title.
  return (
    // Named by its own heading, as it has no CardHeader.
    <Card aria-labelledby={titleId}>
      {/* The strip's toggle expands the whole card, so focus rings the card
          (strip and, when open, the details) just inside its rounded edge. */}
      // → The open/close wrapper: told whether it's open, and what to call on
      // → a click. hasFocusFrame rings the whole card when it has keyboard
      // → focus; rounded-[inherit] keeps that ring's corners matching the
      // → card's.
      <Collapsible isOpen={isExpanded} onOpenChange={toggleExpanded} hasFocusFrame className="rounded-[inherit]">
        // → The always-visible row. It needs isExpanded to turn its arrow.
        <ConnectionStrip info={info} titleId={titleId} isExpanded={isExpanded} />
        // → The part that slides open: the details list, given the network
        // → info and the public IP.
        <CollapsiblePanel>
          <ConnectionDetailsPanel info={info} publicIp={publicIp} isPublicIpLoading={isPublicIpLoading} />
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  )
}
```

## ConnectionStrip.tsx

[`src/features/connection/components/ConnectionStrip.tsx`](../../../src/features/connection/components/ConnectionStrip.tsx)

The row you always see.

```tsx
// → Styling helpers: cx glues class names together; cva builds a recipe that
// → picks classes from options (see the glossary).
import { cva, cx } from 'class-variance-authority'
// → ReactNode means "anything React can draw": text, an element, or nothing.
import type { ReactNode } from 'react'

// → The security badge, the share button, the signal bars, and helpers that
// → turn network info into text.
import { SecurityBadge } from '@/features/connection/components/SecurityBadge'
import { ShareWifiButton } from '@/features/connection/components/ShareWifiButton'
import { SignalMeter } from '@/features/connection/components/SignalMeter'
import {
  type ConnectionDisplayVariant,
  formatLinkSpeed,
  getConnectionDisplay,
} from '@/features/connection/utils/connection-display'
// → The info's shape, and the "is this Wi-Fi?" check.
import type { NetworkInfo } from '@/types'
import { isWifiNetwork } from '@/types'
// → From the library: icons (arrow, Ethernet, offline, Wi-Fi), the icon tile,
// → the clickable toggle, and InlineMeta, which joins items with dots.
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
// → Turns a frequency like 5745 MHz into "5 GHz".
import { formatBand } from '@/utils/format'

// → A small stylesheet for the few things utility classes can't say.
import styles from './ConnectionStrip.module.css'

// Wi-Fi and Ethernet share the accent, which marks what's yours: a status or
// series colour would read as one medium being better, or as download.
// → A lookup table: which icon and colour for each kind of connection. Wi-Fi
// → and Ethernet both use the blue accent; offline uses red. `as const
// → satisfies` checks every kind is covered.
const CONNECTION_ICONS = {
  wifi: { Icon: WifiIcon, color: 'var(--accent-default)' },
  ethernet: { Icon: EthernetIcon, color: 'var(--accent-default)' },
  disconnected: { Icon: OfflineIcon, color: 'var(--status-negative)' },
} as const satisfies Record<ConnectionDisplayVariant, { Icon: IconComponent; color: IconTileColor }>

// Content sits above the stretched toggle but lets clicks fall through to it;
// only the share button opts back in.
// → Classes for content that sits on top of the invisible click area but lets
// → clicks pass through to it.
const ABOVE_TOGGLE = 'relative z-1 pointer-events-none'

// → The row's look. Always: a flex row, 12px gaps, the card header's height
// → and padding. Only when it can open: a hover highlight, also shown when
// → the toggle has keyboard focus.
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
// → The meta line's look: body text in the secondary grey, cut with "…" if
// → it's too long.
const STRIP_SUBTITLE = cx('type-body text-secondary', styles.stripSub, 'truncate')

// → The arrow's look: grey, and it rotates 180 degrees when open, animated.
const chevronVariants = cva(
  [ABOVE_TOGGLE, 'shrink-0 self-center text-tertiary transition-transform duration-(--duration-normal) ease-out'],
  {
    variants: {
      isOpen: { true: 'transform-[rotate(180deg)]' },
    },
  },
)

// → What the strip is given: the network info, the title's id, and optionally
// → whether it's open. No isExpanded means it can't open at all.
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
// → Starts the strip.
export function ConnectionStrip({ info, titleId, isExpanded }: ConnectionStripProps) {
  // → Works out the title (network name), subtitle and kind of connection.
  const display = getConnectionDisplay(info)
  // → Looks up the icon and colour for this kind.
  const { Icon, color } = CONNECTION_ICONS[display.variant]
  // → Builds the meta line's pieces (see stripMetaItems below).
  const metaItems = stripMetaItems(info)
  // → True if the card was told whether it's open, meaning there are details
  // → to show.
  const canExpand = isExpanded !== undefined

  return (
    // → The row itself, styled by the recipe.
    <div className={stripVariants({ canExpand })}>
      // → The 36px square with the coloured icon.
      <IconTile size="lg" color={color} className={cx(ABOVE_TOGGLE, 'self-center')} icon={<Icon size={16} />} />
      // → A column holding the title and the meta line; it takes the
      // → remaining width.
      <div className={cx(ABOVE_TOGGLE, 'flex min-w-0 flex-1 flex-col gap-2 py-2')}>
        // → The network name as a heading. Its id is what the card points at
        // → for its name.
        <h2 id={titleId} className="type-title truncate text-primary">
          {display.title}
        </h2>
        // → The meta line.
        <div className={STRIP_SUBTITLE}>
          // → If there are meta items, show them joined by dots; otherwise a
          // → plain subtitle (for example when offline). `a ? b : c` means
          // → "if a then b, else c".
          {metaItems.length > 0 ? <InlineMeta items={metaItems} shouldTruncate /> : display.subtitle}
        </div>
      </div>
      // → On Wi-Fi only, the QR-code share button, raised above the click
      // → area so pressing it doesn't also open the card.
      {isWifiNetwork(info) && (
        // Raised above the toggle, so it takes its own click.
        <span className="relative z-1 inline-flex shrink-0 self-center">
          <ShareWifiButton />
        </span>
      )}
      {/* A button can't hold the share button (invalid HTML), so the toggle
          is an empty button stretched under the row instead. It comes last,
          where the chevron is, so a screen reader reaches the details right
          after it and Tab goes share, then toggle. */}
      // → The invisible full-row button. `absolute inset-0` stretches it over
      // → the whole row. Screen readers call it "Connection details".
      {canExpand && (
        <CollapsibleTrigger className="absolute inset-0 z-0 cursor-pointer" aria-label="Connection details" />
      )}
      // → The down arrow, rotated when open. aria-hidden hides it from screen
      // → readers since it's decoration.
      {canExpand && <ChevronDownIcon size={14} className={chevronVariants({ isOpen: isExpanded })} aria-hidden />}
    </div>
  )
}

/**
 * The meta line's items: the signal first on Wi‑Fi, as it explains the link
 * speed, then band and security. The IP is in the details below. Missing
 * pieces are dropped.
 */
// → A helper that returns the meta line's pieces as a list.
function stripMetaItems(info: NetworkInfo): ReactNode[] {
  // → Text like "1.2 Gbps", wrapped in a span if there is one. `a && b` gives
  // → b only when a exists.
  const linkSpeed = formatLinkSpeed(info)
  const speedItem = linkSpeed && <span className={styles.linkSpeed}>{linkSpeed}</span>
  // → Not Wi-Fi (so Ethernet): the line is just the speed. filter(Boolean)
  // → drops empty entries.
  if (!isWifiNetwork(info)) return [speedItem].filter(Boolean)

  // → If the signal strength is known: the bars, then the percent, 4px apart.
  const signalItem = info.signalStrength != null && (
    <span className="inline-flex items-center gap-4">
      <SignalMeter strength={info.signalStrength} />
      {info.signalStrength}%
    </span>
  )
  // → If the security type is known: a short badge, a lock and "WPA3".
  const securityItem = info.security != null && (
    <SecurityBadge security={info.security} isShort className={styles.securityBadge} />
  )
  // → The four pieces in order, with any missing ones dropped.
  return [signalItem, speedItem, formatBand(info.frequency), securityItem].filter(Boolean)
}
```

[← `HomeView.tsx`](02-home-view.md) · [What opens below it →](04-connection-details.md)
