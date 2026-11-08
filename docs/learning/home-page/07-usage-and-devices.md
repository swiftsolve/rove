# The Usage and Devices cards

Part 7 of [The Home page, line by line](README.md).

[← The Capabilities card](06-capabilities-card.md) · [Glossary →](08-glossary.md)

The two small cards at the bottom share one layout: a title over a single readout, with the whole card a link to its tab.

Lines starting `// →` are this guide's notes; every other line is the real code, including its own comments.

## StatCard.tsx

[`src/features/home/components/StatCard.tsx`](../../../src/features/home/components/StatCard.tsx)

The shared layout.

```tsx
// → The class joiner, and "anything React can draw".
import { cx } from 'class-variance-authority'
import type { ReactNode } from 'react'

// → Library pieces: card parts, the down/up arrow, the "no value" dash, the
// → number display, and the small coloured dot.
import { Card, CardBody, CardHeader, DirectionIcon, NoValue, Readout, StatusDot } from '@/ui'

// One figure's line tall whatever it holds (the value, a spinner, a placeholder
// or a button), so swapping them never resizes the card or the row.
// → The readout's space is always one big figure tall, whatever it holds, so
// → the card never changes size.
const READOUT_AREA = cx(
  'flex flex-col whitespace-nowrap',
  'h-[calc(var(--type-stat-size)*var(--type-stat-line-height))]',
)

// → What the card is given: icon, title, the link's spoken name, what to do
// → on a click, whether it's loading, and the readout itself (children).
type StatCardProps = {
  icon: ReactNode
  title: string
  /** Name of the card's link: the readout in words, then where it goes. */
  linkLabel: string
  /** Navigate into the tab when the card is tapped. */
  onOpen: () => void
  /** The readout is loading (e.g. a device scan in flight). */
  isLoading?: boolean
  /** The readout. It may hold its own control, which sits beside the card's link rather than inside it. */
  children: ReactNode
}

/** One of the small summary cards on Home: a title over a readout, opening its tab. */
// → Starts the layout.
export function StatCard({ icon, title, linkLabel, onOpen, isLoading, children }: StatCardProps) {
  return (
    // → A card that acts as one big link. linkLabel is what a screen reader
    // → says for it; aria-busy tells screen readers it's loading.
    <Card onOpen={onOpen} linkLabel={linkLabel} aria-busy={isLoading || undefined}>
      // → The title and its icon.
      <CardHeader title={title} icon={icon} />
      <CardBody>
        // → The readout, in its fixed-height space.
        <div className={READOUT_AREA}>{children}</div>
      </CardBody>
    </Card>
  )
}

// → What a readout takes: its marker (a down or up arrow, or the green
// → "online" dot), the value and the unit.
type StatReadoutProps = {
  /** What marks the value: a download/upload arrow, or the green "online" dot. */
  marker: 'down' | 'up' | 'online'
  value: string
  unit: string
  className?: string
}

/** A compact value behind its marker. */
export function StatReadout({ marker, value, unit, className }: StatReadoutProps) {
  // The small dot needs more room before the count than the arrows do, but
  // the count and its unit keep the readout's gap.
  // → Picks the marker: the green dot for "online", otherwise the arrow.
  const icon =
    marker === 'online' ? <StatusDot tone="positive" className="mr-4" /> : <DirectionIcon series={marker} size={12} />
  // → Draws the marker, value and unit, small.
  return <Readout size="compact" icon={icon} value={value} unit={unit} className={className} />
}

/** The "no reading" body: a NoValue bar where the value would be, at the value's size. */
// → What shows when there's no number: a dash at the number's size, hidden
// → from screen readers.
export function EmptyStatReadout() {
  return (
    <span className="type-stat" aria-hidden>
      <NoValue />
    </span>
  )
}
```

## UsageCard.tsx

[`src/features/home/components/UsageCard.tsx`](../../../src/features/home/components/UsageCard.tsx)

Today's data use.

