import { cva } from 'class-variance-authority'
import { type JSX, useState } from 'react'

import { Button } from '../button/Button'
import { AlertIcon, RefreshIcon } from '../icons/Icons'
import type { VariantOf } from '../utils/variants'

const bannerVariants = cva('type-body banner', {
  variants: {
    variant: {
      /** A failure: a red wash and outline. Dismiss is red to match; Retry is neutral, the way out. */
      error: 'bg-status-negative/(--opacity-tint-sm) ring-1 ring-inset ring-status-negative/(--opacity-tint-md)',
    },
  },
})

type BannerProps = {
  /** `error`, a failure: a red wash, and a red Dismiss. */
  variant: VariantOf<typeof bannerVariants, 'variant'>
  /** What happened. Dismiss hides the banner until this changes. */
  title: string
  /** One short line under the title: how old what's on screen is, or what happens next. */
  description: string
  /** Shows Retry, busy until the returned promise settles. */
  onRetry?: () => Promise<void>
}

/**
 * A message above a page: icon, title, a line under it, then Dismiss and
 * Retry on the right. Dismiss hides this title until it changes or the banner
 * unmounts, so a poll that fails the same way again doesn't bring it back; a
 * caller renders it only while there's an error, which is what resets it.
 */
export function Banner({ variant, title, description, onRetry }: BannerProps): JSX.Element | null {
  const [dismissedTitle, setDismissedTitle] = useState<string | null>(null)
  const [shownTitle, setShownTitle] = useState(title)
  const [isRetrying, setIsRetrying] = useState(false)
  // A new title clears the dismissal, so a dismissed one that comes back later shows again.
  if (shownTitle !== title) {
    setShownTitle(title)
    setDismissedTitle(null)
  }
  if (dismissedTitle === title) return null

  const retry = async (): Promise<void> => {
    if (!onRetry) return
    setIsRetrying(true)
    try {
      await onRetry()
    } catch {
      // A failed retry shows as the banner staying up.
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div className={bannerVariants({ variant })} role="alert">
      {/* One title line tall, so the icon sits level with the title. */}
      <span className="inline-flex h-[19px] shrink-0 items-center text-status-negative" aria-hidden>
        <AlertIcon size={16} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <div className="flex flex-col gap-2">
          <p className="text-primary">{title}</p>
          <p className="type-body text-secondary">{description}</p>
        </div>
        <div className="flex justify-end gap-4">
          <Button tone="negative" onClick={() => setDismissedTitle(title)}>
            Dismiss
          </Button>
          {onRetry && (
            <Button
              tone="neutral"
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
