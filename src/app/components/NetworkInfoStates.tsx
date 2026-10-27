import { cva } from 'class-variance-authority'
import { AlertIcon, CloseIcon, OfflineIcon, RefreshIcon } from '@/components/icons/Icons'
import { Spinner } from '@/components/Spinner'
import { useNetwork } from '@/app/hooks/useNetwork'
import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import styles from './NetworkInfoStates.module.css'

// What the app shows while network info is missing or its refresh failed.

const loadingVariants = cva(styles.loading, {
  variants: {
    isError: { true: styles.isError },
  },
})

interface NetworkErrorInfo {
  kind: 'timeout' | 'backend' | 'offline'
  title: string
  hint: string
}

// Turn a raw error string into a title + plain-language hint so a stalled
// detection reads as a recoverable state, not a cryptic red line. A timeout in
// particular isn't the same as "no network" — the connection may be fine while
// the OS query is just slow — so it gets its own, calmer framing.
function describeNetworkError(message: string): NetworkErrorInfo {
  if (/timed out/i.test(message)) {
    return {
      kind: 'timeout',
      title: 'Network detection is taking too long',
      hint: 'This is usually temporary. Make sure you’re connected, then try again.',
    }
  }
  if (/backend|restart/i.test(message)) {
    return { kind: 'backend', title: 'Can’t reach the app', hint: message }
  }
  return { kind: 'offline', title: 'Can’t reach your network', hint: message }
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
        <p>Looking for your network…</p>
        {info && <p className={styles.slowNote}>This is taking longer than usual.</p>}
      </div>
    )
  }

  const { kind, title, hint } = info
  return (
    <div className={loadingVariants({ isError: true })} role="alert">
      <span className={styles.errorIcon} aria-hidden>
        <NetworkErrorIcon kind={kind} size={24} />
      </span>
      <div className={styles.errorText}>
        <p className={styles.title}>{title}</p>
        <p className={styles.message}>{hint}</p>
      </div>
      <Button onClick={() => void network.refresh()}>
        <RefreshIcon size={14} />
        Try again
      </Button>
    </div>
  )
}

// The compact counterpart to NetworkLoadingScreen: shown when a background
// refresh fails while we already have network info on screen. It stays
// actionable (retry + dismiss) instead of leaving a dead red bar the user can't
// clear.
export function NetworkErrorBanner(): JSX.Element | null {
  const network = useNetwork()
  if (!network.error) return null
  const { kind, title } = describeNetworkError(network.error)
  return (
    <div className="error-banner" role="alert">
      <span className={styles.bannerIcon} aria-hidden>
        <NetworkErrorIcon kind={kind} size={16} />
      </span>
      <span className={styles.bannerText}>{title}</span>
      <button type="button" className={styles.bannerAction} onClick={() => void network.refresh()}>
        <RefreshIcon size={13} />
        Retry
      </button>
      <IconButton
        tone="plain"
        className={styles.bannerDismiss}
        onClick={() => network.setError(null)}
        aria-label="Dismiss"
      >
        <CloseIcon size={13} />
      </IconButton>
    </div>
  )
}
