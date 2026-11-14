// The backend's coarse progress steps, mirrored here. The fill creeps to just
// short of the next step and eases to catch up on a jump, so it never visibly steps.
export const DOWNLOAD_PHASE_START_PCT = 15
export const UPLOAD_PHASE_START_PCT = 55
const PROGRESS_STEPS = [0, DOWNLOAD_PHASE_START_PCT, UPLOAD_PHASE_START_PCT, 85, 100]
const PROGRESS_CREEP = 0.12 // % per frame steady creep
const PROGRESS_MARGIN = 4 // stop this far short of the next step until it's confirmed
const STEP_REACHED_TOLERANCE = 0.5 // % within which the backend counts as at a step
const CATCH_UP_EASE = 0.2 // fraction of the gap closed per frame when the backend jumps ahead

function nextStepCeiling(backendPct: number): number {
  for (const step of PROGRESS_STEPS) {
    if (step > backendPct + STEP_REACHED_TOLERANCE) return step
  }
  return 100
}

/** One frame of the smoothed fill: creep toward the next step, catch up to a backend jump, and never move backwards. */
export function advanceFill(fillPct: number, backendPct: number): number {
  const ceiling = backendPct >= 100 ? 100 : nextStepCeiling(backendPct) - PROGRESS_MARGIN
  let next = Math.min(fillPct + PROGRESS_CREEP, ceiling)
  if (backendPct > next) next += (backendPct - next) * CATCH_UP_EASE
  return Math.max(fillPct, next)
}
