import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import { checkForUpdates, type PendingUpdate } from '@/app/utils/updater'
import { useSetting } from '@/hooks/useSetting'
import type { ThemeMode } from '@/app/hooks/useThemeState'
import { useTheme } from '@/app/hooks/useTheme'
import { useNavigation } from '@/app/hooks/useNavigation'
import { Section } from '@/components/Section'
import { Toggle } from '@/components/Toggle'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import {
  CheckIcon,
  ChevronRightIcon,
  ComputerIcon,
  MoonIcon,
  RefreshIcon,
  SettingsIcon,
  SunIcon,
} from '@/components/icons/Icons'
import { Button } from '@/components/Button'
import styles from './SettingsView.module.css'

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; update: PendingUpdate }

const segmentVariants = cva(styles.segment, {
  variants: {
    isActive: { true: styles.isActive },
  },
})

const rowVariants = cva(styles.row, {
  variants: {
    /** Text above the control instead of beside it (the theme picker). */
    isStacked: { true: styles.isStacked },
  },
})

const statusVariants = cva(styles.status, {
  variants: {
    kind: { 'up-to-date': styles.isOk, available: styles.update },
  },
})

const checkNowVariants = cva(styles.checkNow, {
  variants: {
    isScanning: { true: styles.isScanning },
  },
})

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: JSX.Element }[] = [
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={15} /> },
  { value: 'light', label: 'Light', icon: <SunIcon size={15} /> },
  { value: 'system', label: 'System', icon: <ComputerIcon size={15} /> },
]

// How far each arrow key moves the selection in the theme picker.
const ARROW_STEPS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }

/**
 * A three-way segmented picker for the colour theme (dark / light / system),
 * built as an ARIA radio group: one Tab stop (the selected option), and the
 * arrow keys select and focus the next or previous option, wrapping round.
 */
function ThemeSegmented({
  labelId,
  descriptionId,
}: {
  labelId: string
  descriptionId: string
}): JSX.Element {
  const { mode, setMode } = useTheme()

  const selectByArrow = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = ARROW_STEPS[event.key]
    if (step === undefined) return
    event.preventDefault()
    const current = THEME_OPTIONS.findIndex((option) => option.value === mode)
    const next = THEME_OPTIONS[(current + step + THEME_OPTIONS.length) % THEME_OPTIONS.length]
    if (!next) return
    setMode(next.value)
    event.currentTarget.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus()
  }

  return (
    <div
      className={styles.segmented}
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      onKeyDown={selectByArrow}
    >
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={mode === option.value}
          tabIndex={mode === option.value ? 0 : -1}
          data-value={option.value}
          className={segmentVariants({ isActive: mode === option.value })}
          onClick={() => setMode(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
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
    <li className={rowVariants()}>
      <div className={styles.rowText}>
        <span className={styles.rowTitle}>{title}</span>
        <span id={descriptionId} className={styles.rowDesc}>
          {description}
        </span>
      </div>
      <div className={styles.rowControl}>{control(descriptionId)}</div>
    </li>
  )
}

/** The Updates section's footer: the outcome of a manual check, or nothing
 *  while idle or checking (undefined drops the footer slot entirely). */
function renderCheckResult(check: CheckState): ReactNode {
  if (check.kind === 'up-to-date') {
    return (
      <p className={statusVariants({ kind: 'up-to-date' })}>
        <CheckIcon size={14} />
        You're on the latest version.
      </p>
    )
  }
  if (check.kind === 'available') {
    return (
      <div className={statusVariants({ kind: 'available' })}>
        <span>Version {check.update.version} is available.</span>
        <Button
          variant="primary"
          onClick={() => void check.update.install()}
        >
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
  const themeLabelId = useId()
  const themeDescriptionId = useId()

  async function runCheck(): Promise<void> {
    setCheck({ kind: 'checking' })
    const update = await checkForUpdates()
    setCheck(update ? { kind: 'available', update } : { kind: 'up-to-date' })
  }

  return (
    <div className="view-page">
      <header className={cx('view-header', styles.header)}>
        <span className="view-header-icon" aria-hidden>
          <SettingsIcon size={18} />
        </span>
        <h1 className="view-header-title">Settings</h1>
      </header>

      <Section
        title="Updates"
        className={styles.updates}
        bodyAs="ul"
        bodyClassName={styles.list}
        footer={renderCheckResult(check)}
      >
        <SettingRow
          title="Check for updates automatically"
          description="Look for a newer signed release each time Rove launches."
          control={(descriptionId) => (
            <Toggle
              isChecked={isAutoUpdateEnabled}
              onChange={setIsAutoUpdateEnabled}
              label="Check for updates automatically"
              describedBy={descriptionId}
            />
          )}
        />
        <SettingRow
          title="Check for updates now"
          description="Query GitHub Releases for the latest signed build."
          control={(descriptionId) => (
            <Button
              aria-describedby={descriptionId}
              variant="primary"
              className={checkNowVariants({ isScanning: isChecking })}
              onClick={() => void runCheck()}
              disabled={isChecking}
            >
              {isChecking ? <ButtonSpinner size={14} /> : <RefreshIcon size={14} />}
              Check now
            </Button>
          )}
        />
      </Section>

      <Section title="Appearance" bodyAs="ul" bodyClassName={styles.list}>
        <li className={rowVariants({ isStacked: true })}>
          <div className={styles.rowText}>
            <span id={themeLabelId} className={styles.rowTitle}>
              Theme
            </span>
            <span id={themeDescriptionId} className={styles.rowDesc}>
              Use a dark or light appearance, or match your system setting.
            </span>
          </div>
          <ThemeSegmented labelId={themeLabelId} descriptionId={themeDescriptionId} />
        </li>
        <SettingRow
          title="Theme switch sound"
          description="Play a soft click when toggling between light and dark."
          control={(descriptionId) => (
            <Toggle
              isChecked={areThemeSoundsEnabled}
              onChange={setAreThemeSoundsEnabled}
              label="Theme switch sound"
              describedBy={descriptionId}
            />
          )}
        />
      </Section>

      <Section title="About" bodyClassName={styles.list}>
        <button type="button" className={styles.linkRow} onClick={() => navigate({ tab: 'about' })}>
          <div className={styles.rowText}>
            <span className={styles.rowTitle}>About Rove</span>
            <span className={styles.rowDesc}>Version, platform, and source.</span>
          </div>
          <ChevronRightIcon size={16} className={styles.linkChevron} />
        </button>
      </Section>

      {/* The update check's outcome, announced as it changes. Last in the page
          so it doesn't shift the entrance stagger of the sections above. */}
      <p className="sr-only" role="status">
        {checkStatusText(check)}
      </p>
    </div>
  )
}
