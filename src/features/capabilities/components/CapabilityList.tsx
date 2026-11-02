import type { CapabilityDefinition, CapabilityId, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { CapabilityIcon } from '@/features/capabilities/CapabilityIcon'
import { CapabilityMeter } from '@/features/capabilities/CapabilityMeter'
import { ButtonSpinner, Card, CardBody, CardHeader, IconTile, ListRow, ZapIcon } from '@/ui'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import { CAPABILITY_LEVEL_TILE_COLORS } from '@/features/capabilities/utils/capability-level-colors'

// A few headline use-cases previewed in the empty state before any test runs —
// the full breakdown appears once results come in.
const PREVIEW_IDS: CapabilityId[] = ['browsing', 'streaming-4k', 'video-calls', 'gaming']
const PREVIEW_CAPABILITIES = PREVIEW_IDS.map(
  (id) => CAPABILITY_DEFINITIONS.find((definition) => definition.id === id)!,
)

// Every row keeps the same symmetric vertical padding, with no first/last special
// casing, so both the spacing between rows and each row's hover highlight read
// identically. The card body's own padding supplies the outer breathing room.
const LIST = 'flex flex-col'

// It takes the free width, so the meter after it sits on the right.
const ROW_TEXT = 'flex min-w-0 flex-1 flex-col'

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
      <ListRow onClick={onOpen} isDisabled={isTesting}>
        {/* Muted while a test runs: the rating is about to change. */}
        <IconTile
          color={isTesting ? 'neutral' : CAPABILITY_LEVEL_TILE_COLORS[capability.level]}
          icon={<CapabilityIcon id={capability.id} size={17} />}
        />
        <span className={ROW_TEXT}>
          <span className="type-body-default text-primary truncate">{capability.label}</span>
          <span className="type-body-small text-tertiary truncate">{capability.description}</span>
        </span>
        <CapabilityMeter level={capability.level} shouldShowLabel={false} isDimmed={isTesting} />
        {/* The bars carry the rating visually; name it for screen readers. */}
        <span className="sr-only">{CAPABILITY_LEVEL_LABELS[capability.level]}</span>
      </ListRow>
    </li>
  )
}

// A ListRow's layout, bleed included, with nothing to press.
const PREVIEW_ROW =
  'flex items-center gap-12 -mx-8 w-[calc(100%+16px)] px-8 py-(--row-padding-y) opacity-(--opacity-disabled)'

/** A greyed-out preview of a capability, shown before any test has run. Faded
 *  like a disabled control, the same as the Home strip's placeholder tiles. */
function PreviewRow({ definition }: { definition: CapabilityDefinition }): JSX.Element {
  return (
    <li className={PREVIEW_ROW}>
      <div className="flex min-w-0 flex-1 items-center gap-12">
        <IconTile color="neutral" icon={<CapabilityIcon id={definition.id} size={17} />} />
        <div className={ROW_TEXT}>
          <span className="type-body-default text-primary truncate">{definition.label}</span>
          <span className="type-body-small text-tertiary truncate">{definition.description}</span>
        </div>
      </div>
      {/* Where the rating meter will land. */}
      <span className="shrink-0 font-medium text-tertiary" aria-hidden>…</span>
    </li>
  )
}

/** The card header's actions: a spinner while testing, a hint before
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
  if (!hasRunTest) return <span className="type-caption text-tertiary">Available after speed test</span>
  return undefined
}

export function CapabilityList(): JSX.Element {
  const { navigate } = useNavigation()
  // While a test runs, the stale rows grey out until the new result lands.
  const capabilities = useSpeedTest((test) => test.capabilities)
  const hasRunTest = useSpeedTest((test) => test.internetSpeed != null)
  const isTesting = useSpeedTest((test) => test.isTesting)

  return (
    <Card>
      <CardHeader
        title="Capabilities"
        icon={<ZapIcon size={15} />}
        actions={headerAction(isTesting, hasRunTest)}
      />
      <CardBody>
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
      </CardBody>
    </Card>
  )
}
