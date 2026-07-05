import {
  cloneElement,
  isValidElement,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import './Tooltip.css'

interface TooltipProps {
  /** Label shown on hover / keyboard focus. */
  readonly content: ReactNode
  /** The trigger element (usually an icon button). */
  readonly children: ReactNode
  /**
   * Which edge the bubble aligns to. `right` (the default) pins the bubble's
   * right edge to the trigger and grows leftward, so a trigger near the app's
   * right edge never spills the bubble outside the window.
   */
  readonly align?: 'left' | 'right'
  /**
   * Where the bubble opens relative to the trigger. `top`/`bottom` stack the
   * bubble vertically (honouring `align` for horizontal edge); `left`/`right`
   * place it beside the trigger, vertically centred — used by the icon rail.
   * Each side flips to its opposite when it would spill out of the viewport.
   */
  readonly placement?: 'top' | 'bottom' | 'left' | 'right'
}

const GAP = 6
const VIEWPORT_PAD = 8
const MAX_WIDTH = 260

function computePosition(
  triggerRect: DOMRect,
  bubbleWidth: number,
  bubbleHeight: number,
  align: 'left' | 'right',
  placement: 'top' | 'bottom' | 'left' | 'right',
): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Side placement: bubble sits beside the trigger, vertically centred, and
  // flips to the opposite side if it would overflow the viewport edge.
  if (placement === 'left' || placement === 'right') {
    let side = placement
    if (placement === 'right' && triggerRect.right + GAP + bubbleWidth > vw - VIEWPORT_PAD) {
      side = 'left'
    } else if (placement === 'left' && triggerRect.left - GAP - bubbleWidth < VIEWPORT_PAD) {
      side = 'right'
    }

    const left =
      side === 'right' ? triggerRect.right + GAP : triggerRect.left - GAP - bubbleWidth
    const top = triggerRect.top + triggerRect.height / 2 - bubbleHeight / 2

    return {
      left: Math.max(VIEWPORT_PAD, Math.min(left, vw - bubbleWidth - VIEWPORT_PAD)),
      top: Math.max(VIEWPORT_PAD, Math.min(top, vh - bubbleHeight - VIEWPORT_PAD)),
    }
  }

  let effectiveAlign = align
  let effectivePlacement = placement

  if (align === 'left') {
    if (triggerRect.left + bubbleWidth > vw - VIEWPORT_PAD) {
      effectiveAlign = 'right'
    }
  } else if (triggerRect.right - bubbleWidth < VIEWPORT_PAD) {
    effectiveAlign = 'left'
  }

  if (placement === 'bottom') {
    if (triggerRect.bottom + GAP + bubbleHeight > vh - VIEWPORT_PAD) {
      effectivePlacement = 'top'
    }
  } else if (triggerRect.top - GAP - bubbleHeight < VIEWPORT_PAD) {
    effectivePlacement = 'bottom'
  }

  let top: number
  if (effectivePlacement === 'bottom') {
    top = triggerRect.bottom + GAP
  } else {
    top = triggerRect.top - GAP - bubbleHeight
  }

  let left: number
  if (effectiveAlign === 'left') {
    left = triggerRect.left
  } else {
    left = triggerRect.right - bubbleWidth
  }

  left = Math.max(VIEWPORT_PAD, Math.min(left, vw - bubbleWidth - VIEWPORT_PAD))
  top = Math.max(VIEWPORT_PAD, Math.min(top, vh - bubbleHeight - VIEWPORT_PAD))

  return { top, left }
}

/**
 * A small in-app tooltip. Renders the bubble in a portal with fixed positioning
 * so it is never clipped by `overflow: hidden` on section cards.
 */
export function Tooltip({
  content,
  children,
  align = 'right',
  placement = 'bottom',
}: TooltipProps): JSX.Element {
  const bubbleId = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const [suppressed, setSuppressed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)

  const open = (hovered || focused) && !suppressed

  const updatePosition = useCallback(() => {
    const wrap = wrapRef.current
    const bubble = bubbleRef.current
    if (!wrap || !bubble) return

    const triggerRect = wrap.getBoundingClientRect()
    const { width, height } = bubble.getBoundingClientRect()
    if (width === 0 || height === 0) return

    setCoords(computePosition(triggerRect, width, height, align, placement))
  }, [align, placement])

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition, content])

  const trigger = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          'aria-describedby'?: string
          onPointerDown?: (event: PointerEvent<HTMLElement>) => void
          onClick?: (event: MouseEvent<HTMLElement>) => void
        }>,
        {
          'aria-describedby': bubbleId,
          onPointerDown: (event: PointerEvent<HTMLElement>) => {
            setSuppressed(true)
            children.props.onPointerDown?.(event)
          },
          onClick: (event: MouseEvent<HTMLElement>) => {
            setSuppressed(true)
            ;(event.currentTarget as HTMLElement).blur()
            children.props.onClick?.(event)
          },
        },
      )
    : children

  return (
    <>
      <span
        ref={wrapRef}
        className="tooltip-wrap"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => {
          if (!wrapRef.current?.contains(event.relatedTarget as Node | null)) {
            setFocused(false)
          }
        }}
        onPointerLeave={() => setSuppressed(false)}
      >
        {trigger}
      </span>
      {open &&
        createPortal(
          <span
            id={bubbleId}
            ref={bubbleRef}
            className={`tooltip-bubble tooltip-bubble-portal${coords ? ' is-visible' : ''}`}
            role="tooltip"
            style={{
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              maxWidth: MAX_WIDTH,
            }}
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  )
}
