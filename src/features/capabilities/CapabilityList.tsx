import { cva, cx } from 'class-variance-authority'
import type { CapabilityDefinition, CapabilityId, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { CapabilityIcon } from '@/features/capabilities/CapabilityIcon'
import { CapabilityMeter } from '@/features/capabilities/CapabilityMeter'
import { Section } from '@/components/Section'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import { ChevronRightIcon, ZapIcon } from '@/components/icons/Icons'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import { CAPABILITY_LEVEL_FILL_COLORS } from '@/features/capabilities/utils/capability-level-colors'

// A few headline use-cases previewed in the empty state before any test runs —
// the full breakdown appears once results come in.
const PREVIEW_IDS: CapabilityId[] = ['browsing', 'streaming-4k', 'video-calls', 'gaming']
const PREVIEW_CAPABILITIES = PREVIEW_IDS.map(
  (id) => CAPABILITY_DEFINITIONS.find((definition) => definition.id === id)!,
)

// Every row keeps the same symmetric vertical padding, with no first/last special
// casing, so both the spacing between rows and each row's hover highlight read
// identically. The section body's own padding supplies the outer breathing room.
const LIST = 'flex flex-col'

const rowVariants = cva(
  [
    'group/row flex items-center gap-12 rounded-sm text-left',
    // The negative margin lets the hover highlight bleed into the section padding
    // while the content stays aligned to the 16px edge.
    '-mx-8 w-[calc(100%+16px)] px-8 py-(--row-padding-y)',
    'transition-[background] duration-(--duration-fast) ease-in-out',
    // Focus is the ring alone, no wash, drawn inside the bleed.
    'focus-visible:outline-offset-(--focus-inset)',
  ],
  {
    variants: {
      // A running test (stale results) and the empty-state preview drop the
      // interactive affordances.
      isInteractive: { true: 'hover:bg-fill-row-hover', false: 'cursor-default' },
    },
  },
)

/** The tinted chip a CapabilityIcon sits in, the same chip as CapabilityStrip's
 *  tile. Coloured by the level; muted (grey) before any test has run and while
 *  one runs. The meters dim through CapabilityMeter's `isDimmed`. */
const tileVariants = cva(
  [
    'inline-flex size-[32px] shrink-0 items-center justify-center rounded-sm',
    'bg-[color-mix(in_srgb,currentColor_var(--opacity-tint-md),transparent)]',
  ],
  {
    variants: {
      tone: { ...CAPABILITY_LEVEL_FILL_COLORS, muted: 'text-tertiary' },
    },
  },
)

const ROW_MAIN = 'flex min-w-0 flex-1 items-center gap-12'
const ROW_TEXT = 'flex min-w-0 flex-col'

function CapabilityRow({
  capability,
  isTesting,
  onOpen,
}: {
  capability: CapabilityRating
  isTesting: boolean
  onOpen: () => void
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        className={rowVariants({ isInteractive: !isTesting })}
        onClick={onOpen}
        disabled={isTesting}
      >
        <span className={ROW_MAIN}>
          <span className={tileVariants({ tone: isTesting ? 'muted' : capability.level })}>
            <CapabilityIcon id={capability.id} size={17} />
          </span>
          <span className={ROW_TEXT}>
            <span className="text-body truncate">{capability.label}</span>
            <span className="text-small truncate">{capability.description}</span>
          </span>
        </span>
        {/* Meter + chevron are one right-aligned unit, so every row's rating
            column lines up whatever the name and description length. */}
        <span className="flex shrink-0 items-center gap-10">
          <CapabilityMeter level={capability.level} shouldShowLabel={false} isDimmed={isTesting} />
          {/* The bars carry the rating visually; name it for screen readers. */}
          <span className="sr-only">{CAPABILITY_LEVEL_LABELS[capability.level]}</span>
          {/* Always faintly there (so the right edge is consistent and the rows
              read as tappable), brightening on hover and focus. */}
          <ChevronRightIcon
            size={16}
            className={cx(
              'shrink-0 text-tertiary opacity-30',
              'transition-opacity duration-(--duration-fast) ease-in-out',
              'group-hover/row:opacity-70 group-focus-visible/row:opacity-70',
            )}
          />
        </span>
      </button>
    </li>
  )
}

/** A greyed-out preview of a capability, shown before any test has run. */
function PreviewRow({ definition }: { definition: CapabilityDefinition }): JSX.Element {
  return (
    <li className={rowVariants({ isInteractive: false })}>
      <div className={ROW_MAIN}>
        <span className={tileVariants({ tone: 'muted' })}>
          <CapabilityIcon id={definition.id} size={17} />
        </span>
        <div className={ROW_TEXT}>
          <span className="text-body truncate">{definition.label}</span>
          <span className="text-small truncate">{definition.description}</span>
        </div>
      </div>
      {/* Where the rating meter will land. */}
      <span className="shrink-0 font-medium text-tertiary" aria-hidden>…</span>
    </li>
  )
}

/** The section header's trailing slot: a spinner while testing, a hint before
 *  the first test, nothing once results are in. */
function headerAction(isTesting: boolean, hasRunTest: boolean): JSX.Element | undefined {
  if (isTesting) {
    return (
      // Secondary, to match the Devices/refresh button spinners (tertiary read
      // as washed-out); the spinner takes it through currentColor.
      <span
        className="inline-flex items-center text-secondary"
        role="img"
        aria-label="Speed test running"
      >
        <ButtonSpinner size={14} />
      </span>
    )
  }
  if (!hasRunTest) return <span className="text-meta">Available after speed test</span>
  return undefined
}

export function CapabilityList(): JSX.Element {
  const { navigate } = useNavigation()
  // While a test runs, the stale rows grey out until the new result lands.
  const capabilities = useSpeedTest((test) => test.capabilities)
  const hasRunTest = useSpeedTest((test) => test.internetSpeed != null)
  const isTesting = useSpeedTest((test) => test.isTesting)

  return (
    <Section
      title="Capabilities"
      icon={<ZapIcon size={15} />}
      action={headerAction(isTesting, hasRunTest)}
    >
      {!hasRunTest ? (
        <ul role="list" className={LIST}>
          {PREVIEW_CAPABILITIES.map((definition) => (
            <PreviewRow key={definition.id} definition={definition} />
          ))}
        </ul>
      ) : (
        <ul role="list" className={LIST}>
          {capabilities.map((capability) => (
            <CapabilityRow
              key={capability.id}
              capability={capability}
              isTesting={isTesting}
              onOpen={() =>
                navigate({ tab: 'speed', speedSub: { view: 'details', target: capability.id } })
              }
            />
          ))}
        </ul>
      )}
    </Section>
  )
}
