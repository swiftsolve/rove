import type { JSX, ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { CapabilityDefinition, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useNow } from '@/hooks/useNow'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { testStatusText } from '@/features/speed/utils/test-status'
import { CapabilityIcon } from '@/features/capabilities/components/CapabilityIcon'
import { CapabilityMeter } from '@/features/capabilities/components/CapabilityMeter'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import { CAPABILITY_LEVEL_TILE_COLORS } from '@/features/capabilities/utils/capability-level-colors'
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
  Tooltip,
  ZapIcon,
  type IconComponent,
} from '@/ui'

// The row of capabilities bleeds past the card body's padding so it spans the
// full card width, the same pattern as the live throughput chart.
const CAPABILITY_ROW = cx('flex items-center justify-between', '-mx-(--card-body-padding) px-(--card-body-padding)')

// Each capability's column: its icon tile with the rating meter centred beneath.
const CAPABILITY_CELL = 'flex flex-[0_0_auto] flex-col items-center gap-8'

// A dark inset strip flush to the card's bottom edge, full-bleed like
// ConnectionCard's details and the speed test footer. The strip itself isn't
// clickable; only the link inside it is.
const footerVariants = cva(
  [
    'flex items-center justify-end text-xs',
    // Full-bleed to both card edges: the body's content box plus the padding on
    // each side, then negative margins pull it out over that padding.
    'w-[calc(100%+2*var(--card-body-padding))]',
    '-mx-(--card-body-padding) -mb-(--card-body-padding)',
    'bg-inset px-(--card-body-padding) py-(--card-header-padding-y)',
    // The card runs `overflow: visible` (so tooltips can escape), so round the
    // bottom corners here to sit flush inside the card's radius.
    'rounded-b-lg',
  ],
  {
    variants: {
      // The results footer (icon + "Updated …") is taller than the plain hint, so
      // its centred text sits lower and reads as extra space under the bars: its
      // top gap is trimmed a touch. The hint (before any test) pulls in closer
      // still; it doesn't need the breathing room the populated row gets.
      isHint: { true: 'mt-12', false: 'mt-16' },
    },
    defaultVariants: { isHint: false },
  },
)

/** Home's summary of what the connection can handle: a tile per capability,
 *  coloured by the last speed test's rating, each opening its details. */
export function CapabilitiesCard() {
  const capabilities = useSpeedTest((test) => test.capabilities)
  const hasResults = capabilities.length > 0

  return (
    <Card>
      <CardHeader title="Capabilities" icon={<ZapIcon size={15} />} actions={<RunTestButton />} />
      <CardBody>
        {/* Before the first test, every capability shows as a faded placeholder. */}
        <ul role="list" className={CAPABILITY_ROW} aria-hidden={!hasResults || undefined}>
          {hasResults
            ? capabilities.map((capability) => <RatedCapability key={capability.id} capability={capability} />)
            : CAPABILITY_DEFINITIONS.map((capability) => (
                <UnratedCapability key={capability.id} capability={capability} />
              ))}
        </ul>
        <CapabilitiesFooter hasResults={hasResults} />
        <TestStatusAnnouncement />
      </CardBody>
    </Card>
  )
}

/** Starts a test in place; the Speed tab shows the same run (one shared store),
 *  and the footer links there. */
