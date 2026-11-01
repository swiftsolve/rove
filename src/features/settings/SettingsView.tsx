import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import { checkForUpdates, type PendingUpdate } from '@/app/utils/updater'
import { useSetting } from '@/hooks/useSetting'
import type { ThemeMode } from '@/app/hooks/useThemeState'
import { useTheme } from '@/app/hooks/useTheme'
import { useNavigation } from '@/app/hooks/useNavigation'
import { Card, CardHeader, CardBody, CardFooter } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { Toggle } from '@/components/Toggle'
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

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; update: PendingUpdate }

// Segments sit 2px inside their track, so the focus ring goes inside the
// segment rather than spilling over the track's edge and its neighbours.
const segmentVariants = cva(
  [
    'inline-flex items-center gap-6 py-[5px] px-10 border-none rounded-xs cursor-pointer',
    'text-xs font-medium',
    'transition-[background,color] duration-(--duration-fast) ease-in-out',
    'focus-visible:outline-offset-(--focus-inset)',
  ],
  {
    variants: {
      isActive: {
        true: 'bg-accent-muted text-accent-text',
        false: 'bg-transparent text-tertiary hover:text-secondary',
      },
    },
  },
)

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

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: JSX.Element }[] = [
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={15} className="shrink-0" /> },
  { value: 'light', label: 'Light', icon: <SunIcon size={15} className="shrink-0" /> },
  { value: 'system', label: 'System', icon: <ComputerIcon size={15} className="shrink-0" /> },
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
    // A pill track like the Toggle's inset one, so the two Appearance controls
    // read as a set; the active segment is lit with the accent.
    <div
      className="inline-flex gap-2 p-2 bg-inset border border-line rounded-sm"
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
        <Button
          variant="secondary"
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
                variant="secondary"
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
                describedBy={descriptionId}
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
            <div className={ROW_TEXT}>
              <span className={ROW_TITLE}>About Rove</span>
              <span className={ROW_DESC}>Version, platform, and source.</span>
            </div>
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
