import { cva } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '../utils/cn'
import type { VariantOf } from '../utils/variants'

const dotVariants = cva('inline-block size-[5px] shrink-0 rounded-full', {
  variants: {
    tone: {
      current: 'bg-current',
      positive: 'bg-status-positive',
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
  /** Its colour: the text colour (`current`), or `positive` when its words stay quiet. */
  tone?: VariantOf<typeof dotVariants, 'tone'>
  /**
   * A breathing pulse, at the pace of what it marks: `calm` for a steady
   * state (connected), `live` for data streaming in, `busy` for work under way
   * (a scan).
   */
  pulse?: VariantOf<typeof dotVariants, 'pulse'>
  /** Its place in a line: a gap and alignment beside text (`mr-8 align-middle`). */
  className?: string
}

/** A small dot that marks a status beside its words; decorative, so the words carry it. */
export function StatusDot({ tone = 'current', pulse, className, ...props }: StatusDotProps) {
  return <span className={cn(dotVariants({ tone, pulse }), className)} aria-hidden {...props} />
}
