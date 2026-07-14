import type { AppUsage, AppUsageSummary } from '@/types'
import { formatBytes } from '@/lib/format'
import { Tooltip as UiTooltip } from '@/components/ui/Tooltip'
import { ViewHeader } from '@/components/ui/ViewHeader'
import { ServiceIcon } from '@/components/ui/ServiceIcon'
import { AppsIcon, HelpIcon } from '@/components/ui/Icons'
import DirectionIcon from '@/components/ui/DirectionIcon'
import { Spinner } from '@/components/ui/Spinner'
import './AppUsageView.css'

const APP_USAGE_INFO_HINT =
  'Bytes are attributed to the app that moved them, read from the OS per-process ' +
  'network counters while Rove is running. Totals reset when Rove restarts.'

// Best-effort brand icon: map a process name to a registered domain and reuse
// the Services favicon lookup, falling back to a letter monogram for anything
// unrecognised. Ordered most-specific first (e.g. chromium before chrome,
// webkit/safari before the generic apple). Not exhaustive — the monogram covers
// the long tail (daemons, CLIs) cleanly.
const APP_DOMAINS: readonly (readonly [string, string])[] = [
  ['firefox', 'firefox.com'],
  ['chromium', 'google.com'],
  ['chrome', 'google.com'],
  ['spotify', 'spotify.com'],
  ['slack', 'slack.com'],
  ['dropbox', 'dropbox.com'],
  ['discord', 'discord.com'],
  ['zoom', 'zoom.us'],
  ['telegram', 'telegram.org'],
  ['signal', 'signal.org'],
  ['whatsapp', 'whatsapp.com'],
  ['steam', 'steampowered.com'],
  ['brave', 'brave.com'],
  ['opera', 'opera.com'],
  ['edge', 'microsoft.com'],
  ['teams', 'microsoft.com'],
  ['outlook', 'microsoft.com'],
  ['onedrive', 'microsoft.com'],
  ['vscode', 'visualstudio.com'],
  ['code', 'visualstudio.com'],
  ['safari', 'apple.com'],
  ['webkit', 'apple.com'],
  ['softwareupdate', 'apple.com'],
  ['apple', 'apple.com'],
  ['git', 'github.com'],
  ['node', 'nodejs.org'],
]

function appDomain(name: string): string {
  const lower = name.toLowerCase()
  for (const [key, domain] of APP_DOMAINS) {
    if (lower.includes(key)) return domain
  }
  return ''
}

interface AppUsageViewProps {
  readonly usage: AppUsageSummary
  readonly isLoading: boolean
  readonly error?: string | null
}

/** One app's row, styled like a Services row: icon + name on the left, total on
 *  the right, with the download/upload split as a quiet second line. */
function AppRow({ app }: { readonly app: AppUsage }): JSX.Element {
  const total = app.rxBytes + app.txBytes
  return (
    <div className="app-row">
      <div className="app-row-main">
        <span className="app-row-id">
          <ServiceIcon host={appDomain(app.name)} name={app.name} />
          <span className="app-row-name" title={app.name}>
            {app.name}
          </span>
        </span>
        <span className="app-row-total num">{formatBytes(total)}</span>
      </div>
      <div className="app-row-figures">
        <span className="app-row-figure">
          <DirectionIcon series="down" size={11} />
          <span className="num">{formatBytes(app.rxBytes)}</span>
        </span>
        <span className="app-row-figure">
          <DirectionIcon series="up" size={11} />
          <span className="num">{formatBytes(app.txBytes)}</span>
        </span>
      </div>
    </div>
  )
}

export default function AppUsageView({ usage, isLoading, error }: AppUsageViewProps): JSX.Element {
  const { apps, support } = usage
  const hasData = apps.length > 0

  const subtitle =
    isLoading && !hasData ? 'Loading…' : 'Network usage by application, busiest first'

  return (
    <div className="view-page">
      <ViewHeader
        icon={<AppsIcon size={18} />}
        title="Apps"
        subtitle={subtitle}
        subtitleShown={!(isLoading && !hasData)}
        actions={
          <UiTooltip content={APP_USAGE_INFO_HINT}>
            <button
              type="button"
              className="btn-icon btn-icon-secondary"
              aria-label="About per-app usage"
            >
              <HelpIcon size={16} />
            </button>
          </UiTooltip>
        }
      />

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {support === 'unsupported' ? (
        <div className="view-empty">
          <p className="text-muted">Per-app usage isn’t available right now.</p>
          <p className="text-meta app-usage-note">
            On Windows, attributing bytes to a process uses a network event-tracing
            session that needs administrator rights — run Rove as administrator to
            enable per-app usage. It works without elevation on Linux and macOS.
          </p>
        </div>
      ) : isLoading && !hasData ? (
        <div className="view-empty">
          <Spinner />
          <p className="text-muted">Measuring per-app usage…</p>
        </div>
      ) : !hasData ? (
        <div className="view-empty">
          <p className="text-muted">No app traffic seen yet.</p>
          <p className="text-meta app-usage-note">
            Usage appears here as your apps send and receive. Totals are gathered while Rove runs.
          </p>
        </div>
      ) : (
        <div className="ui-section">
          <div className="ui-section-body app-list">
            {apps.map((app) => (
              <AppRow key={app.name} app={app} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
