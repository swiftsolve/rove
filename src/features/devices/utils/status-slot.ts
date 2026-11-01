// The scan status and the online tally share one slot in the header subtitle and
// cross-slide in place. These are the pieces both use.

// The one on its way out overlays the slot's start rather than taking layout
// space, so the incoming one doesn't get shoved right then snap back.
export const LEAVING = ['absolute top-0 left-0', 'animate-scan-slide-out']

// The green dot before the online tally and the scan status. Nudged up 1px from
// vertical-align's x-height middle to centre on the digits' cap height, the same
// in both so the dot lands in the exact same spot when the two swap.
export const STATUS_DOT = 'relative -top-px mr-8 align-middle bg-status-positive'

// How long the exit slide plays before the indicator unmounts. Matches
// --duration-normal, the length of `animate-scan-slide-out`.
export const SCAN_EXIT_MS = 220
