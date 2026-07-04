import type { LiveThroughput } from '@shared/types'
import type { ThroughputHistory } from '../utils/throughput-history'
import Section from './ui/Section'
import SpeedReadout from './ui/SpeedReadout'
import ThroughputChart from './ThroughputChart'
import { ActivityIcon } from './Icons'
import './LiveThroughputPanel.css'

interface LiveThroughputPanelProps {
  readonly throughput: LiveThroughput
  readonly history: ThroughputHistory
  readonly speedTestRunning?: boolean
  readonly linkCapacityMbps?: number | null
}

export default function LiveThroughputPanel({
  throughput,
  history,
  speedTestRunning = false,
  linkCapacityMbps = null,
}: LiveThroughputPanelProps): JSX.Element {
  return (
    <Section
      className="live-panel"
      title="Live traffic"
      icon={<ActivityIcon size={15} />}
      action={<span className="text-meta live-badge live">Live</span>}
    >
      <div className="live-readouts">
        <SpeedReadout label="Download" mbps={throughput.downloadMbps} series="down" compact />
        <SpeedReadout label="Upload" mbps={throughput.uploadMbps} series="up" compact />
      </div>

      <div className="live-chart-wrap">
        <ThroughputChart
          download={history.download}
          upload={history.upload}
          speedTestRunning={speedTestRunning}
          linkCapacityMbps={linkCapacityMbps}
        />
      </div>
    </Section>
  )
}
