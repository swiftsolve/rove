import { cva } from 'class-variance-authority'
import type { CapabilityDefinition, CapabilityId, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { CapabilityIcon } from '@/features/capabilities/CapabilityIcon'
import { CapabilityMeter } from '@/features/capabilities/CapabilityMeter'
import { Section } from '@/components/Section'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import { ChevronRightIcon, ZapIcon } from '@/components/icons/Icons'
import { cx } from '@/lib/cx'
import styles from './CapabilityList.module.css'

// A few headline use-cases previewed in the empty state before any test runs —
// the full breakdown appears once results come in.
const PREVIEW_IDS: CapabilityId[] = ['browsing', 'streaming-4k', 'video-calls', 'gaming']
const PREVIEW_CAPABILITIES = PREVIEW_IDS.map(
  (id) => CAPABILITY_DEFINITIONS.find((definition) => definition.id === id)!,
)

const listVariants = cva(styles.list, {
  variants: {
    isTesting: { true: styles.isTesting },
  },
})

const rowVariants = cva(styles.row, {
  variants: {
    isEmpty: { true: styles.isEmpty },
  },
})

/** The tinted chip a CapabilityIcon sits in, coloured by the level (`empty`
 *  before any test has run). */
const tileVariants = cva(styles.tile, {
  variants: {
    level: {
      excellent: styles.levelExcellent,
      good: styles.levelGood,
      fair: styles.levelFair,
      poor: styles.levelPoor,
      unsupported: styles.levelUnsupported,
      empty: styles.levelEmpty,
    },
  },
})

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
    <button type="button" className={rowVariants()} onClick={onOpen} disabled={isTesting}>
      <div className={styles.rowMain}>
        <span className={tileVariants({ level: capability.level })}>
          <CapabilityIcon id={capability.id} size={17} />
        </span>
        <div className={styles.rowText}>
          <span className={cx('text-body', styles.name)}>{capability.label}</span>
          <span className={cx('text-small', styles.desc)}>{capability.description}</span>
        </div>
      </div>
      <div className={styles.rowStatus}>
        <CapabilityMeter level={capability.level} shouldShowLabel={false} isDimmed={isTesting} />
        <ChevronRightIcon size={16} className={styles.chevron} />
      </div>
    </button>
  )
}

/** A greyed-out preview of a capability, shown before any test has run. */
function PreviewRow({ definition }: { definition: CapabilityDefinition }): JSX.Element {
  return (
    <div className={rowVariants({ isEmpty: true })}>
      <div className={styles.rowMain}>
        <span className={tileVariants({ level: 'empty' })}>
          <CapabilityIcon id={definition.id} size={17} />
        </span>
        <div className={styles.rowText}>
          <span className={cx('text-body', styles.name)}>{definition.label}</span>
          <span className={cx('text-small', styles.desc)}>{definition.description}</span>
        </div>
      </div>
      <span className={styles.emptyValue}>…</span>
    </div>
  )
}

/** The section header's trailing slot: a spinner while testing, a hint before
 *  the first test, nothing once results are in. */
function headerAction(isTesting: boolean, hasRunTest: boolean): JSX.Element | undefined {
  if (isTesting) {
    return (
      <span className={styles.action} aria-label="Speed test running">
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
  const { capabilities, internetSpeed, isTesting } = useSpeedTest()
  const hasRunTest = internetSpeed != null

  return (
    <Section
      title="Capabilities"
      icon={<ZapIcon size={15} />}
      action={headerAction(isTesting, hasRunTest)}
    >
      {!hasRunTest ? (
        <div className={listVariants()}>
          {PREVIEW_CAPABILITIES.map((definition) => (
            <PreviewRow key={definition.id} definition={definition} />
          ))}
        </div>
      ) : (
        <div className={listVariants({ isTesting })}>
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
        </div>
      )}
    </Section>
  )
}
