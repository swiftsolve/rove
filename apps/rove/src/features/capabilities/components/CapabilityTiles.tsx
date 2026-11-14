import { IconTile, IconTileButton, InlineMeta, Tooltip } from '@swiftsolve/rove-ui'

import { useNavigation } from '@/app/hooks/useNavigation'
import { CapabilityIcon } from '@/features/capabilities/components/CapabilityIcon'
import { CAPABILITY_LEVEL_TILE_COLORS } from '@/features/capabilities/utils/capability-level-colors'
import { CAPABILITY_LEVEL_LABELS } from '@/features/capabilities/utils/capability-level-labels'
import type { CapabilityDefinition, CapabilityRating } from '@/types'

const CAPABILITY_CELL = 'flex flex-[0_0_auto]'

/** A tested capability: its tile, coloured by the rating, opens its details. */
export function RatedCapability({ capability }: { capability: CapabilityRating }) {
  const { navigate } = useNavigation()
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
        // The button's label already says the same.
        shouldDescribe={false}
      >
        <IconTileButton
          color={CAPABILITY_LEVEL_TILE_COLORS[capability.level]}
          label={`${capability.label}: ${levelLabel}`}
          onClick={openDetails}
          icon={<CapabilityIcon id={capability.id} size={16} />}
        />
      </Tooltip>
    </li>
  )
}

/** A capability with no rating to show, before the first test or during one: a greyed-out tile. */
export function UnratedCapability({ capability }: { capability: CapabilityDefinition }) {
  return (
    <li className={CAPABILITY_CELL}>
      <Tooltip content={capability.label} side="top">
        {/* Faded like a disabled control: nothing to open until a test finishes. */}
        <IconTile
          color="neutral"
          className="opacity-(--opacity-disabled)"
          icon={<CapabilityIcon id={capability.id} size={16} />}
        />
      </Tooltip>
    </li>
  )
}
