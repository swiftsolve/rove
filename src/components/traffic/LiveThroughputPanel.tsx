import { memo } from 'react'
import type { LiveThroughput } from '@/types'
import type { ThroughputHistory } from '@/components/traffic/throughput-history'
import Section from '@/components/ui/Section'
import SpeedReadout from '@/components/traffic/SpeedReadout'
import ThroughputChart from '@/components/traffic/ThroughputChart'
import { ActivityIcon } from '@/components/ui/Icons'
import './LiveThroughputPanel.css'

interface LiveThroughputPanelProps {
  readonly throughput: LiveThroughput
  readonly history: ThroughputHistory
  readonly speedTestRunning?: boolean
  readonly linkCapacityMbps?: number | null
}

function LiveThroughputPanel({
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

export default memo(LiveThroughputPanel)
