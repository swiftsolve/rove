import { cva, cx } from 'class-variance-authority'
import { type ReactNode, useId } from 'react'

import { useNavigation } from '@/app/hooks/useNavigation'
import { useTheme } from '@/app/hooks/useTheme'
import type { ThemeMode } from '@/app/utils/theme-mode'
import { InstallUpdateButton } from '@/features/settings/components/InstallUpdateButton'
import { type UpdateCheckState, useManualUpdateCheck } from '@/features/settings/hooks/useManualUpdateCheck'
import { useSetting } from '@/hooks/useSetting'
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
  ScreenReaderStatus,
  SegmentedControl,
  type SegmentedOption,
  SettingsIcon,
  SunIcon,
  Toggle,
} from '@/ui'

const rowVariants = cva('flex justify-between py-(--row-padding-y)', {
  variants: {
    /**
     * Text above the control instead of beside it: for a control too wide to
     * sit inline (the three-segment theme picker).
     */
    isStacked: { true: 'flex-col items-start gap-12', false: 'items-center gap-16' },
  },
  defaultVariants: { isStacked: false },
})

const statusVariants = cva('type-caption flex items-center', {
  variants: {
    kind: {
      'up-to-date': 'gap-6 text-positive',
      available: 'justify-between gap-12 text-secondary',
      failed: 'text-negative',
    },
  },
})

const ROW_TEXT = 'flex flex-col gap-4 min-w-0'
const ROW_TITLE = 'type-body font-medium text-primary'
const ROW_DESC = 'type-caption text-tertiary'

const THEME_OPTIONS: SegmentedOption<ThemeMode>[] = [
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={15} className="shrink-0" /> },
  { value: 'light', label: 'Light', icon: <SunIcon size={15} className="shrink-0" /> },
  { value: 'system', label: 'System', icon: <ComputerIcon size={15} className="shrink-0" /> },
]

/** The colour theme picker: dark, light or system. */
function ThemeSegmented({ labelId, descriptionId }: { labelId: string; descriptionId: string }) {
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

/** A labelled row with a description and a control (toggle, button, …) on the right, or below when `isStacked`. */
function SettingRow({
  title,
  description,
  isStacked = false,
  control,
}: {
  title: string
  description: string
  /** The control goes under the text: for one too wide to sit beside it (the theme picker). */
  isStacked?: boolean
  /** Renders the control, given the title's and the description's ids so it can point at them. */
  control: (ids: { labelId: string; descriptionId: string }) => ReactNode
}) {
  const labelId = useId()
  const descriptionId = useId()
  return (
    <div className={rowVariants({ isStacked })}>
      <div className={ROW_TEXT}>
        <span id={labelId} className={ROW_TITLE}>
          {title}
        </span>
        <span id={descriptionId} className={ROW_DESC}>
          {description}
        </span>
      </div>
      <div className="shrink-0">{control({ labelId, descriptionId })}</div>
    </div>
  )
}

/**
 * The Updates card's footer: the outcome of a manual check, or nothing
 * while idle or checking (undefined drops the footer slot entirely).
 */
function renderCheckResult(check: UpdateCheckState): ReactNode {
  if (check.kind === 'up-to-date') {
    return (
      <p className={statusVariants({ kind: 'up-to-date' })}>
        {/* Centred, the check reads a touch high; 1px lower settles it. */}
        <CheckIcon size={14} className="shrink-0 transform-[translateY(1px)]" />
        You're on the latest version.
      </p>
    )
  }
  if (check.kind === 'available') {
    return (
      <div className={statusVariants({ kind: 'available' })}>
        <span>Version {check.update.version} is available.</span>
        <InstallUpdateButton update={check.update} />
      </div>
    )
  }
  if (check.kind === 'failed') {
    return <p className={statusVariants({ kind: 'failed' })}>Couldn’t check for updates. Try again later.</p>
  }
  return undefined
}

/** The same outcome in words, for the screen-reader status line. */
function checkStatusText(check: UpdateCheckState): string {
  if (check.kind === 'checking') return 'Checking for updates…'
  if (check.kind === 'up-to-date') return 'You’re on the latest version.'
  if (check.kind === 'available') return `Version ${check.update.version} is available.`
  if (check.kind === 'failed') return 'Couldn’t check for updates.'
  return ''
}

export function SettingsView() {
  const { navigate } = useNavigation()
  const [isAutoUpdateEnabled, setIsAutoUpdateEnabled] = useSetting('autoUpdate', true)
  const [areThemeSoundsEnabled, setAreThemeSoundsEnabled] = useSetting('themeSounds', true)
  const { check, runCheck } = useManualUpdateCheck()
  const isChecking = check.kind === 'checking'
  const checkResult = renderCheckResult(check)

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
            control={({ descriptionId }) => (
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
            control={({ descriptionId }) => (
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
          <SettingRow
            title="Theme"
            description="Use a dark or light appearance, or match your system setting."
            isStacked
            control={(ids) => <ThemeSegmented {...ids} />}
          />
          <SettingRow
            title="Theme switch sound"
            description="Play a soft click when toggling between light and dark."
            control={({ descriptionId }) => (
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
              <span className={cx(ROW_TITLE, 'leading-[inherit]')}>About Rove</span>
              <span className={ROW_DESC}>Version, platform, and source.</span>
            </span>
          </ListRow>
        </CardBody>
      </Card>

      {/* The update check's outcome, announced as it changes. Last in the page
          so it doesn't shift the entrance stagger of the cards above. */}
      <ScreenReaderStatus>{checkStatusText(check)}</ScreenReaderStatus>
    </div>
  )
}
