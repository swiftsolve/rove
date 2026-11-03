import type { JSX } from 'react'

import { UpdatedAgo } from '@/app/components/UpdatedAgo'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useNetwork } from '@/app/hooks/useNetwork'
import { CapabilityDetailsView } from '@/features/capabilities/CapabilityDetailsView'
import { CapabilityList } from '@/features/capabilities/components/CapabilityList'
import { SpeedTestCard } from '@/features/speed/components/SpeedTestCard'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { SpeedHistoryView } from '@/features/speed/SpeedHistoryView'
import {
  Button,
  DotSeparator,
  HelpIcon,
  HistoryIcon,
  IconButton,
  Link,
  PageHeader,
  PlayIcon,
  SpeedIcon,
  StopIcon,
  Tooltip,
} from '@/ui'

const SPEED_HINT = 'Tests this computer’s connection, Wi-Fi included. One test can use over 1 GB on fast links.'

/** Opens the speed-test history subpage. */
function HistoryLink() {
  const { navigate } = useNavigation()
  return (
    <Link icon={HistoryIcon} onClick={() => navigate({ tab: 'speed', speedSub: { view: 'history' } })}>
      All Results
    </Link>
  )
}

/** "Testing…" in the description's place while a test runs, still linking to the history once there is a result. */
function HeaderStatus() {
  const completedAt = useSpeedTest((test) => test.completedAt)
  return (
    <span className="inline-flex items-center gap-6">
      Testing…
      {completedAt != null && (
        <>
          <DotSeparator />
          <HistoryLink />
        </>
      )}
    </span>
  )
}

/** When the last result landed, linking to the history; an intro before any. */
function HeaderDescription() {
  const completedAt = useSpeedTest((test) => test.completedAt)
  if (completedAt == null) return <>Measure your download and upload speeds</>
  return (
    <span className="inline-flex items-center gap-6">
      <span>
        <UpdatedAgo timestamp={completedAt} />
      </span>
      <DotSeparator />
      <HistoryLink />
    </span>
  )
}

/** Stop while a test runs; otherwise Run (or Test again), disabled offline. */
function TestButton() {
  const hasRunTest = useSpeedTest((test) => test.internetSpeed != null)
  const isTesting = useSpeedTest((test) => test.isTesting)
  const runTest = useSpeedTest((test) => test.runTest)
  const cancelTest = useSpeedTest((test) => test.cancelTest)
  const canTest = useCanRunSpeedTest()

  if (isTesting) {
    return (
      <Button variant="solid" tone="negative" icon={StopIcon} onClick={cancelTest} aria-label="Stop test">
        Stop
      </Button>
    )
  }

  if (!canTest) {
    return (
      <Tooltip content="Connect to a network first">
        <Button variant="solid" icon={PlayIcon} isDisabled>
          Run test
        </Button>
      </Tooltip>
    )
  }

  const runLabel = hasRunTest ? 'Test again' : 'Run test'
  return (
    <Button variant="solid" icon={PlayIcon} onClick={() => void runTest()}>
      {runLabel}
    </Button>
  )
}

export function SpeedView(): JSX.Element | null {
  const { location } = useNavigation()
  const { info } = useNetwork()
  const internetSpeed = useSpeedTest((test) => test.internetSpeed)
  const isTesting = useSpeedTest((test) => test.isTesting)

  if (!info) return null

  // Owned by the app's navigation stack, so Back pops the right screen.
  const subpage = location.speedSub ?? null

  if (subpage?.view === 'history') {
    return <SpeedHistoryView />
  }

  if (subpage?.view === 'details' && internetSpeed) {
    return <CapabilityDetailsView targetId={subpage.target} />
  }

  return (
    <div className="page">
      <PageHeader
        icon={<SpeedIcon size={18} />}
        title="Speed"
        description={<HeaderDescription />}
        status={isTesting ? <HeaderStatus /> : undefined}
        // Wider than the header's 6px icon gap, so the help chip reads apart from the button.
        actions={
          <div className="flex items-center gap-10">
            <IconButton label="About speed tests" icon={HelpIcon} tooltip={SPEED_HINT} />
            <TestButton />
          </div>
        }
      />

      <SpeedTestCard />

      <CapabilityList />
    </div>
  )
}
