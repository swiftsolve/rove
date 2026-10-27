import { useNavigation } from '@/app/hooks/useNavigation'
import { useAppData } from '@/app/hooks/useAppData'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { SpeedTestSection } from '@/features/speed/components/SpeedTestSection'
import { CapabilityList } from '@/features/capabilities/CapabilityList'
import { CapabilityDetailsView } from '@/features/capabilities/CapabilityDetailsView'
import { SpeedHistoryView } from '@/features/speed/SpeedHistoryView'
import { Tooltip } from '@/components/Tooltip'
import { DotSeparator } from '@/components/DotSeparator'
import { ViewHeader } from '@/components/ViewHeader'
import { ChevronRightIcon, HistoryIcon, PlayIcon, SpeedIcon, StopIcon } from '@/components/icons/Icons'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import styles from './SpeedView.module.css'

/** Opens the speed-test history subpage. */
function HistoryLink(): JSX.Element {
  const { navigate } = useNavigation()
  return (
    <button
      type="button"
      className={styles.historyLink}
      onClick={() => navigate({ tab: 'speed', speedSub: { view: 'history' } })}
    >
      <HistoryIcon size={13} />
      <span className={styles.historyLinkText}>All Results</span>
      <ChevronRightIcon size={13} className="link-caret" />
    </button>
  )
}

/** "Testing…" while a test runs, otherwise when the last result landed; both
 *  link to the history once there is a result. */
function HeaderSubtitle(): JSX.Element {
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  const { isTesting, completedAt } = useSpeedTest()

  if (isTesting) {
    return (
      <>
        <span className="view-header-status">Testing…</span>
        {completedAt != null && (
          <>
            <DotSeparator />
            <HistoryLink />
          </>
        )}
      </>
    )
  }

  if (completedAt != null) {
    return (
      <>
        Updated {formatTimeAgo(completedAt, now)}
        <DotSeparator />
        <HistoryLink />
      </>
    )
  }

  return <>Measure your download and upload speeds</>
}

/** Stop while a test runs; otherwise Run (or Test again), disabled offline. */
function TestButton(): JSX.Element {
  const { internetSpeed, isTesting, runTest, cancelTest } = useSpeedTest()
  const canTest = useCanRunSpeedTest()

  if (isTesting) {
    return (
      <button
        type="button"
        className="btn-primary btn-filled is-stop"
        onClick={cancelTest}
        aria-label="Stop test"
      >
        <StopIcon size={12} />
        Stop
      </button>
    )
  }

  if (!canTest) {
    return (
      <Tooltip content="Connect to a network first">
        <button
          type="button"
          className="btn-primary btn-filled"
          disabled
          aria-label="Run test"
        >
          <PlayIcon size={13} />
          Run test
        </button>
      </Tooltip>
    )
  }

  const hasRunTest = internetSpeed != null
  const runLabel = hasRunTest ? 'Test again' : 'Run test'
  return (
    <button
      type="button"
      className="btn-primary btn-filled"
      onClick={() => void runTest()}
      aria-label={runLabel}
    >
      <PlayIcon size={13} />
      {runLabel}
    </button>
  )
}

export function SpeedView(): JSX.Element | null {
  const { location } = useNavigation()
  const { info } = useAppData().network
  const { internetSpeed, completedAt } = useSpeedTest()

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
    <div className="view-page">
      <ViewHeader
        icon={<SpeedIcon size={18} />}
        title="Speed"
        subtitle={<HeaderSubtitle />}
        subtitleClassName={styles.headerSub}
        isSubtitleShown={completedAt != null}
        actions={<TestButton />}
      />

      <SpeedTestSection />

      <CapabilityList />
    </div>
  )
}
