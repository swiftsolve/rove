import type { CapabilityId, CapabilityRating } from '@/types'
import { CAPABILITY_DEFINITIONS } from '@/types'
import CapabilityIcon from '@/components/capabilities/CapabilityIcon'
import CapabilityMeter from '@/components/capabilities/CapabilityMeter'
import Section from '@/components/ui/Section'
import { ChevronRightIcon, ZapIcon } from '@/components/ui/Icons'
import './CapabilityList.css'

interface CapabilityListProps {
  readonly capabilities: readonly CapabilityRating[]
  readonly hasRunTest: boolean
  /** A speed test is currently running — grey out the stale rows until it lands. */
  readonly testing: boolean
  readonly onOpenDetails: (capabilityId: CapabilityId) => void
}

// A few headline use-cases previewed in the empty state before any test runs —
// the full breakdown appears once results come in.
const PREVIEW_IDS: readonly CapabilityId[] = ['browsing', 'streaming-4k', 'video-calls', 'gaming']
const PREVIEW_CAPABILITIES = PREVIEW_IDS.map(
  (id) => CAPABILITY_DEFINITIONS.find((definition) => definition.id === id)!,
)

function CapabilityRow({
  capability,
  testing,
  onOpen,
}: {
  readonly capability: CapabilityRating
  readonly testing: boolean
  readonly onOpen: () => void
}): JSX.Element {
  return (
    <button type="button" className="capability-row" onClick={onOpen} disabled={testing}>
      <div className="capability-row-main">
        <span className={`capability-icon-tile level-${capability.level}`}>
          <CapabilityIcon id={capability.id} size={17} />
        </span>
        <div className="capability-row-text">
          <span className="text-body capability-name">{capability.label}</span>
          <span className="text-hint capability-desc">{capability.description}</span>
        </div>
      </div>
      <div className="capability-row-status">
        <CapabilityMeter level={capability.level} showLabel={false} />
        <ChevronRightIcon size={16} className="capability-chevron" />
      </div>
    </button>
  )
}

export default function CapabilityList({
  capabilities,
  hasRunTest,
  testing,
  onOpenDetails,
}: CapabilityListProps): JSX.Element {
  return (
    <Section
      title="Capabilities"
      icon={<ZapIcon size={15} />}
      action={!hasRunTest ? <span className="text-meta">Available after first test</span> : undefined}
    >
      {!hasRunTest ? (
        <div className="capability-list is-empty">
          {PREVIEW_CAPABILITIES.map((definition) => (
            <div key={definition.id} className="capability-row is-empty">
              <div className="capability-row-main">
                <span className="capability-icon-tile level-empty">
                  <CapabilityIcon id={definition.id} size={17} />
                </span>
                <div className="capability-row-text">
                  <span className="text-body capability-name">{definition.label}</span>
                  <span className="text-hint capability-desc">{definition.description}</span>
                </div>
              </div>
              <span className="capability-empty-value">…</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={`capability-list${testing ? ' capability-list--testing' : ''}`}>
          {capabilities.map((capability) => (
            <CapabilityRow
              key={capability.id}
              capability={capability}
              testing={testing}
              onOpen={() => onOpenDetails(capability.id)}
            />
          ))}
        </div>
      )}
    </Section>
  )
}
