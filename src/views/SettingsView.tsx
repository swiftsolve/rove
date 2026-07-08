import { useState, type ReactNode } from 'react'
import { checkForUpdates, type PendingUpdate } from '@/lib/updater'
import { useSetting } from '@/hooks/useSetting'
import type { ThemeMode } from '@/hooks/useTheme'
import Section from '@/components/ui/Section'
import Toggle from '@/components/ui/Toggle'
import { ButtonSpinner } from '@/components/ui/ButtonSpinner'
import {
  CheckIcon,
  ChevronRightIcon,
  ComputerIcon,
  MoonIcon,
  RefreshIcon,
  SettingsIcon,
  SunIcon,
} from '@/components/ui/Icons'
import './SettingsView.css'

interface SettingsViewProps {
  /** The current colour-theme preference. */
  readonly themeMode: ThemeMode
  /** Change the colour-theme preference. */
  readonly onThemeModeChange: (mode: ThemeMode) => void
  /** Navigate to the About page. */
  readonly onOpenAbout: () => void
}

const THEME_OPTIONS: ReadonlyArray<{ readonly value: ThemeMode; readonly label: string; readonly icon: JSX.Element }> = [
  { value: 'dark', label: 'Dark', icon: <MoonIcon size={15} /> },
  { value: 'light', label: 'Light', icon: <SunIcon size={15} /> },
  { value: 'system', label: 'System', icon: <ComputerIcon size={15} /> },
]

/** A three-way segmented picker for the colour theme (dark / light / system). */
function ThemeSegmented({
  value,
  onChange,
}: {
  readonly value: ThemeMode
  readonly onChange: (mode: ThemeMode) => void
}): JSX.Element {
  return (
    <div className="theme-segmented" role="radiogroup" aria-label="Theme">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          className={`theme-seg${value === option.value ? ' is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  )
}

/** A labelled row with a description and a control (toggle, button, …) on the right. */
function SettingRow({
  title,
  description,
  control,
}: {
  readonly title: string
  readonly description: string
  readonly control: ReactNode
}): JSX.Element {
  return (
    <div className="setting-row">
      <div className="setting-row-text">
        <span className="setting-row-title">{title}</span>
        <span className="setting-row-desc">{description}</span>
      </div>
      <div className="setting-row-control">{control}</div>
    </div>
  )
}

type CheckState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'up-to-date' }
  | { readonly kind: 'available'; readonly update: PendingUpdate }
  | { readonly kind: 'error' }

export default function SettingsView({
  themeMode,
  onThemeModeChange,
  onOpenAbout,
}: SettingsViewProps): JSX.Element {
  const [autoUpdate, setAutoUpdate] = useSetting('autoUpdate', true)
  const [themeSounds, setThemeSounds] = useSetting('themeSounds', true)
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' })

  async function runCheck(): Promise<void> {
    setCheck({ kind: 'checking' })
    const update = await checkForUpdates()
    setCheck(update ? { kind: 'available', update } : { kind: 'up-to-date' })
  }

  return (
    <div className="view-page">
      <div className="view-header settings-header">
        <span className="view-header-icon">
          <SettingsIcon size={18} />
        </span>
        <span className="view-header-title">Settings</span>
      </div>

      <Section
        title="Updates"
        className="settings-updates"
        bodyClassName="setting-list"
        footer={
          check.kind === 'up-to-date' ? (
            <p className="settings-status ok">
              <CheckIcon size={14} />
              You're on the latest version.
            </p>
          ) : check.kind === 'available' ? (
            <div className="settings-status settings-update">
              <span>Version {check.update.version} is available.</span>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void check.update.install()}
              >
                Install &amp; restart
              </button>
            </div>
          ) : undefined
        }
      >
        <SettingRow
          title="Check for updates automatically"
          description="Look for a newer signed release each time Rove launches."
          control={
            <Toggle
              checked={autoUpdate}
              onChange={setAutoUpdate}
              label="Check for updates automatically"
            />
          }
        />
        <SettingRow
          title="Check for updates now"
          description="Query GitHub Releases for the latest signed build."
          control={
            <button
              type="button"
              className={`btn-primary check-now-btn${check.kind === 'checking' ? ' is-scanning' : ''}`}
              onClick={() => void runCheck()}
              disabled={check.kind === 'checking'}
            >
              {check.kind === 'checking' ? <ButtonSpinner size={14} /> : <RefreshIcon size={14} />}
              Check now
            </button>
          }
        />
      </Section>

      <Section title="Appearance" bodyClassName="setting-list">
        <div className="setting-row setting-row-stacked">
          <div className="setting-row-text">
            <span className="setting-row-title">Theme</span>
            <span className="setting-row-desc">
              Use a dark or light appearance, or match your system setting.
            </span>
          </div>
          <ThemeSegmented value={themeMode} onChange={onThemeModeChange} />
        </div>
        <SettingRow
          title="Theme switch sound"
          description="Play a soft click when toggling between light and dark."
          control={
            <Toggle
              checked={themeSounds}
              onChange={setThemeSounds}
              label="Theme switch sound"
            />
          }
        />
      </Section>

      <Section title="About" bodyClassName="setting-list">
        <button type="button" className="setting-link-row" onClick={onOpenAbout}>
          <div className="setting-row-text">
            <span className="setting-row-title">About Rove</span>
            <span className="setting-row-desc">Version, platform, and source.</span>
          </div>
          <ChevronRightIcon size={16} className="setting-link-chevron" />
        </button>
      </Section>
    </div>
  )
}
