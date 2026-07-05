import type { CapabilityLevel, CapabilityRating, SpeedResult } from '@/types'
import { CAPABILITY_LEVEL_LABELS } from '@/types'
import { explainCapability } from '@/components/capabilities/capability-detail'
import CapabilityIcon from '@/components/capabilities/CapabilityIcon'
import CapabilityMeter from '@/components/capabilities/CapabilityMeter'
import Subpage from '@/components/ui/Subpage'
import { AlertIcon, CheckIcon, CloseIcon } from '@/components/ui/Icons'
import { formatTimeAgo } from '@/lib/format'
import './CapabilityDetails.css'

/** The verdict glyph: a tick when the connection clears the bar, a warning when
 *  it only just scrapes by, a cross when it falls short. */
function VerdictIcon({ level }: { readonly level: CapabilityLevel }): JSX.Element {
  if (level === 'excellent' || level === 'good') return <CheckIcon size={14} />
  if (level === 'fair') return <AlertIcon size={13} />
  return <CloseIcon size={14} />
}

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
      <header className="cap-detail-head">
        <CapabilityIcon
          id={capability.id}
          size={17}
          className={`cap-detail-icon level-${capability.level}`}
        />
        <div className="cap-detail-headtext">
          <span className="cap-detail-name">{capability.label}</span>
          <span className="cap-detail-desc">{capability.description}</span>
        </div>
        <CapabilityMeter level={capability.level} showLabel={false} />
      </header>

      <div className="cap-metrics">
        {checks.map((check) => (
          <div key={check.label} className={`cap-metric ${check.pass ? 'pass' : 'fail'}`}>
            <span className="field-label">{check.label}</span>
            <span className="cap-metric-value num">{check.have}</span>
            <span className="cap-metric-need">{check.need}</span>
          </div>
        ))}
      </div>

      <div className="cap-detail-verdict">
        <p className="cap-detail-summary">
          <span className={`cap-verdict-icon level-${capability.level}`} aria-hidden>
            <VerdictIcon level={capability.level} />
          </span>
          <span>{summary}</span>
        </p>
        <span className={`cap-verdict-status level-${capability.level}`}>
          <span className="cap-verdict-dot" aria-hidden />
          {CAPABILITY_LEVEL_LABELS[capability.level]}
        </span>
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