```tsx
// → Tab navigation, the shared small-card layout, the usage data hook, a
// → helper that picks out today, the calendar icon, and a helper that splits
// → bytes into a value and unit ("4.90" "GB").
import { useNavigation } from '@/app/hooks/useNavigation'
import { EmptyStatReadout, StatCard, StatReadout } from '@/features/home/components/StatCard'
import { useDataUsage } from '@/features/usage/hooks/useDataUsage'
import { todaysUsage } from '@/types'
import { TodayIcon } from '@/ui'
import { splitBytes } from '@/utils/format'

/** Today's download and upload totals; opens the Usage tab. */
// → Starts the card.
export function UsageCard() {
  // → Asks for the data use, and whether it's still loading or failed. This
  // → card and the Usage tab share one answer.
  const { usage, isLoading, error } = useDataUsage()
  // → The function that changes tabs.
  const { navigate } = useNavigation()
  // → Today's totals, if any.
  const today = todaysUsage(usage)
  // No day yet: still loading, or the load failed, and neither is zero use. A
  // load that landed with no day for today is: nothing has moved yet.
  // → True if there's a day for today, or the load finished cleanly with
  // → nothing yet (which really is zero use). Still loading, or failed, isn't
  // → zero.
  const hasTotals = today != null || (!isLoading && error == null)
  // → Today's received and sent bytes, split into value and unit; zero if
  // → none.
  const downloaded = splitBytes(today?.rxBytes ?? 0)
  const uploaded = splitBytes(today?.txBytes ?? 0)
  // → The same numbers in words, for screen readers.
  const summary = hasTotals
    ? `${downloaded.value} ${downloaded.unit} down, ${uploaded.value} ${uploaded.unit} up`
    : 'unavailable'

  return (
    // → The card: calendar icon, title, a spoken name like "Usage: 4.90 GB
    // → down, 600 MB up. Open Usage.", opening the Usage tab, loading while
    // → there's nothing yet.
    <StatCard
      icon={<TodayIcon size={15} />}
      title="Usage"
      linkLabel={`Usage: ${summary}. Open Usage.`}
      onOpen={() => navigate({ tab: 'usage' })}
      isLoading={!hasTotals && isLoading}
    >
      {hasTotals ? (
        // → With totals: download and upload side by side, hidden from screen
        // → readers because the card's spoken name already says them.
        <div className="grid w-full grid-cols-2 gap-8" aria-hidden>
          <StatReadout marker="down" value={downloaded.value} unit={downloaded.unit} />
          <StatReadout marker="up" value={uploaded.value} unit={uploaded.unit} />
        </div>
      // → Without totals: the dash.
      ) : (
        <EmptyStatReadout />
      )}
    </StatCard>
  )
}
```

## DevicesCard.tsx

[`src/features/home/components/DevicesCard.tsx`](../../../src/features/home/components/DevicesCard.tsx)

Devices online.

