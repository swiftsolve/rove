import { useId, useState, type ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import { checkForUpdates, type PendingUpdate } from '@/app/utils/updater'
import { useSetting } from '@/hooks/useSetting'
import type { ThemeMode } from '@/app/hooks/useThemeState'
import { useTheme } from '@/app/hooks/useTheme'
import { useNavigation } from '@/app/hooks/useNavigation'
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CheckIcon,
  ChevronRightIcon,
  ComputerIcon,
  MoonIcon,
  PageHeader,
  RefreshIcon,
  SegmentedControl,
  SettingsIcon,
  SunIcon,
  Toggle,
  type SegmentedOption,
} from '@/ui'

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; update: PendingUpdate }

const rowVariants = cva('flex justify-between py-(--row-padding-y)', {
  variants: {
    /** Text above the control instead of beside it: for a control too wide to
     *  sit inline (the three-segment theme picker). */
    isStacked: { true: 'flex-col items-start gap-12', false: 'items-center gap-16' },
  },
  defaultVariants: { isStacked: false },
})

const statusVariants = cva('flex items-center text-xs', {
  variants: {
    kind: {
      'up-to-date': 'gap-6 text-positive',
      available: 'justify-between gap-12 text-secondary',
    },
  },
})

// Rows carry their own symmetric vertical padding, like the Speed page's
// capability list, so the column has no gap and the body no top padding.
const LIST = 'flex flex-col pt-0'

// The update-status footer reads as a continuation of the row list rather than
// a separate sunken band: no top divider, and symmetric padding so the status
// text sits centred in the inset band. With the band present, the body drops its
// bottom padding so only the last row's own padding sits above it; when idle
// (no band) the body keeps it so the card doesn't look cramped.
const UPDATES_FOOTER = 'mt-12 border-t-0 py-12'
const UPDATES_LIST_ABOVE_FOOTER = cx(LIST, 'pb-0')


const ROW_TEXT = 'flex flex-col gap-4 min-w-0'
const ROW_TITLE = 'text-md font-medium text-primary'
const ROW_DESC = 'text-xs leading-caption text-tertiary'

const THEME_OPTIONS: SegmentedOption<ThemeMode>[] = [
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={15} className="shrink-0" /> },
  { value: 'light', label: 'Light', icon: <SunIcon size={15} className="shrink-0" /> },
  { value: 'system', label: 'System', icon: <ComputerIcon size={15} className="shrink-0" /> },
]

/** The colour theme picker: dark, light or system. */
function ThemeSegmented({
  labelId,
  descriptionId,
}: {
  labelId: string
  descriptionId: string
}): JSX.Element {
  const { mode, setMode } = useTheme()
  return (
    <SegmentedControl
      options={THEME_OPTIONS}
      value={mode}
      onChange={setMode}
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
    />
  )
}

/** A labelled row (a list item) with a description and a control (toggle, button, …) on the right. */
function SettingRow({
  title,
  description,
  control,
}: {
  title: string
  description: string
  /** Renders the control, given the description's id so it can point at it. */
  control: (descriptionId: string) => ReactNode
}): JSX.Element {
  const descriptionId = useId()
  return (
    <div className={rowVariants()}>
      <div className={ROW_TEXT}>
        <span className={ROW_TITLE}>{title}</span>
        <span id={descriptionId} className={ROW_DESC}>
          {description}
        </span>
      </div>
      <div className="shrink-0">{control(descriptionId)}</div>
    </div>
  )
}

/** The Updates card's footer: the outcome of a manual check, or nothing
 *  while idle or checking (undefined drops the footer slot entirely). */
function renderCheckResult(check: CheckState): ReactNode {
  if (check.kind === 'up-to-date') {
    return (
      <p className={statusVariants({ kind: 'up-to-date' })}>
        {/* Centring leaves the check a touch high against the text's x-height;
            1px lower settles it onto the text. */}
        <CheckIcon size={14} className="shrink-0 transform-[translateY(1px)]" />
        You're on the latest version.
      </p>
    )
  }
  if (check.kind === 'available') {
    return (
      <div className={statusVariants({ kind: 'available' })}>
        <span>Version {check.update.version} is available.</span>
        <Button onClick={() => void check.update.install()}>
          Install &amp; restart
        </Button>
      </div>
    )
  }
  return undefined
}

