import type { CapabilityRating } from '@/types'
import { CAPABILITY_LEVEL_LABELS } from '@/types'
import CapabilityIcon from '@/components/capabilities/CapabilityIcon'
import Section from '@/components/ui/Section'
import { Tooltip } from '@/components/ui/Tooltip'
import { ZapIcon } from '@/components/ui/Icons'
import './CapabilityStrip.css'

interface CapabilityStripProps {
  readonly capabilities: readonly CapabilityRating[]
  readonly onOpenDetails: () => void
}

export default function CapabilityStrip({
  capabilities,
  onOpenDetails,
}: CapabilityStripProps): JSX.Element {
  return (
    <Section
      title="Capabilities"
      icon={<ZapIcon size={15} />}
      className="capability-strip-section"
    >
      <div className="capability-strip" role="list">
        {capabilities.map((capability) => (
          <Tooltip
            key={capability.id}
            content={`${capability.label} · ${CAPABILITY_LEVEL_LABELS[capability.level]}`}
            align="left"
            placement="top"
          >
            <button
              type="button"
              className={`capability-strip-item capability-icon-tile level-${capability.level}`}
              onClick={onOpenDetails}
              aria-label={`${capability.label}: ${CAPABILITY_LEVEL_LABELS[capability.level]}`}
              role="listitem"
            >
              <CapabilityIcon id={capability.id} size={16} />
            </button>
          </Tooltip>
        ))}
      </div>
    </Section>
  )
}
