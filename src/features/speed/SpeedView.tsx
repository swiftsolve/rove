import { cx } from 'class-variance-authority'
import { useNavigation } from '@/app/hooks/useNavigation'
import { useNetwork } from '@/app/hooks/useNetwork'
import { useSpeedTest } from '@/features/speed/hooks/useSpeedTest'
import { useCanRunSpeedTest } from '@/features/speed/hooks/useCanRunSpeedTest'
import { SpeedTestSection } from '@/features/speed/components/SpeedTestSection'
import { CapabilityList } from '@/features/capabilities/CapabilityList'
import { CapabilityDetailsView } from '@/features/capabilities/CapabilityDetailsView'
import { SpeedHistoryView } from '@/features/speed/SpeedHistoryView'
import { Tooltip } from '@/components/Tooltip'
import { DotSeparator } from '@/components/DotSeparator'
import { ViewHeader } from '@/components/ViewHeader'
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

/** "Testing…" while a test runs, otherwise when the last result landed; both
 *  link to the history once there is a result. */
function HeaderSubtitle(): JSX.Element {
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  const { isTesting, completedAt } = useSpeedTest()

  if (isTesting) {
    return (
      <>
        <span className="page-header-status text-tertiary">Testing…</span>
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
        <span>
          Updated{' '}
          <time dateTime={new Date(completedAt).toISOString()}>{formatTimeAgo(completedAt, now)}</time>
        </span>
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
      <Button
        variant="filled"
        isStop
        onClick={cancelTest}
        aria-label="Stop test"
      >
        <StopIcon size={12} />
        Stop
      </Button>
    )
  }

  if (!canTest) {
    return (
      <Tooltip content="Connect to a network first">
        <Button variant="filled" isDisabled>
          <PlayIcon size={13} />
          Run test
        </Button>
      </Tooltip>
    )
  }

  const hasRunTest = internetSpeed != null
  const runLabel = hasRunTest ? 'Test again' : 'Run test'
  return (
    <Button
      variant="filled"
      onClick={() => void runTest()}
      aria-label={runLabel}
    >
      <PlayIcon size={13} />
      {runLabel}
    </Button>
  )
}

export function SpeedView(): JSX.Element | null {
  const { location } = useNavigation()
  const { info } = useNetwork()
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
    <div className="page">
      <ViewHeader
        icon={<SpeedIcon size={18} />}
        title="Speed"
        subtitle={<HeaderSubtitle />}
        // The "Updated …" meta, dot and history link sit on one centred line.
        subtitleClassName="inline-flex items-center gap-6"
        isSubtitleShown={completedAt != null}
        // The header's 6px gap pairs icon chips; beside a full button the help
        // chip needs the wider 10px step to read as its own control.
        actions={
          <div className="flex items-center gap-10">
            <Tooltip content={SPEED_HINT}>
              <IconButton
                aria-label="About speed tests"
              >
                <HelpIcon size={16} />
              </IconButton>
            </Tooltip>
            <TestButton />
          </div>
        }
      />

      <SpeedTestSection />

      <CapabilityList />
    </div>
  )
}