/** The same outcome in words, for the screen-reader status line. */
function checkStatusText(check: CheckState): string {
  if (check.kind === 'checking') return 'Checking for updates…'
  if (check.kind === 'up-to-date') return 'You’re on the latest version.'
  if (check.kind === 'available') return `Version ${check.update.version} is available.`
  return ''
}

export function SettingsView(): JSX.Element {
  const { navigate } = useNavigation()
  const [isAutoUpdateEnabled, setIsAutoUpdateEnabled] = useSetting('autoUpdate', true)
  const [areThemeSoundsEnabled, setAreThemeSoundsEnabled] = useSetting('themeSounds', true)
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' })
  const isChecking = check.kind === 'checking'
  const checkResult = renderCheckResult(check)
  const themeLabelId = useId()
  const themeDescriptionId = useId()

  async function runCheck(): Promise<void> {
    setCheck({ kind: 'checking' })
    const update = await checkForUpdates()
    setCheck(update ? { kind: 'available', update } : { kind: 'up-to-date' })
  }

  return (
    <div className="page">
      <PageHeader icon={<SettingsIcon size={18} />} title="Settings" />

      <Card>
        <CardHeader title="Updates" />
        <CardBody className={checkResult != null ? UPDATES_LIST_ABOVE_FOOTER : LIST}>
          <SettingRow
            title="Check for updates automatically"
            description="Look for a newer signed release each time Rove launches."
            control={(descriptionId) => (
              <Toggle
                isChecked={isAutoUpdateEnabled}
                onChange={setIsAutoUpdateEnabled}
                label="Check for updates automatically"
                aria-describedby={descriptionId}
              />
            )}
          />
          <SettingRow
            title="Check for updates now"
            description="Query GitHub Releases for the latest signed build."
            control={(descriptionId) => (
              <Button
                aria-describedby={descriptionId}
                icon={RefreshIcon}
                isLoading={isChecking}
                onClick={() => void runCheck()}
              >
                Check now
              </Button>
            )}
          />
        </CardBody>
        {checkResult != null && <CardFooter className={UPDATES_FOOTER}>{checkResult}</CardFooter>}
      </Card>

      <Card>
        <CardHeader title="Appearance" />
        <CardBody className={LIST}>
          <div className={rowVariants({ isStacked: true })}>
            <div className={ROW_TEXT}>
              <span id={themeLabelId} className={ROW_TITLE}>
                Theme
              </span>
              <span id={themeDescriptionId} className={ROW_DESC}>
                Use a dark or light appearance, or match your system setting.
              </span>
            </div>
            <ThemeSegmented labelId={themeLabelId} descriptionId={themeDescriptionId} />
          </div>
          <SettingRow
            title="Theme switch sound"
            description="Play a soft click when toggling between light and dark."
            control={(descriptionId) => (
              <Toggle
                isChecked={areThemeSoundsEnabled}
                onChange={setAreThemeSoundsEnabled}
                label="Theme switch sound"
                aria-describedby={descriptionId}
              />
            )}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="About" />
        <CardBody className={LIST}>
          {/* A whole-row link that reads like a Speed-page capability row: the hover
              highlight bleeds 8px into the card padding, so the focus ring (the
              ring alone, no wash) is drawn inside it. The chevron is always faint
              and brightens on hover and focus. */}
          <button
            type="button"
            className={cx(
              'group flex items-center justify-between gap-16 w-[calc(100%+16px)] -mx-8',
              'px-8 py-(--row-padding-y) rounded-sm text-left cursor-pointer',
              'transition-[background] duration-(--duration-fast) ease-in-out hover:bg-fill-faint',
              'focus-visible:outline-offset-(--focus-inset)',
            )}
            onClick={() => navigate({ tab: 'about' })}
          >
            {/* A span, as a button holds only phrasing content; ROW_TEXT makes it flex. */}
            <span className={ROW_TEXT}>
              <span className={ROW_TITLE}>About Rove</span>
              <span className={ROW_DESC}>Version, platform, and source.</span>
            </span>
            <ChevronRightIcon
              size={16}
              className={cx(
                'shrink-0 text-tertiary opacity-30',
                'transition-[opacity] duration-(--duration-fast) ease-in-out',
                'group-hover:opacity-70 group-focus-visible:opacity-70',
              )}
            />
          </button>
        </CardBody>
      </Card>

      {/* The update check's outcome, announced as it changes. Last in the page
          so it doesn't shift the entrance stagger of the cards above. */}
      <p className="sr-only" role="status">
        {checkStatusText(check)}
      </p>
    </div>
  )
}
