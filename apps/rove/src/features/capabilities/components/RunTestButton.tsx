import { IconButton, PlayIcon, RefreshIcon } from '@swiftsolve/rove-ui'

import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'

/** Starts a test in place; the Speed tab shows the same run (one shared store), and the footer links there. */
export function RunTestButton() {
  const runTest = useSpeedTest((test) => test.runTest)
  const isTesting = useSpeedTest((test) => test.isTesting)
  const hasResults = useSpeedTest((test) => test.capabilities.length > 0)
  const canRunTest = useCanRunSpeedTest()

  return (
    <IconButton
      label={hasResults ? 'Run speed test again' : 'Run speed test'}
      icon={hasResults ? RefreshIcon : PlayIcon}
      iconSize={14}
      tooltip={isTesting ? 'Speed test running' : undefined}
      tooltipSide="left"
      isLoading={isTesting}
      isDisabled={!canRunTest}
      onClick={() => void runTest()}
    />
  )
}
