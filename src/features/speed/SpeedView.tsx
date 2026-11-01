import { cx } from 'class-variance-authority'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useNetwork } from '@/app/hooks/useNetwork'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { SpeedTestCard } from '@/features/speed/components/SpeedTestCard'
import { CapabilityList } from '@/features/capabilities/CapabilityList'
import { CapabilityDetailsView } from '@/features/capabilities/CapabilityDetailsView'
import { SpeedHistoryView } from '@/features/speed/SpeedHistoryView'
import { Tooltip } from '@/components/Tooltip'
import { DotSeparator } from '@/components/DotSeparator'
import { PageHeader } from '@/components/PageHeader'
import {
  ChevronRightIcon,
  HelpIcon,
  HistoryIcon,
  PlayIcon,
  SpeedIcon,
  StopIcon,
} from '@/components/icons/Icons'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'
import { useNow } from '@/hooks/useNow'
import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'

const SPEED_HINT =
  'Tests this computer’s connection, Wi-Fi included. One test can use over 1 GB on fast links.'

// The "View history" pill link after the "Updated …" meta: quiet at rest, the
// accent on hover. The negative left margin cancels the pill's padding and the
// glyph's empty edge, so the dot keeps the same 8px to the clock as to the text
// before it. Focus shows the way hover does, not with a ring. The glyphs share
// the link's (animating) colour and sit dimmer at rest through opacity, so there's
// one colour animation rather than two that drift apart.
const HISTORY_LINK = cx(
  'group/link ml-[-9.5px] inline-flex items-center gap-[5px] rounded-full px-8 py-2',
  'cursor-pointer text-[length:inherit] font-medium text-secondary',
  'transition-[color] duration-(--duration-fast) ease-in-out',
  'hover:text-accent focus-visible:text-accent focus-visible:outline-none',
  '[&_svg]:text-inherit [&_svg]:opacity-72',
  '[&_svg]:transition-opacity [&_svg]:duration-(--duration-fast) [&_svg]:ease-in-out',
  'hover:[&_svg]:opacity-100 focus-visible:[&_svg]:opacity-100',
)

/** Opens the speed-test history subpage. */
function HistoryLink(): JSX.Element {
  const { navigate } = useNavigation()
  return (
    <button
      type="button"
      className={HISTORY_LINK}
      onClick={() => navigate({ tab: 'speed', speedSub: { view: 'history' } })}
    >
      <HistoryIcon size={13} />
      {/* Only the label underlines, not the clock glyph. */}
      <span
        className={cx(
          'group-hover/link:underline group-hover/link:underline-offset-2',
          'group-focus-visible/link:underline group-focus-visible/link:underline-offset-2',
        )}
      >
        All Results
      </span>
      <ChevronRightIcon size={13} className="link-caret" />
    </button>
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
        variant="danger"
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
        <Button variant="filled" icon={PlayIcon} isDisabled>
          Run test
        </Button>
      </Tooltip>
    )
  }

  const runLabel = hasRunTest ? 'Test again' : 'Run test'
  return (
    <Button
      variant="filled"
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
