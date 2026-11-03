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
        warning: 'bg-status-warning/(--opacity-tint-md) text-warning',
        negative: 'bg-status-negative/(--opacity-tint-md) text-negative',
      },
    },
  },
)

type BadgeProps = {
  /** Green, amber or red. Green is good news, such as the ISP card's VPN flag; amber a caveat, not a fault. */
  tone: VariantOf<typeof badgeVariants, 'tone'>
  /** A word or two; it's set in capitals. */
  children: ReactNode
}

/** A small tinted flag beside a title: a word or two, in capitals. */
export function Badge({ tone, children }: BadgeProps) {
  return <span className={badgeVariants({ tone })}>{children}</span>
}

/** A dark status pill with a pulsing dot: data on the card is updating live. */
export function LiveBadge({
  children = 'Live',
}: {
  /** Its words. */
  children?: ReactNode
}) {
  return (
    <span className="type-caption inline-flex items-center gap-6 rounded-full bg-inset px-8 py-4 text-positive">
      <StatusDot pulse="live" />
      {children}
    </span>
  )
}
