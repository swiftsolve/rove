import type { ReactNode } from 'react'
import { cva, cx } from 'class-variance-authority'
import { AlertIcon, Button, Banner, OfflineIcon, RefreshIcon, Spinner } from '@/ui'
import { useNetwork } from '@/app/hooks/useNetwork'
import { useNow } from '@/hooks/useNow'
import { formatTimeAgo, TIME_AGO_RESOLUTION_MS } from '@/lib/format'

// What the app shows while network info is missing or its refresh failed.

const loadingVariants = cva(
  [
    'flex flex-1 flex-col items-center justify-center',
    'animate-fade-in',
  ],
  {
    variants: {
      /** A failed detection: an icon chip, a short heading, the reason and a real
       *  button, so it reads as recoverable rather than a stray grey line. */
      isError: { true: 'gap-16 p-20', false: 'gap-(--card-padding)' },
    },
    defaultVariants: { isError: false },
  },
)

// The lines under the spinner: the label and, when detection runs slow, a
// second note in the same style.
const LOADING_LINE = 'text-sm text-secondary'

interface NetworkErrorInfo {
  kind: 'timeout' | 'backend' | 'offline'
  title: string
  description: string
}

// Turn a raw error string into a title + plain-language description so a stalled
// detection reads as a recoverable state, not a cryptic red line. A timeout in
// particular isn't the same as "no network" — the connection may be fine while
// the OS query is just slow — so it gets its own, calmer framing.
function describeNetworkError(message: string): NetworkErrorInfo {
  if (/timed out/i.test(message)) {
    return {
      kind: 'timeout',
      title: 'Network detection is taking too long',
      description: 'This is usually temporary. Make sure you’re connected, then try again.',
    }
  }
  if (/backend|restart/i.test(message)) {
    return { kind: 'backend', title: 'Can’t reach the app', description: message }
  }
  return { kind: 'offline', title: 'Can’t reach your network', description: message }
}

function NetworkErrorIcon({ kind, size }: { kind: NetworkErrorInfo['kind']; size: number }): JSX.Element {
  return kind === 'offline' ? <OfflineIcon size={size} /> : <AlertIcon size={size} />
}

/** Fills the content area while the first network info hasn't arrived yet. */
export function NetworkLoadingScreen(): JSX.Element {
  const network = useNetwork()
  // While a read is in flight, any earlier error is stale: show the spinner.
  const error = network.isLoading ? null : network.error
  const info = error ? describeNetworkError(error) : null

  // A slow OS query is "still detecting", not a failure. The hook already
  // re-runs on a 15s poll and on routing-table changes, so keep the spinner
  // and skip the retry button — there's nothing for the user to do but wait.
  if (!info || info.kind === 'timeout') {
    return (
      // A status region, so the slow-detection note is announced when it appears.
      <div className={loadingVariants()} role="status">
        <Spinner />
        <p className={LOADING_LINE}>Looking for your network…</p>
        {info && <p className={LOADING_LINE}>This is taking longer than usual.</p>}
      </div>
    )
  }

  const { kind, title, description } = info
  return (
    <div className={loadingVariants({ isError: true })} role="alert">
      <span
        className={cx(
          'inline-flex items-center justify-center size-[48px] rounded-full text-status-negative',
          'bg-[color-mix(in_srgb,var(--status-negative)_var(--opacity-tint-sm),transparent)]',
        )}
        aria-hidden
      >
        <NetworkErrorIcon kind={kind} size={24} />
      </span>
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-lg font-semibold text-primary">{title}</p>
        <p className="max-w-[260px] text-sm text-tertiary">{description}</p>
      </div>
      <Button icon={RefreshIcon} onClick={() => void network.refresh()}>
        Try again
      </Button>
    </div>
  )
}

/**
 * The screen, or the loading screen in its place while a screen that needs
 * network info waits for it. Network info is read here rather than in the
 * shell, so a reading that changes (a Wi‑Fi signal does, most polls) re-renders
 * only the screens that show it: `children` keeps its identity, so React skips
 * a screen that doesn't read the network itself.
 */
export function NetworkInfoGate({ isNeeded, children }: { isNeeded: boolean; children: ReactNode }): JSX.Element {
  const { info } = useNetwork()
  return isNeeded && !info ? <NetworkLoadingScreen /> : <>{children}</>
}

// The compact counterpart to NetworkLoadingScreen: shown when background
// refreshes keep failing while we already have network info on screen. That
// info is now stale, so the banner says how old it is.
export function NetworkErrorBanner(): JSX.Element | null {
  const { info, error, lastReadAt, refresh } = useNetwork()
  if (!error || !info || lastReadAt === null) return null
  return <StaleNetworkBanner error={error} lastReadAt={lastReadAt} onRetry={refresh} />
}

// Its own component so only a shown banner reads the clock.
function StaleNetworkBanner({
  error,
  lastReadAt,
  onRetry,
}: {
  error: string
  lastReadAt: number
  onRetry: () => Promise<void>
}): JSX.Element {
  const now = useNow(TIME_AGO_RESOLUTION_MS)
  return (
    <Banner
      variant="error"
      title={describeNetworkError(error).title}
      description={`Last updated ${formatTimeAgo(lastReadAt, now)}.`}
      onRetry={onRetry}
    />
  )
}