function RunTestButton() {
  const runTest = useSpeedTest((test) => test.runTest)
  const isTesting = useSpeedTest((test) => test.isTesting)
  const hasResults = useSpeedTest((test) => test.capabilities.length > 0)
  const canRunTest = useCanRunSpeedTest()

  return (
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
function RatedCapability({ capability }: { capability: CapabilityRating }) {
  const { navigate } = useNavigation()
  // A test can be started here or from the Speed tab; either way it greys the row.
  const isTesting = useSpeedTest((test) => test.isTesting)
  const levelLabel = CAPABILITY_LEVEL_LABELS[capability.level]

  const openDetails = (): void => {
    navigate({ tab: 'speed', speedSub: { view: 'details', target: capability.id } })
  }

  return (
    <li className={CAPABILITY_CELL}>
      <Tooltip
        content={<InlineMeta items={[capability.label, levelLabel]} />}
        side="top"
        sideOffset={2}
        isDisabled={isTesting}
        // The button's label already says the same.
        shouldDescribe={false}
      >
        {/* Muted and inert while a test runs: the rating is about to change. */}
        <IconTileButton
          color={isTesting ? 'neutral' : CAPABILITY_LEVEL_TILE_COLORS[capability.level]}
          label={`${capability.label}: ${levelLabel}`}
          onClick={openDetails}
          isDisabled={isTesting}
          icon={<CapabilityIcon id={capability.id} size={16} />}
        />
      </Tooltip>
      <CapabilityMeter level={capability.level} shouldShowLabel={false} isCompact isMuted={isTesting} />
    </li>
  )
}

/** A capability before any test: a greyed-out tile with an empty meter. */
function UnratedCapability({ capability }: { capability: CapabilityDefinition }) {
  return (
    <li className={CAPABILITY_CELL}>
      <Tooltip content={capability.label} side="top">
        {/* Faded like a disabled control: nothing to open until a test runs. */}
        <IconTile
          color="neutral"
          className="opacity-(--opacity-disabled)"
          icon={<CapabilityIcon id={capability.id} size={16} />}
        />
      </Tooltip>
      <CapabilityMeter level="unsupported" shouldShowLabel={false} isCompact isMuted />
    </li>
  )
}

/**
 * The footer's link to the Speed page: "Testing…" while a test runs, otherwise
 * when the last result landed. Before the first result, a hint instead.
 */
function CapabilitiesFooter({ hasResults }: { hasResults: boolean }): JSX.Element | null {
  const isTesting = useSpeedTest((test) => test.isTesting)
  const completedAt = useSpeedTest((test) => test.completedAt)

  if (!hasResults) {
    return (
      <div className={footerVariants({ isHint: true })}>
        <OpenSpeedLink>{isTesting ? 'Testing…' : 'Available after speed test'}</OpenSpeedLink>
      </div>
    )
  }
  if (isTesting) {
    return (
      <div className={footerVariants()}>
        <OpenSpeedLink>Testing…</OpenSpeedLink>
      </div>
    )
  }
  if (completedAt == null) return null
  return (
    <div className={footerVariants()}>
      <LastUpdatedLink completedAt={completedAt} />
    </div>
  )
}

/** "Updated 5 min ago", kept current as time passes. */
function LastUpdatedLink({ completedAt }: { completedAt: number }) {
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  return (
    <OpenSpeedLink icon={HistoryIcon}>
      Updated <time dateTime={new Date(completedAt).toISOString()}>{formatTimeAgo(completedAt, now)}</time>
    </OpenSpeedLink>
  )
}

function OpenSpeedLink({ icon, children }: { icon?: IconComponent; children: ReactNode }) {
  const { navigate } = useNavigation()

  return (
    // The pill's padding hangs over the footer's own, so the footer keeps its height.
    <Link className="-my-2" icon={icon} onClick={() => navigate({ tab: 'speed' })}>
      {children}
      {/* The visible text leads the name; this says where the link goes. */}
      <span className="sr-only">, open Speed</span>
    </Link>
  )
}

/** The Speed page's announcements, for a test run from here. Home shows no
 *  failure, so the error is read out too. */
function TestStatusAnnouncement() {
  const isTesting = useSpeedTest((test) => test.isTesting)
  const progress = useSpeedTest((test) => test.progress)
  const internetSpeed = useSpeedTest((test) => test.internetSpeed)
  const error = useSpeedTest((test) => test.error)

  return (
    <p className="sr-only" role="status">
      {error ?? testStatusText(isTesting, progress, internetSpeed)}
    </p>
  )
}
