import { cva } from 'class-variance-authority'

import { StatusDot } from '../../status-dot/StatusDot'
import { STATUS_TEXT } from '../../utils/status'
import type { VariantOf } from '../../utils/variants'

// Nudged down a hair so the label optically aligns with the wordmark's centre
// rather than sitting slightly high next to it. A new tone eases the dot and
// words to their new colour.
const statusVariants = cva(
  [
    'type-body-medium',
    'mt-px inline-flex items-center gap-6 [-webkit-app-region:no-drag]',
    'transition-[color] duration-(--duration-normal) ease-in-out',
  ],
  {
    variants: {
      tone: {
        positive: STATUS_TEXT.positive,
        negative: STATUS_TEXT.negative,
        neutral: 'text-tertiary',
      },
    },
  },
)

type TitleBarStatusProps = {
  /**
   * `positive` when connected; `negative`, connected but something's wrong
   * beyond the link; `neutral`, connecting or offline, with a still dot.
   */
  tone: VariantOf<typeof statusVariants, 'tone'>
  /** The status in a word or two: "Online", "No internet", "Offline", "Connecting…". It rises into place each time it changes. */
  children: string
}

/** The connection status beside the brand: a dot (pulsing unless neutral) and its words, announced as they change. */
export function TitleBarStatus({ tone, children }: TitleBarStatusProps) {
  return (
    <span className={statusVariants({ tone })} role="status">
      <StatusDot pulse={tone === 'neutral' ? undefined : 'calm'} />
      {/* Keyed by the words, so each new status mounts afresh and plays its rise. */}
      <span key={children} className="inline-block animate-status-flip">
        {children}
      </span>
    </span>
  )
}
