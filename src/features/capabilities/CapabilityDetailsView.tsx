import { useEffect, useRef } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { CapabilityId, CapabilityLevel, CapabilityRating, SpeedResult } from '@/types'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { explainCapability } from '@/features/capabilities/utils/capability-detail'
import { CapabilityIcon } from '@/features/capabilities/CapabilityIcon'
import { CapabilityMeter } from '@/features/capabilities/CapabilityMeter'
import { AlertIcon, Card, CheckIcon, CloseIcon, IconTile, PageHeader } from '@/ui'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { flashHighlight } from '@/lib/highlight'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import {
  CAPABILITY_LEVEL_FILL_COLORS,
  CAPABILITY_LEVEL_TEXT_COLORS,
} from '@/features/capabilities/utils/capability-level-colors'

// Three-tier card: an intro row (icon + name/description + bars) on the panel
// surface, a metrics grid on an inset panel, and the verdict on the chrome panel
// at the very bottom, set apart from the metrics in both themes. When opened by
// clicking a capability, that card is scrolled to the top of the viewport; the
// scroll margin leaves a little air above it.
const CARD = cx(
  'flex flex-col scroll-mt-12',
  'px-(--card-header-padding-x) pt-(--card-header-padding-y)',
)

// All four requirements in a compact metric grid. Your value turns red only when
// it misses the threshold, which stays a small muted line.
const METRICS = cx(
  'grid grid-cols-4 gap-x-8 gap-y-12',
  '-mx-(--card-header-padding-x) bg-inset px-(--card-header-padding-x) py-12',
)

const metricValueVariants = cva('text-md leading-[1.25] font-medium whitespace-nowrap', {
  variants: {
    isUnmet: { true: 'text-negative', false: 'text-primary' },
  },
  defaultVariants: { isUnmet: false },
})

// Verdict: the plain-language summary paired with a colour-keyed status, on the
// chrome panel so it reads as the card's closing takeaway: a shade below the
// metrics in dark mode, a shade above them in light. Framed on three sides
// (not the top) with the metrics' inset colour, so the block sits
// within the card edge rather than bleeding to it, seamless with the metrics
// above. The horizontal padding is trimmed by the border width so the content
// stays aligned with the metrics grid (14px from the card edge).
const VERDICT = cx(
  'flex items-center justify-between gap-12',
  '-mx-(--card-header-padding-x) px-[calc(var(--card-header-padding-x)-1px)] py-12',
  'rounded-b-lg border border-t-0 border-inset bg-base',
)

/** The verdict glyph, left of the summary in the level colour. Its box is
 *  exactly one line of summary text tall and centres the glyph, so the tick sits
 *  against the middle of the first line (the summary stays top-aligned when it
 *  wraps). */
const verdictIconVariants = cva(
  'inline-flex h-[calc(var(--font-size-sm)*1.45)] shrink-0 items-center',
  {
    variants: { level: CAPABILITY_LEVEL_FILL_COLORS },
  },
)

const verdictStatusVariants = cva(
  'inline-flex shrink-0 items-center gap-6 text-xs font-semibold',
  {
    variants: { level: CAPABILITY_LEVEL_TEXT_COLORS },
  },
)

interface CapabilityDetailsViewProps {
  /** Capability to scroll into view when the page opens (the one just clicked). */
  targetId?: CapabilityId | null
}

/**
 * Smooth-scroll a card to the top of the app's scroll container
 * (`[data-scroll-root]`; its scroll-margin leaves a little breathing room),
 * then flash it.
 *
 * We scroll the container directly rather than calling card.scrollIntoView():
 * scrollIntoView walks up and scrolls *every* scrollable ancestor, which across
 * an iframe boundary reaches the host document — so on the marketing-site demo
 * it would drag the whole landing page down with it.
 */
function scrollCardToTop(card: HTMLElement): void {
  const scroller = card.closest<HTMLElement>('[data-scroll-root]')
  if (!scroller) return
  const margin = parseFloat(getComputedStyle(card).scrollMarginTop) || 0
  const offset = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  scroller.scrollTo({ top: scroller.scrollTop + offset - margin, behavior: 'smooth' })
  flashHighlight(card)
}

/** The verdict glyph: a tick when the connection clears the bar, a warning when
 *  it only just scrapes by, a cross when it falls short. */
