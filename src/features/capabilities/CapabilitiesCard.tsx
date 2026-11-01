import type { ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { CapabilityId, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { testStatusText } from '@/features/speed/utils/test-status'
import { CapabilityIcon } from '@/features/capabilities/CapabilityIcon'
import { CapabilityMeter } from '@/features/capabilities/CapabilityMeter'
import {
  Card,
  CardBody,
  CardHeader,
  HistoryIcon,
  IconButton,
  IconTile,
  IconTileButton,
  InlineMeta,
  PlayIcon,
  RefreshIcon,
  Tooltip,
  Link,
  ZapIcon,
  type IconComponent,
} from '@/ui'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import { CAPABILITY_LEVEL_FILL_COLORS } from '@/features/capabilities/utils/capability-level-colors'

// Bleeds past the card body's padding so the icons span the full card width,
// the same pattern as the live throughput chart.
const LIST = cx(
  'flex items-center justify-between',
  '-mx-(--card-body-padding) px-(--card-body-padding)',
)

// Each column: the icon tile with its signal meter centred beneath it. The
// meter's compact size is CapabilityMeter's `isCompact`.
const CELL = 'flex flex-[0_0_auto] flex-col items-center gap-8'

// Third row: a dark inset strip flush to the card's bottom edge, full-bleed like
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
      // top gap is trimmed a touch. The hint (the empty state) pulls in closer
      // still; it doesn't need the breathing room the populated row gets.
      isHint: { true: 'mt-12', false: 'mt-16' },
    },
    defaultVariants: { isHint: false },
  },
)

/** Starts a test in place; the Speed tab shows the same run (one shared store),
 *  and the footer links there. */
function RunTestButton({
  isTesting,
  hasResults,
}: {
  isTesting: boolean
  hasResults: boolean
}): JSX.Element {
  const runTest = useSpeedTest((test) => test.runTest)
  const canRunTest = useCanRunSpeedTest()

  const handleRunTest = (): void => {
    void runTest()
  }

  return (
    <IconButton
      label={hasResults ? 'Run speed test again' : 'Run speed test'}
      icon={hasResults ? RefreshIcon : PlayIcon}
      iconSize={14}
      tooltip={isTesting ? 'Speed test running' : undefined}
      tooltipSide="left"
      isLoading={isTesting}
      isDisabled={!canRunTest}
      onClick={handleRunTest}
    />
  )
}

/** The footer's message as a link to the Speed page. */
function SpeedLink({
  icon,
  children,
}: {
  icon?: IconComponent
  children: ReactNode
}): JSX.Element {
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

/** Every capability as a greyed-out tile, before any test has run. */
function PlaceholderStrip({ isTesting }: { isTesting: boolean }): JSX.Element {
  return (
    <>
      <ul role="list" className={LIST} aria-hidden>
        {CAPABILITY_DEFINITIONS.map((capability) => (
          <li className={CELL} key={capability.id}>
            <Tooltip content={capability.label} side="top" align="start">
              <IconTile className="text-tertiary">
                <CapabilityIcon id={capability.id} size={16} />
              </IconTile>
            </Tooltip>
            <CapabilityMeter level="unsupported" shouldShowLabel={false} isCompact isMuted />
          </li>
        ))}
      </ul>

      <div className={footerVariants({ isHint: true })}>
        <SpeedLink>{isTesting ? 'Testing…' : 'Available after speed test'}</SpeedLink>
      </div>
    </>
  )
}

function ResultCell({
  capability,
  isTesting,
  onOpenDetails,
}: {
  capability: CapabilityRating
  isTesting: boolean
  onOpenDetails: (capabilityId: CapabilityId) => void
}): JSX.Element {
  const levelLabel = CAPABILITY_LEVEL_LABELS[capability.level]

  return (
    <li className={CELL}>
      <Tooltip
        content={<InlineMeta items={[capability.label, levelLabel]} />}
        side="top"
        align="start"
        sideOffset={2}
        isDisabled={isTesting}
        // The button's label already says the same.
        shouldDescribe={false}
      >
        {/* Muted and inert while a test runs: the rating is about to change. */}
        <IconTileButton
          className={isTesting ? 'text-tertiary' : CAPABILITY_LEVEL_FILL_COLORS[capability.level]}
          label={`${capability.label}: ${levelLabel}`}
          onClick={() => onOpenDetails(capability.id)}
          isDisabled={isTesting}
        >
          <CapabilityIcon id={capability.id} size={16} />
        </IconTileButton>
      </Tooltip>
      <CapabilityMeter
        level={capability.level}
        shouldShowLabel={false}
        isCompact
        isMuted={isTesting}
      />
    </li>
  )
}

/** "Testing…" while a test runs, otherwise when the last result landed; both
 *  link to the Speed page. Nothing before the first result. */
function ResultFooter({ isTesting }: { isTesting: boolean }): JSX.Element | null {
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  const completedAt = useSpeedTest((test) => test.completedAt)

  if (isTesting) {
    return (
      <div className={footerVariants()}>
        <SpeedLink>Testing…</SpeedLink>
      </div>
    )
  }

  if (completedAt == null) return null

  return (
    <div className={footerVariants()}>
      <SpeedLink icon={HistoryIcon}>
        Updated{' '}
        <time dateTime={new Date(completedAt).toISOString()}>{formatTimeAgo(completedAt, now)}</time>
      </SpeedLink>
    </div>
  )
}

export function CapabilitiesCard(): JSX.Element {
  const { navigate } = useNavigation()
  // A test can be started here or from the Speed tab; either way it greys the strip.
  const capabilities = useSpeedTest((test) => test.capabilities)
  const isTesting = useSpeedTest((test) => test.isTesting)
  const progress = useSpeedTest((test) => test.progress)
  const internetSpeed = useSpeedTest((test) => test.internetSpeed)
  const error = useSpeedTest((test) => test.error)
  const hasResults = capabilities.length > 0

  const openDetails = (capabilityId: CapabilityId): void => {
    navigate({ tab: 'speed', speedSub: { view: 'details', target: capabilityId } })
  }

  return (
    // Top-placement tooltips must not be clipped by the card.
    <Card className="overflow-visible">
      <CardHeader
        title="Capabilities"
        icon={<ZapIcon size={15} />}
        actions={
        <RunTestButton isTesting={isTesting} hasResults={hasResults} />
      }
      />
      <CardBody>
        {!hasResults ? (
          <PlaceholderStrip isTesting={isTesting} />
        ) : (
          <>
            <ul role="list" className={LIST}>
              {capabilities.map((capability) => (
                <ResultCell
                  key={capability.id}
                  capability={capability}
                  isTesting={isTesting}
                  onOpenDetails={openDetails}
                />
              ))}
            </ul>

            <ResultFooter isTesting={isTesting} />
          </>
        )}

        {/* The Speed page's announcements, for a test run from here. Home shows no
            failure, so the error is read out too. */}
        <p className="sr-only" role="status">
          {error ?? testStatusText(isTesting, progress, internetSpeed)}
        </p>
      </CardBody>
    </Card>
  )
}
