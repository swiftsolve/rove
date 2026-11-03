import { SpeedReadout } from '@/features/live-throughput/components/SpeedReadout'
import { ThroughputChart } from '@/features/live-throughput/components/ThroughputChart'
import { useLiveThroughput } from '@/features/live-throughput/hooks/useLiveThroughput'
import { useThroughputScale } from '@/features/live-throughput/hooks/useThroughputScale'
import { ActivityIcon, Card, CardBody, CardHeader, LiveBadge } from '@/ui'

/** Home's live traffic: the current download and upload rates over a chart of
 *  the last minute. */
export function TrafficCard() {
  const { throughput, history } = useLiveThroughput()
  const scaleMaxMbps = useThroughputScale(history.download, history.upload)

  return (
    <Card>
      <CardHeader title="Traffic" icon={<ActivityIcon size={15} />} actions={<LiveBadge />} />
      <CardBody>
        <dl className="mb-12 grid grid-cols-2 gap-16">
          <SpeedReadout label="Download" mbps={throughput.downloadMbps} series="down" />
          <SpeedReadout label="Upload" mbps={throughput.uploadMbps} series="up" />
        </dl>

        {/* Fills the whole bottom of the card: bleeds left/right/bottom past the
            card body's padding to the card edges (the card's overflow:hidden
            rounds the corners), then pads the graph back in line with the title. */}
        <div className="-mx-(--card-body-padding) -mb-(--card-body-padding) bg-inset p-(--card-body-padding)">
          <ThroughputChart download={history.download} upload={history.upload} maxMbps={scaleMaxMbps} />
        </div>
      </CardBody>
    </Card>
  )
}
