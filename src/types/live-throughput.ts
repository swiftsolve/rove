export interface LiveThroughput {
  downloadMbps: number
  uploadMbps: number
  timestamp: number
}

export const EMPTY_LIVE_THROUGHPUT: LiveThroughput = {
  downloadMbps: 0,
  uploadMbps: 0,
  timestamp: 0,
}
