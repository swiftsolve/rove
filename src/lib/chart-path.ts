export interface ChartPoint {
  readonly x: number
  readonly y: number
}

export interface ChartPaths {
  readonly line: string
  readonly area: string
  readonly points: readonly ChartPoint[]
  readonly maxValue: number
}

const MIN_CHART_MAX_MBPS = 5

function clampMaxValue(values: readonly number[]): number {
  const finite = values.filter((value) => Number.isFinite(value) && value >= 0)
  const peak = finite.length > 0 ? Math.max(...finite) : 0
  return Math.max(MIN_CHART_MAX_MBPS, peak * 1.2)
}

function toPoints(
  values: readonly number[],
  width: number,
  height: number,
  maxValue: number,
): ChartPoint[] {
  if (values.length === 0) {
    return [
      { x: 0, y: height },
      { x: width, y: height },
    ]
  }

  if (values.length === 1) {
    const sample = values[0] ?? 0
    const y = height - (sample / maxValue) * height
    return [
      { x: 0, y: height },
      { x: width, y },
    ]
  }

  const step = width / (values.length - 1)

  return values.map((value, index) => {
    const safe = Number.isFinite(value) && value >= 0 ? value : 0
    return {
      x: index * step,
      y: height - (safe / maxValue) * height,
    }
  })
}

function buildLine(points: readonly ChartPoint[]): string {
  const [firstPoint] = points
  if (!firstPoint) return ''

  let path = `M ${firstPoint.x} ${firstPoint.y}`
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    if (point) path += ` L ${point.x} ${point.y}`
  }
  return path
}

export function buildChartPaths(
  values: readonly number[],
  width: number,
  height: number,
  maxOverride?: number,
): ChartPaths {
  const maxValue = maxOverride ?? clampMaxValue(values)
  const points = toPoints(values, width, height, maxValue)
  const line = buildLine(points)
  const last = points.at(-1)
  const first = points[0]
  const area =
    last && first
      ? `${line} L ${last.x} ${height} L ${first.x} ${height} Z`
      : ''

  return { line, area, points, maxValue }
}
