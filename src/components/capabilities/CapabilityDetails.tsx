import type { CapabilityRating, SpeedResult } from '@/types'
import { explainCapability } from '@/components/capabilities/capability-detail'
import CapabilityIcon from '@/components/capabilities/CapabilityIcon'
import CapabilityMeter from '@/components/capabilities/CapabilityMeter'
import Subpage from '@/components/ui/Subpage'
import { formatTimeAgo } from '@/lib/format'
import './CapabilityDetails.css'

interface CapabilityDetailsProps {
  readonly capabilities: readonly CapabilityRating[]
  readonly speed: SpeedResult
  readonly completedAt: number | null
  readonly onBack: () => void
}

function CapabilityDetailCard({
  capability,
  speed,
}: {
  readonly capability: CapabilityRating
  readonly speed: SpeedResult
}): JSX.Element {
  const { summary, checks } = explainCapability(capability.id, capability.level, speed)

  return (
    <section className="cap-detail surface">
      <div className="cap-detail-intro">
        <header className="cap-detail-head">
          <CapabilityIcon
            id={capability.id}
            size={17}
            className={`cap-detail-icon level-${capability.level}`}
          />
          <span className="cap-detail-name">{capability.label}</span>
          <CapabilityMeter level={capability.level} />
        </header>

        <p className="cap-detail-summary">{summary}</p>
      </div>

      <div className="cap-metrics">
        {checks.map((check) => (
          <div key={check.label} className={`cap-metric ${check.pass ? 'pass' : 'fail'}`}>
            <span className="field-label">{check.label}</span>
            <span className="cap-metric-value num">{check.have}</span>
            <span className="cap-metric-need">{check.need}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function CapabilityDetails({
  capabilities,
  speed,
  completedAt,
  onBack,
}: CapabilityDetailsProps): JSX.Element {
  return (
    <Subpage
      title="Capabilities"
      description={
        completedAt != null ? `Updated ${formatTimeAgo(completedAt)}` : undefined
      }
      onBack={onBack}
    >
      <div className="cap-detail-list">
        {capabilities.map((capability) => (
          <CapabilityDetailCard key={capability.id} capability={capability} speed={speed} />
        ))}
      </div>
    </Subpage>
  )
}
