import { ActivityIcon, Card, CardBody, CardFooter, CardHeader, LiveBadge } from '@swiftsolve/rove-ui'

import { SpeedReadout } from '@/features/live-throughput/components/SpeedReadout'
import { ThroughputChart } from '@/features/live-throughput/components/ThroughputChart'
import { useLiveThroughput } from '@/features/live-throughput/hooks/useLiveThroughput'
import { useThroughputScale } from '@/features/live-throughput/hooks/useThroughputScale'
import { headMbps } from '@/features/live-throughput/utils/throughput-chart'

/**
 * Home's live traffic: the current download and upload rates over a chart of
 * the last minute. The rates are read off the chart's line at "Now", so the
 * numbers and the dots there agree.
 */
export function TrafficCard() {
  const { throughput, history } = useLiveThroughput()
  const scaleMaxMbps = useThroughputScale(history.download, history.upload)

  return (
    <Card>
      <CardHeader
        title="Traffic"
        icon={<ActivityIcon size={15} />}
        actions={<LiveBadge updatedAt={throughput.timestamp} />}
      />
      <CardBody>
        <dl className="grid grid-cols-2 gap-(--gap-readouts)">
          {/* Each counts to the rate the chart's dot is heading to, once a sample. */}
          <SpeedReadout label="Download" mbps={headMbps(history.download, 1)} series="down" />
          <SpeedReadout label="Upload" mbps={headMbps(history.upload, 1)} series="up" />
        </dl>
      </CardBody>
      <CardFooter>
        <ThroughputChart download={history.download} upload={history.upload} maxMbps={scaleMaxMbps} />
      </CardFooter>
    </Card>
  )
}
