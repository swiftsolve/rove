import { useNow } from '@/hooks/useNow'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'

/** "Updated 5 min ago", kept current as time passes. It reads the clock itself, so only it re-renders. */
export function UpdatedAgo({ timestamp }: { timestamp: number }) {
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  return (
    <>
      Updated <time dateTime={new Date(timestamp).toISOString()}>{formatTimeAgo(timestamp, now)}</time>
    </>
  )
}
