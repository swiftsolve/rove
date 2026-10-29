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
import { Section } from '@/components/Section'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import { InlineMeta } from '@/components/DotSeparator'
import { Tooltip } from '@/components/Tooltip'
import { ChevronRightIcon, HistoryIcon, PlayIcon, RefreshIcon, ZapIcon } from '@/components/icons/Icons'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { IconButton } from '@/components/IconButton'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import { CAPABILITY_LEVEL_FILL_COLORS } from '@/features/capabilities/utils/capability-level-colors'

// Bleeds past the section body's padding so the icons span the full card width,
// the same pattern as the live throughput chart.
const LIST = cx(
  'flex items-center justify-between',
  '-mx-(--section-body-padding) px-(--section-body-padding)',
)

// Each column: the icon tile with its signal meter centred beneath it. The
// meter's compact size is CapabilityMeter's `isCompact`.
const CELL = 'flex flex-[0_0_auto] flex-col items-center gap-8'

/** The tinted 32px chip a CapabilityIcon sits in, the same chip as
 *  CapabilityList's tile. The level sets its colour. */
const tileVariants = cva(
  [
    'inline-flex size-[32px] shrink-0 items-center justify-center rounded-sm',
    'bg-[color-mix(in_srgb,currentColor_var(--opacity-tint-md),transparent)]',
    'transition-[background,transform] duration-(--duration-fast) ease-in-out',
  ],
  {
    variants: {
      // Muted: a running test (stale results) or the placeholder strip greys every
      // tile. The meters mute through CapabilityMeter's `isMuted`.
      tone: { ...CAPABILITY_LEVEL_FILL_COLORS, muted: 'text-tertiary' },
      // Hover tints and lifts a live tile (focus is the ring alone). A running
      // test drops the affordances until it completes; the placeholder has none.
      state: {
        live: cx(
          'hover:bg-[color-mix(in_srgb,currentColor_var(--opacity-tint-lg),transparent)]',
          'hover:[transform:translateY(-1px)]',
        ),
        testing: 'cursor-default',
        placeholder: '',
      },
    },
  },
)

