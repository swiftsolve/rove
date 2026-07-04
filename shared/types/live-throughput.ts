export interface LiveThroughput {
  readonly downloadMbps: number
  readonly uploadMbps: number
  readonly timestamp: number
}

export const EMPTY_LIVE_THROUGHPUT: LiveThroughput = {
  downloadMbps: 0,
  uploadMbps: 0,
  timestamp: 0,
}
