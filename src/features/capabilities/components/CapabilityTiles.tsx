import { useNavigation } from '@/app/hooks/useNavigation'
import { CapabilityIcon } from '@/features/capabilities/components/CapabilityIcon'
import { CAPABILITY_LEVEL_TILE_COLORS } from '@/features/capabilities/utils/capability-level-colors'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import type { CapabilityDefinition, CapabilityRating } from '@/types'
import { IconTile, IconTileButton, InlineMeta, Tooltip } from '@/ui'

const CAPABILITY_CELL = 'flex flex-[0_0_auto]'

/** A tested capability: its tile, coloured by the rating, opens its details. */
export function RatedCapability({ capability }: { capability: CapabilityRating }) {
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
export function UnratedCapability({ capability }: { capability: CapabilityDefinition }) {
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