// Third row: a dark inset strip flush to the card's bottom edge, full-bleed like
// ConnectionCard's details and the speed test footer. The strip itself isn't
// clickable; only the link inside it is.
const footerVariants = cva(
  [
    'flex items-center justify-end',
    // Full-bleed to both card edges: the body's content box plus the padding on
    // each side, then negative margins pull it out over that padding.
    'w-[calc(100%+2*var(--section-body-padding))]',
    '-mx-(--section-body-padding) -mb-(--section-body-padding)',
    'bg-inset px-(--section-body-padding) py-(--section-header-padding-y)',
    // The section runs `overflow: visible` (so tooltips can escape), so round the
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

// The footer's link to the Speed page: its message (and a clock once there's a
// result) with a trailing caret, muted at rest, the accent and an underline on
// hover, the same affordance as the Speed page's "All Results". Focus mirrors
// hover rather than showing a ring. The glyphs share the link's (animating)
// colour and sit dimmer at rest through opacity, so there's one colour animation
// rather than two that drift apart.
const LINK = cx(
  'group/link inline-flex items-center gap-6 whitespace-nowrap',
  'cursor-pointer text-xs text-secondary',
  'transition-[color] duration-(--duration-fast) ease-in-out',
  'hover:text-accent focus-visible:text-accent focus-visible:outline-none',
  '[&_svg]:text-inherit [&_svg]:opacity-72',
  '[&_svg]:transition-opacity [&_svg]:duration-(--duration-fast) [&_svg]:ease-in-out',
  'hover:[&_svg]:opacity-100 focus-visible:[&_svg]:opacity-100',
)

function runButtonTooltip(isTesting: boolean, hasResults: boolean): string {
  if (isTesting) return 'Speed test running'
  return hasResults ? 'Run speed test again' : 'Run speed test'
}

function RunButtonIcon({
  isTesting,
  hasResults,
}: {
  isTesting: boolean
  hasResults: boolean
}): JSX.Element {
  if (isTesting) return <ButtonSpinner size={14} />
  if (hasResults) return <RefreshIcon size={14} />
  return <PlayIcon size={14} />
}

/** Starts a test in place; the Speed tab shows the same run (one shared store),
 *  and the footer links there. */
function RunTestButton({
  isTesting,
  hasResults,
}: {
  isTesting: boolean
  hasResults: boolean
}): JSX.Element {
  const { runTest } = useSpeedTest()
  const canRunTest = useCanRunSpeedTest()

  const handleRunTest = (): void => {
    void runTest()
  }

  return (
    <Tooltip placement="left" content={runButtonTooltip(isTesting, hasResults)}>
      <IconButton
        isBusy={isTesting}
        onClick={handleRunTest}
        isDisabled={!canRunTest || isTesting}
        aria-label={hasResults ? 'Run speed test again' : 'Run speed test'}
      >
        <RunButtonIcon isTesting={isTesting} hasResults={hasResults} />
      </IconButton>
    </Tooltip>
  )
}

/** The footer's message as a link to the Speed page. */
function SpeedLink({
  icon,
  children,
}: {
  icon?: JSX.Element
  children: ReactNode
}): JSX.Element {
  const { navigate } = useNavigation()

  return (
    <button type="button" className={LINK} onClick={() => navigate({ tab: 'speed' })}>
      {icon}
      {/* Only the label underlines, not the glyphs. */}
      <span
        className={cx(
          'font-medium',
          'group-hover/link:underline group-hover/link:underline-offset-2',
          'group-focus-visible/link:underline group-focus-visible/link:underline-offset-2',
        )}
      >
        {children}
      </span>
      {/* The visible text leads the name; this says where the link goes. */}
      <span className="sr-only">, open Speed</span>
      <ChevronRightIcon size={13} className="link-caret" />
    </button>
  )
}

/** Every capability as a greyed-out tile, before any test has run. */
function PlaceholderStrip({ isTesting }: { isTesting: boolean }): JSX.Element {
  return (
    <>
      <ul role="list" className={LIST} aria-hidden>
        {CAPABILITY_DEFINITIONS.map((capability) => (
          <li className={CELL} key={capability.id}>
            <Tooltip content={capability.label} align="left" placement="top">
              <span className={tileVariants({ tone: 'muted', state: 'placeholder' })}>
                <CapabilityIcon id={capability.id} size={16} />
              </span>
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
        align="left"
        placement="top"
        offset={4}
        isDisabled={isTesting}
        // The button's label already says the same.
        shouldDescribe={false}
      >
        <button
          type="button"
          className={tileVariants({
            tone: isTesting ? 'muted' : capability.level,
            state: isTesting ? 'testing' : 'live',
          })}
          onClick={() => onOpenDetails(capability.id)}
          disabled={isTesting}
          aria-label={`${capability.label}: ${levelLabel}`}
        >
          <CapabilityIcon id={capability.id} size={16} />
        </button>
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
  const { completedAt } = useSpeedTest()

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
      <SpeedLink icon={<HistoryIcon size={13} />}>
        Updated{' '}
        <time dateTime={new Date(completedAt).toISOString()}>{formatTimeAgo(completedAt, now)}</time>
      </SpeedLink>
    </div>
  )
}

export function CapabilityStrip(): JSX.Element {
  const { navigate } = useNavigation()
  // A test can be started here or from the Speed tab; either way it greys the strip.
  const { capabilities, isTesting, progress, internetSpeed, error } = useSpeedTest()
  const hasResults = capabilities.length > 0

  const openDetails = (capabilityId: CapabilityId): void => {
    navigate({ tab: 'speed', speedSub: { view: 'details', target: capabilityId } })
  }

  return (
    <Section
      title="Capabilities"
      icon={<ZapIcon size={15} />}
      // Top-placement tooltips must not be clipped by the section card.
      className="overflow-visible"
      action={
        <RunTestButton isTesting={isTesting} hasResults={hasResults} />
      }
    >
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
    </Section>
  )
}
