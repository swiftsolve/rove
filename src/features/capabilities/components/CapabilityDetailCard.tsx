import { cva, cx } from 'class-variance-authority'

import { CapabilityIcon } from '@/features/capabilities/components/CapabilityIcon'
import { CapabilityMeter } from '@/features/capabilities/components/CapabilityMeter'
import { explainCapability } from '@/features/capabilities/utils/capability-detail'
import {
  CAPABILITY_LEVEL_FILL_COLORS,
  CAPABILITY_LEVEL_TEXT_COLORS,
  CAPABILITY_LEVEL_TILE_COLORS,
} from '@/features/capabilities/utils/capability-level-colors'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import type { CapabilityLevel, CapabilityRating, SpeedResult } from '@/types'
import { AlertIcon, Card, CheckIcon, CloseIcon, IconTile, NoValue, StatusDot } from '@/ui'

// Three tiers: an intro row, a metrics grid on an inset panel, then the verdict.
const CARD_CONTENT = 'flex flex-col px-(--card-header-padding-x) pt-(--card-header-padding-y)'

const METRICS = cx(
  'grid grid-cols-4 gap-x-8 gap-y-12',
  '-mx-(--card-header-padding-x) bg-inset px-(--card-header-padding-x) py-12',
)

const metricValueVariants = cva('type-body-default leading-[1.25] font-medium whitespace-nowrap', {
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

const verdictStatusVariants = cva('type-label-default inline-flex shrink-0 items-center gap-6', {
  variants: { level: CAPABILITY_LEVEL_TEXT_COLORS },
})

function VerdictIcon({ level }: { level: CapabilityLevel }) {
  if (level === 'excellent' || level === 'good') return <CheckIcon size={14} />
  if (level === 'fair') return <AlertIcon size={13} />
  return <CloseIcon size={14} />
}

/** One capability's card: what it is, the measured figures against what it needs, and the verdict. */
export function CapabilityDetailCard({ capability, speed }: { capability: CapabilityRating; speed: SpeedResult }) {
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
            <h2 className="type-heading-small">{capability.label}</h2>
            <span className="type-caption text-tertiary">{capability.description}</span>
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
              <dt className="type-label-field leading-[1.15] text-tertiary">{check.label}</dt>
              <dd className={cx(metricValueVariants({ isUnmet: !check.isMet }), 'num')}>
                {check.have ?? <NoValue label="Not measured" />}
              </dd>
              <dd className="type-caption leading-[1.2] whitespace-nowrap text-tertiary">
                <span className="sr-only">Needs </span>
                {check.need}
              </dd>
            </div>
          ))}
        </dl>

        <div className={VERDICT}>
          <p className="type-body-small flex min-w-0 flex-1 items-start gap-4 text-secondary">
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
