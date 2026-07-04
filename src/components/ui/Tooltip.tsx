import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import './Tooltip.css'

interface TooltipProps {
  /** Text shown on hover / keyboard focus. */
  readonly content: string
  /** The trigger element (usually an icon button). */
  readonly children: ReactNode
  /**
   * Which edge the bubble aligns to. `right` (the default) pins the bubble's
   * right edge to the trigger and grows leftward, so a trigger near the app's
   * right edge never spills the bubble outside the window.
   */
  readonly align?: 'left' | 'right'
}

/**
 * A small in-app tooltip. Unlike the native `title` attribute (which the
 * browser renders as an unstyled popup that can escape the window bounds), this
 * stays inside the app and matches the panel styling.
 */
export function Tooltip({ content, children, align = 'right' }: TooltipProps): JSX.Element {
  const bubbleId = useId()
  // Link the trigger to the bubble so a screen reader announces the hint text,
  // not just the trigger's own label.
  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
        'aria-describedby': bubbleId,
      })
    : children

  return (
    <span className={`tooltip-wrap tooltip-${align}`}>
      {trigger}
      <span id={bubbleId} className="tooltip-bubble" role="tooltip">
        {content}
      </span>
    </span>
  )
}
