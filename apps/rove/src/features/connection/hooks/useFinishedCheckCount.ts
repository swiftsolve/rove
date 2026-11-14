import { useState } from 'react'

/** How many checks have finished since mount: one more each time `isRunning` turns false. */
export function useFinishedCheckCount(isRunning: boolean): number {
  const [wasRunning, setWasRunning] = useState(isRunning)
  const [finishedCount, setFinishedCount] = useState(0)
  // Adjusting state during render, as useChangeCount does.
  if (wasRunning !== isRunning) {
    setWasRunning(isRunning)
    if (!isRunning) setFinishedCount(finishedCount + 1)
  }
  return finishedCount
}
