// The scan status and the online tally share one slot in the header subtitle and
// cross-slide in place. These are the pieces both use.

/** The leaving one overlays the slot, so the incoming one isn't shoved aside. */
export const LEAVING = ['absolute top-0 left-0', 'animate-scan-slide-out']

/** Nudged up 1px from the x-height middle to centre on the digits, identical in
 *  both so the dot doesn't move when they swap. */
export const STATUS_DOT = 'relative -top-px mr-8 align-middle'

/** Matches --duration-normal, the length of `animate-scan-slide-out`. */
export const SCAN_EXIT_MS = 220
