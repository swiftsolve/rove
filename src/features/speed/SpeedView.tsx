import { useNavigation } from '@/app/hooks/useNavigation'
import { useNetwork } from '@/app/hooks/useNetwork'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { SpeedTestCard } from '@/features/speed/components/SpeedTestCard'
import { CapabilityList } from '@/features/capabilities/CapabilityList'
import { CapabilityDetailsView } from '@/features/capabilities/CapabilityDetailsView'
import { SpeedHistoryView } from '@/features/speed/SpeedHistoryView'
import {
  Button,
  DotSeparator,
  HelpIcon,
  HistoryIcon,
  IconButton,
  PageHeader,
  PlayIcon,
  SpeedIcon,
  StopIcon,
  Tooltip,
  Link,
} from '@/ui'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { useNow } from '@/hooks/useNow'

const SPEED_HINT =
  'Tests this computer’s connection, Wi-Fi included. One test can use over 1 GB on fast links.'

/** Opens the speed-test history subpage. */
function HistoryLink(): JSX.Element {
  const { navigate } = useNavigation()
  return (
    <Link icon={HistoryIcon} onClick={() => navigate({ tab: 'speed', speedSub: { view: 'history' } })}>
      All Results
    </Link>
  )
}

/** "Testing…" in the description's place while a test runs, still linking to
 *  the history once there is a result. */
function HeaderStatus(): JSX.Element {
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
function HeaderDescription(): JSX.Element {
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  const completedAt = useSpeedTest((test) => test.completedAt)
  if (completedAt == null) return <>Measure your download and upload speeds</>
  return (
    <span className="inline-flex items-center gap-6">
      <span>
        Updated{' '}
        <time dateTime={new Date(completedAt).toISOString()}>{formatTimeAgo(completedAt, now)}</time>
      </span>
      <DotSeparator />
      <HistoryLink />
    </span>
  )
}

/** Stop while a test runs; otherwise Run (or Test again), disabled offline. */
function TestButton(): JSX.Element {
  const hasRunTest = useSpeedTest((test) => test.internetSpeed != null)
  const isTesting = useSpeedTest((test) => test.isTesting)
  const runTest = useSpeedTest((test) => test.runTest)
  const cancelTest = useSpeedTest((test) => test.cancelTest)
  const canTest = useCanRunSpeedTest()

  if (isTesting) {
    return (
      <Button
        variant="solid"
        tone="negative"
        icon={StopIcon}
        onClick={cancelTest}
        aria-label="Stop test"
      >
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
    <Button
      variant="solid"
      icon={PlayIcon}
      onClick={() => void runTest()}
    >
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

  // The subpage layered over the Speed tab, or null for its main page. Owned by
  // the app's navigation stack so Back pops the right screen.
  const sub = location.speedSub ?? null

  if (sub?.view === 'history') {
    return <SpeedHistoryView />
  }

  if (sub?.view === 'details' && internetSpeed) {
    return <CapabilityDetailsView targetId={sub.target} />
  }

  return (
    <div className="page">
      <PageHeader
        icon={<SpeedIcon size={18} />}
        title="Speed"
        description={<HeaderDescription />}
        status={isTesting ? <HeaderStatus /> : undefined}
        // The header's 6px gap pairs icon chips; beside a full button the help
        // chip needs the wider 10px step to read as its own control.
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
