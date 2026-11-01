import { cva } from 'class-variance-authority'
import { cn } from '../foundations/cn'

const dotVariants = cva('inline-block size-[5px] shrink-0 rounded-full bg-current', {
  variants: {
    /**
     * A breathing pulse, at the pace of what it marks: `calm` for a steady
     * state (connected), `live` for data streaming in, `busy` for work under way
     * (a scan).
     */
    pulse: {
      calm: 'animate-pulse-calm',
      live: 'animate-pulse-live',
      busy: 'animate-pulse-busy',
    },
  },
})

interface StatusDotProps {
  pulse?: 'calm' | 'live' | 'busy'
  /** Its colour (`text-positive`) and place in a line. It's the text colour by default. */
  className?: string
}

/** A small dot that marks a status beside its words; decorative, so the words carry it. */
export function StatusDot({ pulse, className }: StatusDotProps): JSX.Element {
  return <span className={cn(dotVariants({ pulse }), className)} aria-hidden />
}
