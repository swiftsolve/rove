import { formatBytes } from '@/lib/format'

/** Bytes moved each way, as every usage row (app, host, traffic type) has them. */
export interface Transfer {
  rxBytes: number
  txBytes: number
}

export function totalBytes({ rxBytes, txBytes }: Transfer): number {
  return rxBytes + txBytes
}

/** The largest total in a list: the scale its rows' bars share, so they read
 *  comparably at a glance. Zero for an empty list. */
export function busiestTotal(items: Transfer[]): number {
  return items.reduce((max, item) => Math.max(max, totalBytes(item)), 0)
}

/** `value` as a percentage of `max`, guarding the divide for the all-zero case. */
export function percentOf(value: number, max: number): number {
  const scale = max > 0 ? 100 / max : 0
  return value * scale
}

/** Both directions read out in one phrase, e.g. "1.20 MB down, 300 KB up". */
export function transferLabel({ rxBytes, txBytes }: Transfer): string {
  return `${formatBytes(rxBytes)} down, ${formatBytes(txBytes)} up`
}
