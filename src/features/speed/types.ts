// Types only the speed feature's UI uses. What the backend sends lives in
// src/types.

/** The link a speed test ran (or will run) over, as shown beside its results. */
export interface SpeedTestConnection {
  type: 'wifi' | 'ethernet'
  name: string | null
  band: string | null
}
