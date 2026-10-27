import { memo } from 'react'
import { useLiveThroughput } from '@/features/live-throughput/hooks/useLiveThroughput'
import { Section } from '@/components/Section'
import { SpeedReadout } from '@/features/live-throughput/SpeedReadout'
import { ThroughputChart } from '@/features/live-throughput/ThroughputChart'
import { ActivityIcon } from '@/components/icons/Icons'
import { cx } from '@/lib/cx'
import styles from './LiveThroughputPanel.module.css'

export const LiveThroughputPanel = memo(function LiveThroughputPanel(): JSX.Element {
  const { throughput, history } = useLiveThroughput()

  return (
    <Section
      title="Traffic"
      icon={<ActivityIcon size={15} />}
      action={<span className={cx('text-meta', styles.badge, styles.isLive)}>Live</span>}
    >
      <div className={styles.readouts}>
        <SpeedReadout label="Download" mbps={throughput.downloadMbps} series="down" />
        <SpeedReadout label="Upload" mbps={throughput.uploadMbps} series="up" />
      </div>

      <div className={styles.chartWrap}>
        <ThroughputChart download={history.download} upload={history.upload} />
      </div>
    </Section>
  )
})