function VerdictIcon({ level }: { level: CapabilityLevel }): JSX.Element {
  if (level === 'excellent' || level === 'good') return <CheckIcon size={14} />
  if (level === 'fair') return <AlertIcon size={13} />
  return <CloseIcon size={14} />
}

function CapabilityDetailCard({
  capability,
  speed,
}: {
  capability: CapabilityRating
  speed: SpeedResult
}): JSX.Element {
  const { summary, checks } = explainCapability(capability.id, capability.level, speed)

  return (
    <Card as="li" className={CARD} data-capability-id={capability.id}>
      <div className="flex items-center gap-8 pb-12">
        {/* The glyph in the level colour on a faint tint of it, as in the capability rows. */}
        <IconTile size="sm" className={CAPABILITY_LEVEL_FILL_COLORS[capability.level]}>
          <CapabilityIcon id={capability.id} size={16} />
        </IconTile>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-lg leading-heading-small font-semibold tracking-heading-small">{capability.label}</h2>
          <span className="text-xs leading-caption text-tertiary">{capability.description}</span>
        </div>
        {/* The bars sit at the bottom of the 12px meter box; nudged up to sit
            optically centred against the two-line title block. */}
        <CapabilityMeter
          level={capability.level}
          shouldShowLabel={false}
          barsClassName="[transform:translateY(-1px)]"
        />
      </div>

      <dl className={METRICS}>
        {checks.map((check) => (
          <div key={check.label} className="flex min-w-0 flex-col gap-6">
            <dt className="text-overline leading-[1.15]">{check.label}</dt>
            <dd className={cx(metricValueVariants({ isUnmet: !check.isMet }), 'num')}>{check.have}</dd>
            <dd className="text-xs leading-[1.2] whitespace-nowrap text-tertiary">
              <span className="sr-only">Needs </span>
              {check.need}
            </dd>
          </div>
        ))}
      </dl>

      <div className={VERDICT}>
        <p className="flex min-w-0 flex-1 items-start gap-4 text-sm leading-body-small text-secondary">
          <span className={verdictIconVariants({ level: capability.level })} aria-hidden>
            <VerdictIcon level={capability.level} />
          </span>
          <span>{summary}</span>
        </p>
        <span className={verdictStatusVariants({ level: capability.level })}>
          {/* The status dot takes the level colour from the label. */}
          <span className="size-6 shrink-0 rounded-full bg-current" aria-hidden />
          {CAPABILITY_LEVEL_LABELS[capability.level]}
        </span>
      </div>
    </Card>
  )
}

export function CapabilityDetailsView({ targetId }: CapabilityDetailsViewProps): JSX.Element {
  const { back } = useNavigation()
  const capabilities = useSpeedTest((test) => test.capabilities)
  const speed = useSpeedTest((test) => test.internetSpeed)
  const completedAt = useSpeedTest((test) => test.completedAt)
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  const listRef = useRef<HTMLUListElement>(null)

  // Scroll to the capability the user clicked, once on open. Deferred two
  // frames: opening the subpage changes the app's screen key, whose effect
  // resets the scroll container back to the top. Running a frame later than
  // that reset lets our smooth scroll animate cleanly from the top to the target card.
  useEffect(() => {
    if (targetId == null) return
    let innerFrame = 0
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        const card = listRef.current?.querySelector<HTMLElement>(
          `[data-capability-id="${targetId}"]`,
        )
        if (card) scrollCardToTop(card)
      })
    })
    return () => {
      cancelAnimationFrame(outerFrame)
      cancelAnimationFrame(innerFrame)
    }
  }, [targetId])

  return (
    <div className="page">
      <PageHeader
        title="Capabilities"
        description={
          completedAt != null ? (
            <>
              Updated{' '}
              <time dateTime={new Date(completedAt).toISOString()}>
                {formatTimeAgo(completedAt, now)}
              </time>
            </>
          ) : undefined
        }
        onBack={back}
      />
      <ul role="list" className="flex flex-col gap-10" ref={listRef}>
        {/* The Speed view only opens this page once a result is in. */}
        {speed != null &&
          capabilities.map((capability) => (
            <CapabilityDetailCard key={capability.id} capability={capability} speed={speed} />
          ))}
      </ul>
    </div>
  )
}