```tsx
// → The type of a mouse click, used by the Discover button.
import type { MouseEvent } from 'react'

// → Tab navigation, the device scan hook, the shared layout, a button, a
// → spinner, icons, a helper that moves focus to the card's link, and
// → formatCount ("1 device", "3 devices").
import { useNavigation } from '@/app/hooks/useNavigation'
import { useDevices } from '@/features/devices/hooks/useDevices'
import { EmptyStatReadout, StatCard, StatReadout } from '@/features/home/components/StatCard'
import { Button, ButtonSpinner, DevicesIcon, focusCardLink, SearchIcon } from '@/ui'
import { formatCount } from '@/utils/format'

/** How many devices on the network are online; opens the Devices tab. */
// → Starts the card.
export function DevicesCard() {
  // → From the device scan: whether Home may scan by itself, the last scan's
  // → results, whether a scan is running, and a function to start one. The
  // → Devices tab shares this scan.
  const { canHomeAutoScan, lastScan, isScanning, rescan } = useDevices()
  // → The function that changes tabs.
  const { navigate } = useNavigation()
  // → How many devices answered, or null if there's been no scan.
  const onlineCount = lastScan ? lastScan.devices.filter((device) => device.isReachable).length : null
  // Where Home doesn't scan on load, the card offers one until the first scan.
  // → On macOS Home doesn't scan by itself (scanning asks for a permission),
  // → so until the first scan the card offers a Discover button.
  const canDiscover = !canHomeAutoScan && !lastScan && !isScanning

  return (
    // → The card: icon, title, a spoken name, opening the Devices tab,
    // → loading while scanning. onDiscover is set only when Discover should
    // → show.
    <StatCard
      icon={<DevicesIcon size={15} />}
      title="Devices"
      linkLabel={devicesLinkLabel(onlineCount, isScanning)}
      onOpen={() => navigate({ tab: 'devices' })}
      isLoading={isScanning}
    >
      <DevicesCardBody
        onlineCount={onlineCount}
        isScanning={isScanning}
        onDiscover={canDiscover ? () => void rescan() : undefined}
      />
    </StatCard>
  )
}

// → The spoken name: "Scanning for devices. Open Devices.", "Open Devices.",
// → or "16 devices online. Open Devices."
function devicesLinkLabel(onlineCount: number | null, isScanning: boolean): string {
  if (isScanning) return 'Scanning for devices. Open Devices.'
  if (onlineCount === null) return 'Open Devices.'
  return `${formatCount(onlineCount, 'device')} online. Open Devices.`
}

// → What the body is given: the count, whether a scan is running, and the
// → optional Discover action.
type DevicesCardBodyProps = {
  onlineCount: number | null
  /** A scan is in flight, started here or on the Devices page: the scan is shared. */
  isScanning: boolean
  /** Set only when the Discover button should show. */
  onDiscover?: () => void
}

// → Picks what fills the card.
function DevicesCardBody({ onlineCount, isScanning, onDiscover }: DevicesCardBodyProps) {
  // → Scanning: a spinner.
  if (isScanning) return <ScanSpinner />
  // → A count: the green dot, the number and "online", hidden from screen
  // → readers because the card's spoken name says it.
  if (onlineCount !== null) {
    return (
      <div aria-hidden>
        <StatReadout marker="online" value={String(onlineCount)} unit="online" />
      </div>
    )
  }
  // → No scan yet on macOS: the Discover button.
  if (onDiscover) return <DiscoverButton onDiscover={onDiscover} />
  // → Otherwise: the dash.
  return <EmptyStatReadout />
}

/**
 * Centred in the readout's space, which is a compact readout's height, so the
 * card keeps its size when the count replaces it. Anything taller (padding, a
 * min-height) would make the grid row taller.
 */
// → A small grey spinner, centred in the readout's space, so the card keeps
// → its size when the number replaces it.
function ScanSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center" aria-hidden>
      <ButtonSpinner size={14} color="var(--text-secondary)" />
    </div>
  )
}

/**
 * Sits beside the card's link, not inside it, so its click only scans. The
 * spinner replaces it once the scan starts, so focus moves to the card's link
 * rather than being lost.
 */
// → A click first moves keyboard focus to the card's link (the spinner is
// → about to replace the button), then starts the scan.
function DiscoverButton({ onDiscover }: { onDiscover: () => void }) {
  const onClick = (event: MouseEvent<HTMLButtonElement>): void => {
    focusCardLink(event.currentTarget)
    onDiscover()
  }
  return (
    // Raised above the card's stretched link so it takes its own clicks. Taller
    // than the readout, so -my-4 lets it spill into the padding rather than
    // grow the card.
    <div className="flex flex-1 items-center justify-center">
      // → The "Discover" button with a search icon, raised above the card's
      // → link so its click only scans. -my-4 lets it overlap the padding
      // → instead of making the card taller.
      <Button className="relative z-2 -my-4" icon={SearchIcon} onClick={onClick}>
        Discover
      </Button>
    </div>
  )
}
```

[← The Capabilities card](06-capabilities-card.md) · [Glossary →](08-glossary.md)
