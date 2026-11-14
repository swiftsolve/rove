/**
 * The status text colours (green, amber, red), keyed as recipes name their
 * status axis: `status: STATUS_TEXT`, or `{ positive: STATUS_TEXT.positive, … }`
 * for a subset.
 */
export const STATUS_TEXT: Record<'positive' | 'warning' | 'negative', string> = {
  positive: 'text-positive',
  warning: 'text-warning',
  negative: 'text-negative',
}
