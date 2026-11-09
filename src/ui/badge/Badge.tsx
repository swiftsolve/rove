import { cva } from 'class-variance-authority'
import { type ComponentProps, type CSSProperties, type ReactNode, useState } from 'react'

import { StatusDot } from '../status-dot/StatusDot'
import { cn } from '../utils/cn'
import type { VariantOf } from '../utils/variants'

const badgeVariants = cva('type-badge inline-flex shrink-0 items-center rounded-full px-8 py-4', {
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

/**
 * LiveBadge's dot, given a new key on each update so its breath restarts. It
 * starts the breath as far in as the update is old, so a dot that mounts
 * between two updates (coming back to Home) carries on in step instead of
 * snapping bright when the next one lands.
 */
function LiveDot({ updatedAt }: { updatedAt: number }) {
  const [msSinceUpdate] = useState(() => Math.max(0, Date.now() - updatedAt))
  const breathStart = { '--live-elapsed': `${msSinceUpdate}ms` } as CSSProperties
  return <StatusDot pulse="live" style={breathStart} />
}

/** A dark status pill with a pulsing dot: data on the card is updating live. */
export function LiveBadge({
  updatedAt,
  children = 'Live',
  className,
  ...props
}: Omit<ComponentProps<'span'>, 'children'> & {
  /**
   * When the card's data last updated, in epoch milliseconds: the dot breathes once
   * on each new one, so it keeps time with the numbers, and dims when none
   * has come for 3s.
   */
  updatedAt: number
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
      <LiveDot key={updatedAt} updatedAt={updatedAt} />
      {children}
    </span>
  )
}
