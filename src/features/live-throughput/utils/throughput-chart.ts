import { sanitizeRate } from '@/types'

/** One point on the chart: a sample's position and its rates (Mbps). */
export interface ChartRow {
  index: number
  down: number
  up: number
}

/** One chart row per sample index; a missing sample reads as zero. */
export function buildChartRows(download: number[], upload: number[]): ChartRow[] {
  const rowCount = Math.max(download.length, upload.length)
  const rows: ChartRow[] = Array.from({ length: rowCount }, (_, index) => ({
    index,
    down: sanitizeRate(download[index] ?? 0),
    up: sanitizeRate(upload[index] ?? 0),
  }))
  // A lone sample renders as a dot centered in the plot (the x-domain collapses
  // to a single value). Seed a leading zero so the first sample draws as a short
  // line anchored to the right ("Now") instead, matching the steady-state trace.
  const first = rows[0]
  if (rows.length === 1 && first) {
    rows.unshift({ index: first.index - 1, down: 0, up: 0 })
  }
  return rows
}

/** A y-axis label: "0", "25M", "2.5M", "1.2G". */
export function formatAxisLabel(mbps: number): string {
  const safeMbps = sanitizeRate(mbps)
  if (safeMbps === 0) return '0'
  if (safeMbps >= 1000) return `${formatTickNumber(safeMbps / 1000)}G`
  return `${formatTickNumber(safeMbps)}M`
}

/** A clean, consistent tick: no trailing ".0", one decimal only below 10. */
function formatTickNumber(value: number): string {
  return String(Number(value.toFixed(value >= 10 ? 0 : 1)))
}
