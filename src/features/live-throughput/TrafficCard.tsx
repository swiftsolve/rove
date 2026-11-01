import { memo } from 'react'
import { cva, cx } from 'class-variance-authority'
import { useLiveThroughput } from '@/features/live-throughput/hooks/useLiveThroughput'
import { Card, CardHeader, CardBody } from '@/components/Card'
import { SpeedReadout } from '@/features/live-throughput/SpeedReadout'
import { ThroughputChart } from '@/features/live-throughput/ThroughputChart'
import { ActivityIcon } from '@/components/icons/Icons'

// A rounded dark pill wrapping the dot + label, so the badge reads as a discrete
// status chip against the panel. Its size, weight and resting colour come from
// .text-caption.
const badgeVariants = cva(['text-caption', 'inline-flex items-center gap-6 rounded-full bg-inset px-8 py-4'], {
  variants: {
    isLive: {
      true: cx(
        'text-positive',
        "before:inline-block before:size-[5px] before:rounded-full before:bg-current before:content-['']",
        'before:animate-[status-pulse_2s_ease-in-out_infinite]',
      ),
    },
  },
})

export const TrafficCard = memo(function TrafficCard(): JSX.Element {
  const { throughput, history } = useLiveThroughput()

  return (
    <Card>
      <CardHeader
        title="Traffic"
        icon={<ActivityIcon size={15} />}
        actions={<span className={badgeVariants({ isLive: true })}>Live</span>}
      />
      <CardBody>
        <dl className="mb-12 grid grid-cols-2 gap-16">
          <SpeedReadout label="Download" mbps={throughput.downloadMbps} series="down" />
          <SpeedReadout label="Upload" mbps={throughput.uploadMbps} series="up" />
        </dl>

        {/* Fills the whole bottom of the card: bleeds left/right/bottom past the
            card body's padding to the card edges (the card's overflow:hidden
            rounds the corners), then pads the graph back in line with the title. */}
        <div className="-mx-(--card-body-padding) -mb-(--card-body-padding) bg-inset p-(--card-body-padding)">
          <ThroughputChart download={history.download} upload={history.upload} />
        </div>
      </CardBody>
    </Card>
  )
})
