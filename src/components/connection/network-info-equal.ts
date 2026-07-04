import type { NetworkInfo } from '@/types'

export function networkInfoEqual(
  previous: NetworkInfo | null,
  next: NetworkInfo,
): boolean {
  if (previous === null) return false
  return JSON.stringify(previous) === JSON.stringify(next)
}
