import { cva } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import { StatusDot } from '../status-dot/StatusDot'
import { cn } from '../utils/cn'
import type { VariantOf } from '../utils/variants'

const badgeVariants = cva('inline-flex shrink-0 items-center rounded-full px-8 py-4 type-badge', {
  variants: {
    tone: {
      positive: 'bg-status-positive/(--opacity-tint-md) text-positive',
      warning: 'bg-status-warning/(--opacity-tint-md) text-warning',
      negative: 'bg-status-negative/(--opacity-tint-md) text-negative',
    },
  },
})

type BadgeProps = Omit<ComponentProps<'span'>, 'children'> & {
  /** Green, amber or red. Green is good news, such as the ISP card's VPN flag; amber a caveat, not a fault. */
  tone: VariantOf<typeof badgeVariants, 'tone'>
  /** A word or two; it's set in capitals. */
  children: ReactNode
}

/** A small tinted flag beside a title: a word or two, in capitals. */
export function Badge({ tone, className, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {children}
    </span>
  )
}

/** A dark status pill with a pulsing dot: data on the card is updating live. */
export function LiveBadge({
  children = 'Live',
  className,
  ...props
}: Omit<ComponentProps<'span'>, 'children'> & {
  /** Its words. */
  children?: ReactNode
}) {
  return (
    <span
      className={cn(
        'type-caption inline-flex items-center gap-6 rounded-full bg-inset px-8 py-4 text-positive',
        className,
      )}
      {...props}
    >
      <StatusDot pulse="live" />
      {children}
    </span>
  )
}
