# The Capabilities card

Part 6 of [The Home page, line by line](README.md).

[← The Traffic card](05-traffic-card.md) · [The Usage and Devices cards →](07-usage-and-devices.md)

A row of tiles, one per activity (browsing, HD streaming, gaming…), each coloured by how well the last speed test says your connection handles it. Before any test the tiles are grey.

Lines starting `// →` are this guide's notes; every other line is the real code, including its own comments.

## CapabilitiesCard.tsx

[`src/features/capabilities/CapabilitiesCard.tsx`](../../../src/features/capabilities/CapabilitiesCard.tsx)

The whole card, split into small helper components.

```tsx
// → Joins class names together.
import { cx } from 'class-variance-authority'
// → JSX for return types; useRef keeps a handle on a real page element (the
// → row of tiles).
import { type JSX, useRef } from 'react'

// → Shows "Updated 5 min ago" and keeps it current.
import { UpdatedAgo } from '@/app/components/UpdatedAgo'
// → Lets a click move to another tab.
import { useNavigation } from '@/app/hooks/useNavigation'
// → The icon for each activity, the colour for each rating, and its word
// → ("Excellent", "Fair").
import { CapabilityIcon } from '@/features/capabilities/components/CapabilityIcon'
import { CAPABILITY_LEVEL_TILE_COLORS } from '@/features/capabilities/utils/capability-level-colors'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
// → Whether a test may run now, the shared speed-test memory, and the words a
// → screen reader hears during a test.
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { testStatusText } from '@/features/speed/utils/test-status'
// → The shape of an activity before and after it's rated, and the full list
// → of activities.
import type { CapabilityDefinition, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
// → Library pieces: card parts, icons, buttons, tiles, the tooltip, the link,
// → a screen-reader-only status line, and useRovingFocus.
import {
  Card,
  CardBody,
  CardHeader,
  HistoryIcon,
  IconButton,
  IconTile,
  IconTileButton,
  InlineMeta,
  Link,
  PlayIcon,
  RefreshIcon,
  ScreenReaderStatus,
  Tooltip,
  useRovingFocus,
  ZapIcon,
} from '@/ui'

// Bleeds past the body padding to span the card, like the throughput chart.
// → The row's look: tiles spread evenly across, stretched to the card's
// → edges.
const CAPABILITY_ROW = cx('flex items-center justify-between', '-mx-(--card-body-padding) px-(--card-body-padding)')

// → Each tile's slot keeps its own size.
const CAPABILITY_CELL = 'flex flex-[0_0_auto]'

// → The footer's left text: grey, cut with "…" if long, with a small icon
// → beside it.
const FOOTER_STATUS = 'inline-flex min-w-0 items-center gap-4 truncate text-tertiary'

// Bleeds to the card's edges; the card's own clip rounds its bottom corners.
// Hand-built, not CardFooter: this band pads 14px and sits 16px below the
// tiles, where CardFooter pads 12px under the body's 14px. The same before and
// after a test, so the card keeps its height.
// → The grey band at the bottom, 16px below the tiles, stretched to the
// → card's edges, the same height before and after a test.
const FOOTER = cx(
  'type-caption mt-16 flex items-center justify-between gap-12',
  'w-[calc(100%+2*var(--card-body-padding))]',
  '-mx-(--card-body-padding) -mb-(--card-body-padding)',
  'bg-inset px-(--card-body-padding) py-(--card-header-padding-y)',
)

/**
 * Home's summary of what the connection can handle: a tile per capability,
 * coloured by the last speed test's rating, each opening its details.
 */
// → Starts the card. No inputs: it reads the speed-test memory itself.
export function CapabilitiesCard() {
  // → The ratings from the last test (an empty list before any test).
  const capabilities = useSpeedTest((test) => test.capabilities)
  // → True once there's at least one rating.
  const hasResults = capabilities.length > 0
  // The rated tiles are one Tab stop: the arrow keys move between them.
  // → Makes the tiles one stop for the Tab key; the left and right arrows
  // → then move between tiles.
  const rowRef = useRef<HTMLUListElement>(null)
  useRovingFocus(rowRef, { itemSelector: 'button', orientation: 'horizontal' })

  return (
    <Card>
      // → The header, with the run-test button on the right.
      <CardHeader title="Capabilities" icon={<ZapIcon size={15} />} actions={<RunTestButton />} />
      <CardBody>
        {/* Before the first test the tiles are faded placeholders with no rating
            to read, so screen readers skip them. */}
        // → The row of tiles, as a list. Before any test, screen readers skip
        // → it: the grey tiles have nothing to say.
        <ul ref={rowRef} role="list" className={CAPABILITY_ROW} aria-hidden={!hasResults || undefined}>
          // → With results, a rated tile per rating; without, a grey tile per
          // → activity. `.map` turns each item into a tile; `key` helps React
          // → track each one.
          {hasResults
            ? capabilities.map((capability) => <RatedCapability key={capability.id} capability={capability} />)
            : CAPABILITY_DEFINITIONS.map((capability) => (
                <UnratedCapability key={capability.id} capability={capability} />
              ))}
        </ul>
        // → The grey footer band (CapabilitiesFooter, below).
        <CapabilitiesFooter hasResults={hasResults} />
        // → Invisible: announces a test's progress to screen readers.
        <ScreenReaderTestStatus />
      </CardBody>
    </Card>
  )
}

/** Starts a test in place; the Speed tab shows the same run (one shared store), and the footer links there. */
// → The run-test button. It reads the start function, whether a test is
// → running, whether there are results, and whether a test is allowed now.
function RunTestButton() {
  const runTest = useSpeedTest((test) => test.runTest)
  const isTesting = useSpeedTest((test) => test.isTesting)
  const hasResults = useSpeedTest((test) => test.capabilities.length > 0)
  const canRunTest = useCanRunSpeedTest()

  return (
    // → A small icon button: a play icon ("Run speed test") before any test,
    // → a refresh icon ("Run speed test again") after. It spins while testing
    // → and is disabled when a test can't run. `void runTest()` starts the
    // → test without waiting for it.
    <IconButton
      label={hasResults ? 'Run speed test again' : 'Run speed test'}
      icon={hasResults ? RefreshIcon : PlayIcon}
      iconSize={14}
      tooltip={isTesting ? 'Speed test running' : undefined}
      tooltipSide="left"
      isLoading={isTesting}
      isDisabled={!canRunTest}
      onClick={() => void runTest()}
    />
  )
}

/** A tested capability: its tile, coloured by the rating, opens its details. */
// → One tile for one rated activity.
function RatedCapability({ capability }: { capability: CapabilityRating }) {
  // → The function that changes tabs.
  const { navigate } = useNavigation()
  // A test can be started here or from the Speed tab; either way it greys the row.
  // → Whether a test is running, from this card or the Speed tab.
  const isTesting = useSpeedTest((test) => test.isTesting)
  // → The rating's word, like "Good".
  const levelLabel = CAPABILITY_LEVEL_LABELS[capability.level]

  // → What a click does: open the Speed tab's details page at this activity.
  const openDetails = (): void => {
    navigate({ tab: 'speed', speedSub: { view: 'details', target: capability.id } })
  }

  return (
    <li className={CAPABILITY_CELL}>
      // → A tooltip above the tile, "4K Streaming • Good", off during a test.
      // → shouldDescribe={false} stops screen readers reading it twice.
      <Tooltip
        content={<InlineMeta items={[capability.label, levelLabel]} />}
        side="top"
        sideOffset={2}
        isDisabled={isTesting}
        // The button's label already says the same.
        shouldDescribe={false}
      >
        {/* Muted and inert while a test runs: the rating is about to change. */}
        // → The clickable tile: the rating's colour, or grey during a test.
        // → Screen readers hear its label, like "4K Streaming: Good". It
        // → can't be clicked during a test, because the rating is about to
        // → change.
        <IconTileButton
          color={isTesting ? 'neutral' : CAPABILITY_LEVEL_TILE_COLORS[capability.level]}
          label={`${capability.label}: ${levelLabel}`}
          onClick={openDetails}
          isDisabled={isTesting}
          icon={<CapabilityIcon id={capability.id} size={16} />}
        />
      </Tooltip>
    </li>
  )
}

/** A capability before any test: a greyed-out tile. */
// → One tile before any test.
function UnratedCapability({ capability }: { capability: CapabilityDefinition }) {
  return (
    <li className={CAPABILITY_CELL}>
      // → A tooltip naming the activity.
      <Tooltip content={capability.label} side="top">
        {/* Faded like a disabled control: nothing to open until a test runs. */}
        // → A grey tile, faded like a disabled control. Not clickable:
        // → there's nothing to open yet.
        <IconTile
          color="neutral"
          className="opacity-(--opacity-disabled)"
          icon={<CapabilityIcon id={capability.id} size={16} />}
        />
      </Tooltip>
    </li>
  )
}

/**
 * The footer: the results' status on the left ("Updated 5 min ago",
 * "Testing…", or a hint before the first test) and a link to the Speed page
 * on the right.
 */
// → The band, holding the status and the link.
function CapabilitiesFooter({ hasResults }: { hasResults: boolean }): JSX.Element {
  return (
    <div className={FOOTER}>
      <FooterStatus hasResults={hasResults} />
      <OpenSpeedLink />
    </div>
  )
}

// → The status reads whether a test is running, and when the last one
// → finished.
function FooterStatus({ hasResults }: { hasResults: boolean }): JSX.Element | null {
  const isTesting = useSpeedTest((test) => test.isTesting)
  const completedAt = useSpeedTest((test) => test.completedAt)

  // → During a test: "Testing…".
  if (isTesting) return <span className={FOOTER_STATUS}>Testing…</span>
  // → Before any test: "Not tested yet".
  if (!hasResults) return <span className={FOOTER_STATUS}>Not tested yet</span>
  // → No finish time known: show nothing.
  if (completedAt == null) return null
  // → Otherwise a clock icon and "Updated 5 min ago".
  return (
    <span className={FOOTER_STATUS}>
      <HistoryIcon size={13} />
      <UpdatedAgo timestamp={completedAt} />
    </span>
  )
}

// → The "Speed test ›" link that opens the Speed tab.
function OpenSpeedLink() {
  const { navigate } = useNavigation()

  return (
    // The pill's padding hangs over the footer's own, so the footer keeps its height.
    <Link className="-my-2 ml-auto" onClick={() => navigate({ tab: 'speed' })}>
      Speed test
    </Link>
  )
}

/** Screen-reader only: reads out a test run from here, as the Speed page does. Home shows no failure, so the error is read out too. */
// → Reads everything needed to describe the test's state.
function ScreenReaderTestStatus() {
  const isTesting = useSpeedTest((test) => test.isTesting)
  const progress = useSpeedTest((test) => test.progress)
  const internetSpeed = useSpeedTest((test) => test.internetSpeed)
  const error = useSpeedTest((test) => test.error)

  // → Says the error if there is one; otherwise words like "Testing
  // → download". `??` means "use the left side, or the right if the left is
  // → empty".
  return <ScreenReaderStatus>{error ?? testStatusText(isTesting, progress, internetSpeed)}</ScreenReaderStatus>
}
```

[← The Traffic card](05-traffic-card.md) · [The Usage and Devices cards →](07-usage-and-devices.md)
