import { useId, useMemo } from 'react'
import { sanitizeRate } from '@shared/types'
import { resolveChartScale } from '../utils/chart-scale'
import { buildChartPaths } from '../utils/chart-path'
import { formatChartWindowLabel } from '../utils/throughput-history'
import './ThroughputChart.css'

const CHART_WIDTH = 360
const CHART_HEIGHT = 72

interface ThroughputChartProps {
  readonly download: readonly number[]
  readonly upload: readonly number[]
  readonly speedTestRunning?: boolean
  readonly linkCapacityMbps?: number | null
}

/** Trim to a clean, consistent tick: no trailing ".0", 1 decimal only below 10. */
function trimNum(value: number): string {
  return String(Number(value.toFixed(value >= 10 ? 0 : 1)))
}

function formatAxis(mbps: number): string {
  const safe = sanitizeRate(mbps)
  if (safe === 0) return '0'
  if (safe >= 1000) return `${trimNum(safe / 1000)}G`
  return `${trimNum(safe)}M`
}

export default function ThroughputChart({
  download,
  upload,
  speedTestRunning = false,
  linkCapacityMbps = null,
}: ThroughputChartProps): JSX.Element {
  const gradientId = useId().replace(/:/g, '')
  const upGradientId = `${gradientId}-up`

  const maxValue = resolveChartScale(download, upload, {
    linkCapacityMbps,
    speedTestRunning,
  })

  const { downPaths, upPaths } = useMemo(() => {
    const safeDownload = download.map(sanitizeRate)
    const safeUpload = upload.map(sanitizeRate)

    return {
      downPaths: buildChartPaths(safeDownload, CHART_WIDTH, CHART_HEIGHT, maxValue),
      upPaths: buildChartPaths(safeUpload, CHART_WIDTH, CHART_HEIGHT, maxValue),
    }
  }, [download, upload, maxValue])

  const latestDown = downPaths.points.at(-1)
  const latestUp = upPaths.points.at(-1)

  return (
    <div className="tp-chart">
      <div className="tp-chart-plot">
        <svg
          className="tp-chart-svg"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Download and upload throughput over time"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-down)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--series-down)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={upGradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-up)" stopOpacity="0.08" />
              <stop offset="100%" stopColor="var(--series-up)" stopOpacity="0" />
            </linearGradient>
          </defs>

          <line x1="0" y1={CHART_HEIGHT / 2} x2={CHART_WIDTH} y2={CHART_HEIGHT / 2} className="tp-gridline faint" />
          <line x1="0" y1={CHART_HEIGHT} x2={CHART_WIDTH} y2={CHART_HEIGHT} className="tp-baseline" />

          {downPaths.area && <path d={downPaths.area} fill={`url(#${gradientId})`} />}

          {upPaths.area && (
            <path d={upPaths.area} fill={`url(#${upGradientId})`} opacity="0.9" />
          )}

          {upPaths.line && (
            <path
              d={upPaths.line}
              fill="none"
              stroke="var(--series-up)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 3"
              opacity="0.8"
            />
          )}
          {downPaths.line && (
            <path
              d={downPaths.line}
              fill="none"
              stroke="var(--series-down)"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {latestUp && (
            <circle cx={latestUp.x} cy={latestUp.y} r="2.25" fill="var(--series-up)" />
          )}
          {latestDown && (
            <>
              <circle cx={latestDown.x} cy={latestDown.y} r="5" fill="var(--series-down)" opacity="0.16" />
              <circle cx={latestDown.x} cy={latestDown.y} r="2.5" fill="var(--series-down)" />
            </>
          )}
        </svg>

        <div className="tp-chart-scale num" aria-hidden>
          <span>{formatAxis(maxValue)}</span>
          <span>{formatAxis(maxValue / 2)}</span>
          <span>0</span>
        </div>
      </div>

      <div className="tp-chart-axis num" aria-hidden>
        <span>{formatChartWindowLabel()}</span>
        <span>now</span>
      </div>
    </div>
  )
}
