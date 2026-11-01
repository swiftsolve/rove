import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import type { VariantOf } from '../foundations/variants'
import { StatusDot } from '../status-dot/StatusDot'

const badgeVariants = cva(
  'inline-flex shrink-0 items-center rounded-full px-8 py-4 text-2xs leading-none font-semibold uppercase tracking-[0.04em]',
  {
    variants: {
      tone: {
        positive: 'bg-status-positive/(--opacity-tint-md) text-positive',
        /** "Heads up" without the alarm of an error colour: the ISP card's VPN flag. */
        warning: 'bg-status-warning/(--opacity-tint-md) text-warning',
        negative: 'bg-status-negative/(--opacity-tint-md) text-negative',
      },
    },
  },
)

interface BadgeProps {
  tone: VariantOf<typeof badgeVariants, 'tone'>
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
