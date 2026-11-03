import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { cx } from 'class-variance-authority'
import { cloneElement, type ReactElement, type ReactNode, useId } from 'react'
import { createPortal } from 'react-dom'

// Fades in from 3px above its place. Not hoverable: the pointer passes through.
const BUBBLE = cx(
  'w-max px-10 py-8 rounded-sm',
  'bg-popover border border-line shadow-popover',
  'text-xs leading-hint text-secondary text-left whitespace-normal pointer-events-none',
  'transition-[opacity,transform] duration-(--duration-fast) ease-in-out',
  'data-starting-style:opacity-0 data-starting-style:transform-[translateY(-3px)]',
  'data-ending-style:opacity-0 data-ending-style:transform-[translateY(-3px)]',
)

/** Kept from the window's edges. */
const VIEWPORT_PAD = 8

type TooltipProps = {
  /** Shown on hover and keyboard focus. */
  content: ReactNode
  /** The trigger: one element that takes a ref and props (a button, an icon's span). */
  children: ReactElement<{ 'aria-label'?: string; 'aria-describedby'?: string }>
  /**
   * The trigger's side the bubble opens on, centred on the trigger: `bottom`
   * or `top` stack it, `left` or `right` set it beside it (the
   * nav rail). It flips to the other side when it would leave the window, and
   * slides along to stay inside it.
   */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** The gap (px) between the trigger and the bubble. */
  sideOffset?: number
  /** Never opens: for content that would be stale (a rating while a new test runs). */
  isDisabled?: boolean
  /**
   * False when the content only repeats the trigger's accessible name, so a
   * screen reader doesn't read it twice. A string equal to the trigger's
   * `aria-label` is caught without it.
   */
  shouldDescribe?: boolean
  /** The bubble's width (px) before its content wraps; wider for one-line content like a hostname. */
  maxWidth?: number
}

/**
 * A short hint on hover and keyboard focus, portalled so a card's clipping
 * never cuts it. A click hides it. Screen readers get the content as the
 * trigger's description, unless it repeats the trigger's name.
 */
export function Tooltip({
  content,
  children,
  side = 'bottom',
  sideOffset = 6,
  isDisabled = false,
  shouldDescribe = true,
  maxWidth = 260,
}: TooltipProps) {
  const descriptionId = useId()
  const isLabelRepeat = typeof content === 'string' && content === children.props['aria-label']
  const isDescribing = shouldDescribe && !isDisabled && !isLabelRepeat
  const ownDescription = children.props['aria-describedby']
  // Base UI lets the trigger's own props win, so a trigger that already has a
  // description gets the joined one set on it directly.
  const trigger =
    isDescribing && ownDescription
      ? cloneElement(children, { 'aria-describedby': `${ownDescription} ${descriptionId}` })
      : children

  return (
    <BaseTooltip.Root disabled={isDisabled} disableHoverablePopup>
      <BaseTooltip.Trigger
        delay={0}
        render={trigger}
        aria-describedby={isDescribing && !ownDescription ? descriptionId : undefined}
      />
      {/* The bubble is visual only; this copy is what the trigger's description
          points at, so it's there before focus lands and in browse mode. */}
      {isDescribing &&
        createPortal(
          <span id={descriptionId} hidden>
            {content}
          </span>,
          document.body,
        )}
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner
          className="z-9999"
          positionMethod="fixed"
          side={side}
          align="center"
          sideOffset={sideOffset}
          collisionPadding={VIEWPORT_PAD}
        >
          <BaseTooltip.Popup className={BUBBLE} style={{ maxWidth }} aria-hidden>
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  )
}
