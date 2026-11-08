import { cx } from 'class-variance-authority'
import { useId, useMemo, useState } from 'react'

import { useElementWidth } from '@/features/live-throughput/hooks/useElementWidth'
import { useSmoothScale } from '@/features/live-throughput/hooks/useSmoothScale'
import { useTraceScroll } from '@/features/live-throughput/hooks/useTraceScroll'
import { buildTrace, formatAxisLabel, headMbps, slotWidth } from '@/features/live-throughput/utils/throughput-chart'
import { CHART_WINDOW_LABEL } from '@/features/live-throughput/utils/throughput-history'

const CHART_HEIGHT = 80
// The right margin is the y-axis labels' 28px column, wide enough for the
// widest ("125M"), and a 12px gap (--spacing-12) so the "Now" dots never
// crowd them. The time axis's right padding repeats it.
const CHART_MARGIN = { top: 4, right: 40, bottom: 4, left: 2 }
const PLOT_HEIGHT = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom

const AXIS_LABEL_TEXT = 'type-caption text-tertiary num'

// The 4px inset matches the chart's vertical margin.
const Y_AXIS_LABELS = cx(
  'pointer-events-none absolute top-4 right-0 bottom-4 w-[28px]',
  'flex flex-col items-end justify-between',
  AXIS_LABEL_TEXT,
)

type ThroughputChartProps = {
  /** Download samples (Mbps), oldest first. Each new array is a new sample. */
  download: number[]
  /** Upload samples (Mbps), oldest first. */
  upload: number[]
  /** The scale's ceiling (Mbps). The chart and its labels count to it as it changes. */
  maxMbps: number
}

/**
 * The last minute of download and upload as shaded areas, with a
 * dot on each where it meets "Now". The trace scrolls left continuously, and
 * each dot rides the line as it goes.
 */
export function ThroughputChart({ download, upload, maxMbps }: ThroughputChartProps) {
  const idPrefix = useId().replace(/:/g, '')
  const downFillId = `${idPrefix}-down`
  const upFillId = `${idPrefix}-up`
  const clipId = `${idPrefix}-clip`

  const [chartElement, setChartElement] = useState<HTMLDivElement | null>(null)
  const width = useElementWidth(chartElement)
  const plotWidth = Math.max(0, (width ?? 0) - CHART_MARGIN.left - CHART_MARGIN.right)
  const scaleMax = useSmoothScale(maxMbps)

  const progress = useTraceScroll(download)

  // Rebuilt each frame of a scroll, as the dots move along the line.
  const size = { width: plotWidth, height: PLOT_HEIGHT }
  const downTrace = buildTrace(download, size, scaleMax, progress)
  const upTrace = buildTrace(upload, size, scaleMax, progress)
  const hasTrace = plotWidth > 0 && downTrace !== null && upTrace !== null
  const label = useMemo(() => describeChart(headMbps(download, 1), headMbps(upload, 1)), [download, upload])

  // The trace fades in only once the feed has been empty while the chart was
  // up: on launch, and after the window was hidden, which clears the history.
  // Coming back to Home with the history kept shows it as it is.
  const [hasBeenEmpty, setHasBeenEmpty] = useState(download.length === 0)
  if (download.length === 0 && !hasBeenEmpty) setHasBeenEmpty(true)

  return (
    <div className="relative [contain:layout]">
      <div ref={setChartElement} className="relative h-[80px]" role="img" aria-label={label}>
        <svg width="100%" height={CHART_HEIGHT} className="block overflow-visible">
          <defs>
            {/* Over the plot, not each area's own box, which moves with its
                tallest point and would flash the fill as peaks come and go. */}
            <linearGradient id={downFillId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={PLOT_HEIGHT}>
              <stop offset="0%" stopColor="var(--series-down)" className="[stop-opacity:var(--opacity-tint-xl)]" />
              <stop offset="100%" stopColor="var(--series-down)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={upFillId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={PLOT_HEIGHT}>
              <stop offset="0%" stopColor="var(--series-up)" className="[stop-opacity:var(--opacity-tint-xl)]" />
              <stop offset="100%" stopColor="var(--series-up)" stopOpacity={0} />
            </linearGradient>
            {/* The plot's width, and the chart's full height so a peak's stroke isn't cut. */}
            <clipPath id={clipId}>
              <rect x={0} y={-CHART_MARGIN.top} width={plotWidth} height={CHART_HEIGHT} />
            </clipPath>
          </defs>

          <g transform={`translate(${CHART_MARGIN.left} ${CHART_MARGIN.top})`}>
            <line
              x2={plotWidth}
              y1={PLOT_HEIGHT / 2}
              y2={PLOT_HEIGHT / 2}
              stroke="var(--border-default)"
              strokeOpacity={0.15}
            />
            <line x2={plotWidth} y1={PLOT_HEIGHT} y2={PLOT_HEIGHT} stroke="var(--border-default)" strokeOpacity={0.2} />

            {hasTrace && (
              <g className={hasBeenEmpty ? 'animate-fade-in' : undefined}>
                <g clipPath={`url(#${clipId})`}>
                  <g transform={`translate(${-progress * slotWidth(plotWidth)} 0)`}>
                    {/* Upload first, so download draws on top of it. */}
                    <path d={upTrace.area} fill={`url(#${upFillId})`} />
                    <path
                      d={upTrace.line}
                      fill="none"
                      stroke="var(--series-up)"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      className="[stroke-opacity:var(--opacity-high)]"
                    />
                    <path d={downTrace.area} fill={`url(#${downFillId})`} />
                    <path
                      d={downTrace.line}
                      fill="none"
                      stroke="var(--series-down)"
                      strokeWidth={1.75}
                      strokeLinecap="round"
                    />
                  </g>
                </g>
                <circle cx={plotWidth} cy={upTrace.headY} r={2.25} fill="var(--series-up)" />
                <circle cx={plotWidth} cy={downTrace.headY} r={2.5} fill="var(--series-down)" />
              </g>
            )}
          </g>
        </svg>

        {/* The eased scale, so the labels count along with the trace. */}
        <div className={Y_AXIS_LABELS} aria-hidden>
          <span className="translate-y-[-50%]">{formatAxisLabel(scaleMax)}</span>
          <span>{formatAxisLabel(scaleMax / 2)}</span>
          {/* Centred on the baseline so it lines up with the reference line. */}
          <span className="translate-y-[50%]">0</span>
        </div>
      </div>

      {/* The time axis; its right padding is the chart's right margin, so "Now" ends under the dots. */}
      <div className={cx('mt-6 flex justify-between pr-[calc(28px+var(--spacing-12))]', AXIS_LABEL_TEXT)} aria-hidden>
        <span>{CHART_WINDOW_LABEL}</span>
        <span>Now</span>
      </div>
    </div>
  )
}

function describeChart(downMbps: number, upMbps: number): string {
  return `Throughput over time. Currently ${downMbps.toFixed(1)} megabits per second down, ${upMbps.toFixed(1)} up`
}
