import { memo } from 'react'
import { cva, cx } from 'class-variance-authority'
import { useLiveThroughput } from '@/features/live-throughput/hooks/useLiveThroughput'
import { Section } from '@/components/Section'
import { SpeedReadout } from '@/features/live-throughput/SpeedReadout'
import { ThroughputChart } from '@/features/live-throughput/ThroughputChart'
import { ActivityIcon } from '@/components/icons/Icons'

// A rounded dark pill wrapping the dot + label, so the badge reads as a discrete
// status chip against the panel. Its size, weight and resting colour come from
// .text-meta.
const badgeVariants = cva(['text-meta', 'inline-flex items-center gap-6 rounded-full bg-inset px-8 py-4'], {
  variants: {
    isLive: {
      true: cx(
        'text-positive',
        "before:inline-block before:size-[5px] before:rounded-[50%] before:bg-current before:content-['']",
        'before:animate-[status-pulse_2s_ease-in-out_infinite]',
      ),
    },
  },
})

export const LiveThroughputPanel = memo(function LiveThroughputPanel(): JSX.Element {
  const { throughput, history } = useLiveThroughput()

  return (
    <Section
      title="Traffic"
      icon={<ActivityIcon size={15} />}
      action={<span className={badgeVariants({ isLive: true })}>Live</span>}
    >
      <dl className="mb-12 grid grid-cols-[1fr_1fr] gap-16">
        <SpeedReadout label="Download" mbps={throughput.downloadMbps} series="down" />
        <SpeedReadout label="Upload" mbps={throughput.uploadMbps} series="up" />
      </dl>

      {/* Fills the whole bottom of the card: bleeds left/right/bottom past the
          section body's padding to the card edges (the card's overflow:hidden
          rounds the corners), then pads the graph back in line with the title. */}
      <div className="-mx-(--section-body-padding) -mb-(--section-body-padding) bg-inset p-(--section-body-padding)">
        <ThroughputChart download={history.download} upload={history.upload} />
      </div>
    </Section>
  )
})
