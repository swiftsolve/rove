import { useNow } from '@/hooks/useNow'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/utils/format'

type UpdatedAgoProps = {
  /** Epoch ms. */
  timestamp: number
  /** The word before the time: "Updated", or "Tested" for a speed test's result. */
  verb?: string
}

/** "Updated 5 min ago", kept current as time passes. It reads the clock itself, so only it re-renders. */
export function UpdatedAgo({ timestamp, verb = 'Updated' }: UpdatedAgoProps) {
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  return (
    <>
      {verb} <time dateTime={new Date(timestamp).toISOString()}>{formatTimeAgo(timestamp, now)}</time>
    </>
  )
}
