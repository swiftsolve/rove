import { cva } from 'class-variance-authority'
import type { JSX } from 'react'

import { useNavigation } from '@/app/hooks/useNavigation'
import { CapabilityIcon } from '@/features/capabilities/components/CapabilityIcon'
import {
  CAPABILITY_LEVEL_TEXT_COLORS,
  CAPABILITY_LEVEL_TILE_COLORS,
} from '@/features/capabilities/utils/capability-level-colors'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import type { CapabilityDefinition, CapabilityId, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
import { ButtonSpinner, Card, CardBody, CardHeader, IconTile, ListRow, NoValue, ZapIcon } from '@/ui'

// A few headline use-cases previewed before any test runs.
const PREVIEW_IDS: CapabilityId[] = ['browsing', 'streaming-4k', 'video-calls', 'gaming']
const PREVIEW_CAPABILITIES = PREVIEW_IDS.flatMap((id) =>
  CAPABILITY_DEFINITIONS.filter((definition) => definition.id === id),
)

// No first/last padding special cases, so every row's hover highlight matches.
const LIST = 'flex flex-col'

// Name over description, as in a service row: Body, then Caption 2px below.
const ROW_TEXT = 'flex min-w-0 flex-1 flex-col gap-2'

// Tertiary while a test runs, like the muted tile: the rating is about to change.
const levelVariants = cva('type-caption shrink-0', {
  variants: {
    tone: { ...CAPABILITY_LEVEL_TEXT_COLORS, testing: 'text-tertiary' },
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
}) {
  return (
    <li>
      <ListRow onClick={onOpen} isDisabled={isTesting}>
        {/* Muted while a test runs: the rating is about to change. */}
        <IconTile
          color={isTesting ? 'neutral' : CAPABILITY_LEVEL_TILE_COLORS[capability.level]}
          icon={<CapabilityIcon id={capability.id} size={17} />}
        />
        <span className={ROW_TEXT}>
          <span className="type-body truncate text-primary">{capability.label}</span>
          <span className="type-caption truncate text-tertiary">{capability.description}</span>
        </span>
        <span className={levelVariants({ tone: isTesting ? 'testing' : capability.level })}>
          {CAPABILITY_LEVEL_LABELS[capability.level]}
        </span>
      </ListRow>
    </li>
  )
}

// A ListRow's layout, bleed included, with nothing to press.
const PREVIEW_ROW =
  'flex items-center gap-12 -mx-8 w-[calc(100%+16px)] px-8 py-(--row-padding-y) opacity-(--opacity-disabled)'

/**
 * A greyed-out preview of a capability, shown before any test has run. Faded
 * like a disabled control, the same as the Home strip's placeholder tiles.
 */
function PreviewRow({ definition }: { definition: CapabilityDefinition }) {
  return (
    <li className={PREVIEW_ROW}>
      <div className="flex min-w-0 flex-1 items-center gap-12">
        <IconTile color="neutral" icon={<CapabilityIcon id={definition.id} size={17} />} />
        <div className={ROW_TEXT}>
          <span className="type-body truncate text-primary">{definition.label}</span>
          <span className="type-caption truncate text-tertiary">{definition.description}</span>
        </div>
      </div>
      {/* Where the rating will land. */}
      <span className="shrink-0 font-medium text-tertiary" aria-hidden>
        <NoValue />
      </span>
    </li>
  )
}

/** The card header's actions: a spinner while testing, a hint before the first test, nothing once results are in. */
function headerAction(isTesting: boolean, hasRunTest: boolean): JSX.Element | undefined {
  if (isTesting) {
    return (
      // Secondary, to match the other button spinners; tertiary read washed-out.
      <span className="inline-flex items-center text-secondary" role="img" aria-label="Speed test running">
        <ButtonSpinner size={14} />
      </span>
    )
  }
  if (!hasRunTest) return <span className="type-caption text-tertiary">Not tested yet</span>
  return undefined
}

export function CapabilityList() {
  const { navigate } = useNavigation()
  const capabilities = useSpeedTest((test) => test.capabilities)
  const hasRunTest = useSpeedTest((test) => test.internetSpeed != null)
  const isTesting = useSpeedTest((test) => test.isTesting)

  return (
    <Card>
      <CardHeader title="Capabilities" icon={<ZapIcon size={15} />} actions={headerAction(isTesting, hasRunTest)} />
      <CardBody>
        {hasRunTest ? (
          <ul role="list" className={LIST}>
            {capabilities.map((capability) => (
              <CapabilityRow
                key={capability.id}
                capability={capability}
                isTesting={isTesting}
                onOpen={() => navigate({ tab: 'speed', speedSub: { view: 'details', target: capability.id } })}
              />
            ))}
          </ul>
        ) : (
          <ul role="list" className={LIST}>
            {PREVIEW_CAPABILITIES.map((definition) => (
              <PreviewRow key={definition.id} definition={definition} />
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
