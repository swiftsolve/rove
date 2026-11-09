import { cva } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '../utils/cn'
import type { VariantOf } from '../utils/variants'

const dotVariants = cva('inline-block size-[5px] shrink-0 rounded-full', {
  variants: {
    tone: {
      current: 'bg-current',
      positive: 'bg-status-positive',
      accent: 'bg-accent',
    },
    pulse: {
      calm: 'animate-pulse-calm',
      live: 'animate-pulse-live',
      busy: 'animate-pulse-busy',
    },
  },
  defaultVariants: { tone: 'current' },
})

type StatusDotProps = Omit<ComponentProps<'span'>, 'children'> & {
  /**
   * Its colour: the text colour (`current`), `positive` for a healthy state
   * whose words stay quiet (online), or `accent` for work under way (a scan).
   */
  tone?: VariantOf<typeof dotVariants, 'tone'>
  /**
   * A pulse whose shape says what it marks: `calm`, a slow shallow breath, for
   * a steady state (connected); `busy`, a quick deep throb, for work under way
   * (a scan); `live`, one quicker, deeper breath, for data streaming in. Live
   * runs once: give the dot a new `key` on each update, as `LiveBadge` does,
   * so it breathes in step with the numbers, and set `--live-elapsed` to the
   * update's age so one that mounts between updates picks up in step. With no
   * update for 3s it fades to dim, as the data has stalled.
   */
  pulse?: VariantOf<typeof dotVariants, 'pulse'>
  /** Its place in a line: a gap and alignment beside text (`mr-8 align-middle`). */
  className?: string
}

/** A small dot that marks a status beside its words; decorative, so the words carry it. */
export function StatusDot({ tone = 'current', pulse, className, ...props }: StatusDotProps) {
  return <span className={cn(dotVariants({ tone, pulse }), className)} aria-hidden {...props} />
}
