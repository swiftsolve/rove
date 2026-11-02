import { useId, type ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { useSetting } from '@/hooks/useSetting'
import { useManualUpdateCheck, type UpdateCheckState } from '@/features/settings/hooks/useManualUpdateCheck'
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
  ComputerIcon,
  ListRow,
  MoonIcon,
  PageHeader,
  RefreshIcon,
  SegmentedControl,
  SettingsIcon,
  SunIcon,
  Toggle,
  type SegmentedOption,
} from '@/ui'

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
function renderCheckResult(check: UpdateCheckState): ReactNode {
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
function checkStatusText(check: UpdateCheckState): string {
  if (check.kind === 'checking') return 'Checking for updates…'
  if (check.kind === 'up-to-date') return 'You’re on the latest version.'
  if (check.kind === 'available') return `Version ${check.update.version} is available.`
  return ''
}

export function SettingsView(): JSX.Element {
  const { navigate } = useNavigation()
  const [isAutoUpdateEnabled, setIsAutoUpdateEnabled] = useSetting('autoUpdate', true)
  const [areThemeSoundsEnabled, setAreThemeSoundsEnabled] = useSetting('themeSounds', true)
  const { check, runCheck } = useManualUpdateCheck()
  const isChecking = check.kind === 'checking'
  const checkResult = renderCheckResult(check)
  const themeLabelId = useId()
  const themeDescriptionId = useId()

  return (
    <div className="page">
      <PageHeader icon={<SettingsIcon size={18} />} title="Settings" />

      <Card>
        <CardHeader title="Updates" />
        {/* Rows carry their own vertical padding, like the Speed page's capability list. */}
        <CardBody layout="rows">
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
        {checkResult != null && <CardFooter>{checkResult}</CardFooter>}
      </Card>

      <Card>
        <CardHeader title="Appearance" />
        <CardBody layout="rows">
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
        <CardBody layout="rows">
          {/* Reads like a Speed-page capability row. */}
          <ListRow onClick={() => navigate({ tab: 'about' })}>
            <span className={ROW_TEXT}>
              <span className={ROW_TITLE}>About Rove</span>
              <span className={ROW_DESC}>Version, platform, and source.</span>
            </span>
          </ListRow>
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
