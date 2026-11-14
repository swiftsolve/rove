import { Button, RefreshIcon } from '@swiftsolve/rove-ui'
import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'

/**
 * A failure that fills its space: a red icon chip, a short title, the reason,
 * and Try again, so it reads as recoverable rather than a stray grey line.
 */
const chipVariants = cva(
  [
    'inline-flex items-center justify-center rounded-full text-status-negative',
    'bg-[color-mix(in_srgb,var(--status-negative)_var(--opacity-tint-sm),transparent)]',
  ],
  {
    variants: {
      /** `page` fills the content area; `dialog` sits in a dialog's body. */
      size: { page: 'size-[48px]', dialog: 'size-[40px]' },
    },
  },
)

type ErrorNoticeProps = {
  /** The icon, sized for the chip: 24 on a page, 20 in a dialog. */
  icon: ReactNode
  title: string
  description: string
  size: 'page' | 'dialog'
  onRetry: () => void
}

/** What failed, why, and Try again: the network screen's error and the Share Wi-Fi dialog's. */
export function ErrorNotice({ icon, title, description, size, onRetry }: ErrorNoticeProps) {
  return (
    <>
      <span className={chipVariants({ size })} aria-hidden>
        {icon}
      </span>
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="type-heading leading-body text-primary">{title}</p>
        <p className="type-body max-w-[260px] text-tertiary">{description}</p>
      </div>
      <Button icon={RefreshIcon} onClick={onRetry}>
        Try again
      </Button>
    </>
  )
}
