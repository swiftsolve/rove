import { cva, cx } from 'class-variance-authority'
import type { JSX } from 'react'

import { UpdatedAgo } from '@/app/components/UpdatedAgo'
import { useNavigation } from '@/app/hooks/useNavigation'
import { CapabilityIcon } from '@/features/capabilities/components/CapabilityIcon'
import { CAPABILITY_LEVEL_TILE_COLORS } from '@/features/capabilities/utils/capability-level-colors'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { testStatusText } from '@/features/speed/utils/test-status'
import type { CapabilityDefinition, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
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
  ZapIcon,
} from '@/ui'

// Bleeds past the body padding to span the card, like the throughput chart.
const CAPABILITY_ROW = cx('flex items-center justify-between', '-mx-(--card-body-padding) px-(--card-body-padding)')

const CAPABILITY_CELL = 'flex flex-[0_0_auto]'

// Bleeds to the card's edges; the card's own clip rounds its bottom corners.
// Hand-built, not CardFooter: this band pads 14px and sits 12 or 16px below
// the tiles, where CardFooter pads 12px under the body's 14px.
const FOOTER_STATUS = 'inline-flex min-w-0 items-center gap-4 truncate text-tertiary'

const footerVariants = cva(
  [
    'type-caption flex items-center justify-between gap-12',
    'w-[calc(100%+2*var(--card-body-padding))]',
    '-mx-(--card-body-padding) -mb-(--card-body-padding)',
    'bg-inset px-(--card-body-padding) py-(--card-header-padding-y)',
  ],
  {
    variants: {
      isHint: { true: 'mt-12', false: 'mt-16' },
    },
    defaultVariants: { isHint: false },
  },
)

/**
 * Home's summary of what the connection can handle: a tile per capability,
 * coloured by the last speed test's rating, each opening its details.
 */
export function CapabilitiesCard() {
  const capabilities = useSpeedTest((test) => test.capabilities)
  const hasResults = capabilities.length > 0

  return (
    <Card>
      <CardHeader title="Capabilities" icon={<ZapIcon size={15} />} actions={<RunTestButton />} />
      <CardBody>
        {/* Before the first test the tiles are faded placeholders with no rating
            to read, so screen readers skip them. */}
        <ul role="list" className={CAPABILITY_ROW} aria-hidden={!hasResults || undefined}>
          {hasResults
            ? capabilities.map((capability) => <RatedCapability key={capability.id} capability={capability} />)
            : CAPABILITY_DEFINITIONS.map((capability) => (
                <UnratedCapability key={capability.id} capability={capability} />
              ))}
        </ul>
        <CapabilitiesFooter hasResults={hasResults} />
        <ScreenReaderTestStatus />
      </CardBody>
    </Card>
  )
}

/** Starts a test in place; the Speed tab shows the same run (one shared store), and the footer links there. */
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
    </li>
  )
}

/** A capability before any test: a greyed-out tile. */
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
    </li>
  )
}

/**
 * The footer: the results' status on the left ("Updated 5 min ago",
 * "Testing…", or a hint before the first test) and a link to the Speed page
 * on the right.
 */
function CapabilitiesFooter({ hasResults }: { hasResults: boolean }): JSX.Element {
  return (
    <div className={footerVariants({ isHint: !hasResults })}>
      <FooterStatus hasResults={hasResults} />
      <OpenSpeedLink />
    </div>
  )
}

function FooterStatus({ hasResults }: { hasResults: boolean }): JSX.Element | null {
  const isTesting = useSpeedTest((test) => test.isTesting)
  const completedAt = useSpeedTest((test) => test.completedAt)

  if (isTesting) return <span className={FOOTER_STATUS}>Testing…</span>
  if (!hasResults) return <span className={FOOTER_STATUS}>Available after speed test</span>
  if (completedAt == null) return null
  return (
    <span className={FOOTER_STATUS}>
      <HistoryIcon size={13} aria-hidden />
      <UpdatedAgo timestamp={completedAt} />
    </span>
  )
}

function OpenSpeedLink() {
  const { navigate } = useNavigation()

  return (
    // The pill's padding hangs over the footer's own, so the footer keeps its height.
    <Link className="-my-2 ml-auto" onClick={() => navigate({ tab: 'speed' })}>
      Speed Test
    </Link>
  )
}

/** Screen-reader only: reads out a test run from here, as the Speed page does. Home shows no failure, so the error is read out too. */
function ScreenReaderTestStatus() {
  const isTesting = useSpeedTest((test) => test.isTesting)
  const progress = useSpeedTest((test) => test.progress)
  const internetSpeed = useSpeedTest((test) => test.internetSpeed)
  const error = useSpeedTest((test) => test.error)

  return <ScreenReaderStatus>{error ?? testStatusText(isTesting, progress, internetSpeed)}</ScreenReaderStatus>
}
