import { cva, cx } from 'class-variance-authority'
import { useEffect, useRef } from 'react'

import { useNavigation } from '@/app/hooks/useNavigation'
import { CapabilityIcon } from '@/features/capabilities/components/CapabilityIcon'
import { CapabilityMeter } from '@/features/capabilities/components/CapabilityMeter'
import { explainCapability } from '@/features/capabilities/utils/capability-detail'
import {
  CAPABILITY_LEVEL_FILL_COLORS,
  CAPABILITY_LEVEL_TEXT_COLORS,
  CAPABILITY_LEVEL_TILE_COLORS,
} from '@/features/capabilities/utils/capability-level-colors'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useNow } from '@/hooks/useNow'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { flashHighlight } from '@/lib/highlight'
import type { CapabilityId, CapabilityLevel, CapabilityRating, SpeedResult } from '@/types'
import { AlertIcon, Card, CheckIcon, CloseIcon, IconTile, NoValue, PageHeader, StatusDot } from '@/ui'

// Three tiers: an intro row, a metrics grid on an inset panel, then the verdict.
const CARD_CONTENT = 'flex flex-col px-(--card-header-padding-x) pt-(--card-header-padding-y)'

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

// Framed on three sides in the metrics' inset colour, so it sits inside the card
// edge. The padding gives back the 1px border to stay aligned with the grid.
const VERDICT = cx(
  'flex items-center justify-between gap-12',
  '-mx-(--card-header-padding-x) px-[calc(var(--card-header-padding-x)-1px)] py-12',
  'rounded-b-lg border border-t-0 border-inset bg-base',
)

/** One summary line tall, so the icon centres on the first line when the summary wraps. */
const verdictIconVariants = cva('inline-flex h-[calc(var(--font-size-sm)*1.45)] shrink-0 items-center', {
  variants: { level: CAPABILITY_LEVEL_FILL_COLORS },
})

const verdictStatusVariants = cva('inline-flex shrink-0 items-center gap-6 text-xs font-semibold', {
  variants: { level: CAPABILITY_LEVEL_TEXT_COLORS },
})

type CapabilityDetailsViewProps = {
  /** Capability to scroll into view when the page opens (the one just clicked). */
  targetId?: CapabilityId | null
}

/**
 * Smooth-scroll a card to the top of `[data-scroll-root]`, then flash it.
 *
 * Not card.scrollIntoView(): that scrolls every scrollable ancestor, across an
 * iframe boundary too, so the marketing-site demo would drag its host page along.
 */
function scrollCardToTop(card: HTMLElement): void {
  const scroller = card.closest<HTMLElement>('[data-scroll-root]')
  if (!scroller) return
  const margin = parseFloat(getComputedStyle(card).scrollMarginTop) || 0
  const offset = card.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  scroller.scrollTo({ top: scroller.scrollTop + offset - margin, behavior: 'smooth' })
  flashHighlight(card)
}

function VerdictIcon({ level }: { level: CapabilityLevel }) {
  if (level === 'excellent' || level === 'good') return <CheckIcon size={14} />
  if (level === 'fair') return <AlertIcon size={13} />
  return <CloseIcon size={14} />
}

function CapabilityDetailCard({ capability, speed }: { capability: CapabilityRating; speed: SpeedResult }) {
  const { summary, checks } = explainCapability(capability.id, capability.level, speed)

  return (
    <Card as="li" className="scroll-mt-12" data-capability-id={capability.id}>
      <div className={CARD_CONTENT}>
        <div className="flex items-center gap-8 pb-12">
          <IconTile
            size="sm"
            color={CAPABILITY_LEVEL_TILE_COLORS[capability.level]}
            icon={<CapabilityIcon id={capability.id} size={16} />}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h2 className="text-lg leading-heading-small font-semibold tracking-heading-small">{capability.label}</h2>
            <span className="text-xs leading-caption text-tertiary">{capability.description}</span>
          </div>
          {/* Nudged up to centre optically against the two-line title. */}
          <CapabilityMeter
            level={capability.level}
            shouldShowLabel={false}
            barsClassName="[transform:translateY(-1px)]"
          />
        </div>

        <dl className={METRICS}>
          {checks.map((check) => (
            <div key={check.label} className="flex min-w-0 flex-col gap-6">
              <dt className="type-overline text-tertiary leading-[1.15]">{check.label}</dt>
              <dd className={cx(metricValueVariants({ isUnmet: !check.isMet }), 'num')}>
                {check.have ?? <NoValue label="Not measured" />}
              </dd>
              <dd className="text-xs leading-[1.2] whitespace-nowrap text-tertiary">
                <span className="sr-only">Needs </span>
                {check.need}
              </dd>
            </div>
          ))}
        </dl>

        <div className={VERDICT}>
          <p className="flex min-w-0 flex-1 items-start gap-4 type-body-small text-secondary">
            <span className={verdictIconVariants({ level: capability.level })} aria-hidden>
              <VerdictIcon level={capability.level} />
            </span>
            <span>{summary}</span>
          </p>
          <span className={verdictStatusVariants({ level: capability.level })}>
            {/* The status dot takes the level colour from the label. */}
            <StatusDot />
            {CAPABILITY_LEVEL_LABELS[capability.level]}
          </span>
        </div>
      </div>
    </Card>
  )
}

export function CapabilityDetailsView({ targetId }: CapabilityDetailsViewProps) {
  const { back } = useNavigation()
  const capabilities = useSpeedTest((test) => test.capabilities)
  const speed = useSpeedTest((test) => test.internetSpeed)
  const completedAt = useSpeedTest((test) => test.completedAt)
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  const listRef = useRef<HTMLUListElement>(null)

  // Two frames late: opening the subpage resets the scroll container to the top
  // in an effect, and this scroll must start after that reset.
  useEffect(() => {
    if (targetId == null) return
    let innerFrame = 0
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        const card = listRef.current?.querySelector<HTMLElement>(`[data-capability-id="${targetId}"]`)
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
              Updated <time dateTime={new Date(completedAt).toISOString()}>{formatTimeAgo(completedAt, now)}</time>
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
