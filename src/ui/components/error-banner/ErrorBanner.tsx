import { useState } from 'react'
import { AlertIcon, RefreshIcon } from '../../icons/Icons'
import { Button } from '../../primitives/button/Button'

/** The second line for a page whose data polls: a failure there heals itself. */
export const POLLING_DESCRIPTION = 'Rove keeps trying in the background.'

interface ErrorBannerProps {
  title: string
  /** One short line under the title: how old what's on screen is, or what happens next. */
  description: string
  /** Shows Retry, busy until the returned promise settles. */
  onRetry?: () => Promise<void>
}

/**
 * A failure above a page: icon, title, a line under it, then Dismiss and
 * Retry on the right. Dismiss hides this title until it changes or the banner
 * unmounts, so a poll that fails the same way again doesn't bring it back; a
 * caller renders it only while there's an error, which is what resets it.
 */
export function ErrorBanner({ title, description, onRetry }: ErrorBannerProps): JSX.Element | null {
  const [dismissedTitle, setDismissedTitle] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  if (dismissedTitle === title) return null

  const retry = async (): Promise<void> => {
    if (!onRetry) return
    setIsRetrying(true)
    try {
      await onRetry()
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div className="error-banner" role="alert">
      {/* One title line tall, so the icon sits level with the title. */}
      <span className="inline-flex h-[19px] shrink-0 items-center text-status-negative" aria-hidden>
        <AlertIcon size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-primary">{title}</p>
          <p className="text-sm text-secondary">{description}</p>
        </div>
        <div className="flex justify-end gap-4">
          <Button variant="ghost" onClick={() => setDismissedTitle(title)}>
            Dismiss
          </Button>
          {onRetry && (
            <Button
              icon={RefreshIcon}
              isLoading={isRetrying}
              loadingLabel="Retrying…"
              onClick={() => void retry()}
            >
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
