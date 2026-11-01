import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { StatusDot } from '../status-dot/StatusDot'

const badgeVariants = cva(
  'shrink-0 rounded-full px-6 py-px text-2xs font-semibold uppercase tracking-[0.04em]',
  {
    variants: {
      tone: {
        positive: 'bg-status-positive/15 text-positive',
        /** "Heads up" without the alarm of an error colour: the ISP card's VPN flag. */
        warning: 'bg-status-warning/15 text-warning',
        negative: 'bg-status-negative/15 text-negative',
      },
    },
  },
)

interface BadgeProps {
  tone: 'positive' | 'warning' | 'negative'
  children: ReactNode
}

/** A small tinted flag beside a title: a word or two, in capitals. */
export function Badge({ tone, children }: BadgeProps): JSX.Element {
  return <span className={badgeVariants({ tone })}>{children}</span>
}

/** A dark status pill with a pulsing dot: data on the card is updating live. */
export function LiveBadge({ children = 'Live' }: { children?: ReactNode }): JSX.Element {
  return (
    <span className="text-caption inline-flex items-center gap-6 rounded-full bg-inset px-8 py-4 text-positive">
      <StatusDot pulse="live" />
      {children}
    </span>
  )
}
