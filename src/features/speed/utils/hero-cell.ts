/**
 * What a hero cell shows. While testing, a direction shows its live peak once
 * its phase has begun, and 0 before that so unset cells read as zero;
 * otherwise it shows the last result.
 */
export function heroCellMbps(
  isTesting: boolean,
  progressPct: number,
  phaseStartPct: number,
  liveMbps: number,
  resultMbps: number | undefined,
): number | null {
  if (!isTesting) return resultMbps ?? null
  return progressPct >= phaseStartPct ? liveMbps : 0
}
