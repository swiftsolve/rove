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
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/cn'

const bubbleVariants = cva(
  [
    'fixed z-9999 w-max px-10 py-8 rounded-sm',
    'bg-raised border border-line-strong shadow-raised',
    'text-xs leading-hint text-secondary text-left whitespace-normal pointer-events-none',
    '[transition:opacity_var(--duration-fast)_var(--ease-in-out),transform_var(--duration-fast)_var(--ease-in-out),visibility_var(--duration-fast)]',
  ],
  {
    variants: {
      /** Placed: hidden until the first measure gives it real coordinates. */
      isVisible: {
        true: 'opacity-100 visible transform-[translateY(0)]',
        false: 'opacity-0 invisible transform-[translateY(-3px)]',
      },
    },
  },
)

interface TooltipProps {
  /** Label shown on hover / keyboard focus. */
  content: ReactNode
  /** The trigger element (usually an icon button). */
  children: ReactNode
  /**
   * The trigger's side the bubble opens on: `bottom` (the default) or `top`
   * stack it, `left` or `right` set it beside the trigger, vertically centred
   * (the nav rail). It flips to the opposite side when it would spill out of
   * the window.
   */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /**
   * For `top` and `bottom`, the trigger edge the bubble lines up with. `end`
   * (the default) grows it leftward from the trigger's right edge, so a trigger
   * near the window's right edge never spills it; `start` grows it rightward.
   */
  align?: 'start' | 'end'
  /** The gap (px) between the trigger and the bubble. */
  sideOffset?: number
  /** When true, the tooltip never opens — used to hide stale content (e.g. a
   *  capability rating while a fresh test is running). */
  isDisabled?: boolean
  /** False when the content only repeats the trigger's accessible name, so a
   *  screen reader doesn't read it twice. A string equal to the trigger's
   *  `aria-label` is caught without it. */
  shouldDescribe?: boolean
  /** Extra class on the wrapper span, so a caller can make the trigger participate
   *  in its own flex layout (e.g. shrink/truncate) rather than sit at intrinsic
   *  width. */
  className?: string
  /** Max width (px) of the bubble before its content wraps. Defaults to
   *  `MAX_WIDTH`; raise it for content that reads better on fewer lines (e.g. a
   *  hostname, which otherwise wraps and leaves the box padded out to the cap). */
  maxWidth?: number
}

type Align = NonNullable<TooltipProps['align']>
type Side = NonNullable<TooltipProps['side']>

interface Coords {
  top: number
  left: number
}

interface BubbleSize {
  width: number
  height: number
}

/** The trigger props the tooltip wires into its child. */
interface TriggerProps {
  'aria-label'?: string
  'aria-describedby'?: string
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void
  onClick?: (event: MouseEvent<HTMLElement>) => void
}

const DEFAULT_SIDE_OFFSET = 6
const VIEWPORT_PAD = 8
const MAX_WIDTH = 260
// Parks the bubble off-screen for the render that measures it, before `coords`
// are known.
const OFFSCREEN = -9999

/** Keep the bubble inside the viewport, at least `VIEWPORT_PAD` from each edge. */
function clampToViewport({ top, left }: Coords, bubble: BubbleSize): Coords {
  return {
    top: Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - bubble.height - VIEWPORT_PAD)),
    left: Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - bubble.width - VIEWPORT_PAD)),
  }
}

/** Beside the trigger, vertically centred, flipping sides if it would overflow. */
function computeBesidePosition(
  triggerRect: DOMRect,
  bubble: BubbleSize,
  side: 'left' | 'right',
  gap: number,
): Coords {
  const wouldOverflowRight =
    triggerRect.right + gap + bubble.width > window.innerWidth - VIEWPORT_PAD
  const wouldOverflowLeft = triggerRect.left - gap - bubble.width < VIEWPORT_PAD

  let effectiveSide = side
  if (side === 'right' && wouldOverflowRight) effectiveSide = 'left'
  else if (side === 'left' && wouldOverflowLeft) effectiveSide = 'right'

  const left = effectiveSide === 'right' ? triggerRect.right + gap : triggerRect.left - gap - bubble.width
  const top = triggerRect.top + triggerRect.height / 2 - bubble.height / 2
  return clampToViewport({ top, left }, bubble)
}

/**
 * Above or below the trigger, lined up with its `align` edge. Each axis flips
 * to the opposite edge or side when the bubble would overflow the viewport.
 */
function computeStackedPosition(
  triggerRect: DOMRect,
  bubble: BubbleSize,
  side: 'top' | 'bottom',
  align: Align,
  gap: number,
): Coords {
  let effectiveAlign = align
  if (align === 'start' && triggerRect.left + bubble.width > window.innerWidth - VIEWPORT_PAD) {
    effectiveAlign = 'end'
  } else if (align === 'end' && triggerRect.right - bubble.width < VIEWPORT_PAD) {
    effectiveAlign = 'start'
  }

  let effectiveSide = side
  if (side === 'bottom') {
    if (triggerRect.bottom + gap + bubble.height > window.innerHeight - VIEWPORT_PAD) {
      effectiveSide = 'top'
    }
  } else if (triggerRect.top - gap - bubble.height < VIEWPORT_PAD) {
    effectiveSide = 'bottom'
  }

  const top =
    effectiveSide === 'bottom' ? triggerRect.bottom + gap : triggerRect.top - gap - bubble.height
  const left = effectiveAlign === 'start' ? triggerRect.left : triggerRect.right - bubble.width
  return clampToViewport({ top, left }, bubble)
}

function computePosition(triggerRect: DOMRect, bubble: BubbleSize, side: Side, align: Align, gap: number): Coords {
  if (side === 'left' || side === 'right') return computeBesidePosition(triggerRect, bubble, side, gap)
  return computeStackedPosition(triggerRect, bubble, side, align, gap)
}

/**
 * A small in-app tooltip. Renders the bubble in a portal with fixed positioning
 * so it is never clipped by `overflow: hidden` on cards.
 */
export function Tooltip({
  content,
  children,
  side = 'bottom',
  align = 'end',
  sideOffset = DEFAULT_SIDE_OFFSET,
  isDisabled = false,
  shouldDescribe = true,
  className,
  maxWidth = MAX_WIDTH,
}: TooltipProps): JSX.Element {
  const descriptionId = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const [isSuppressed, setIsSuppressed] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [coords, setCoords] = useState<Coords | null>(null)

  const isOpen = (isHovered || isFocused) && !isSuppressed && !isDisabled

  const updatePosition = useCallback(() => {
    const wrap = wrapRef.current
    const bubble = bubbleRef.current
    if (!wrap || !bubble) return

    const triggerRect = wrap.getBoundingClientRect()
    const { width, height } = bubble.getBoundingClientRect()
    if (width === 0 || height === 0) return

    setCoords(computePosition(triggerRect, { width, height }, side, align, sideOffset))
  }, [side, align, sideOffset])

  useLayoutEffect(() => {
    if (!isOpen) return

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
      // Forget the position so the next open measures afresh instead of
      // flashing the bubble where it last stood.
      setCoords(null)
    }
  }, [isOpen, updatePosition, content])

  const isTriggerElement = isValidElement<TriggerProps>(children)
  const isLabelRepeat = isTriggerElement && typeof content === 'string' && content === children.props['aria-label']
  const isDescribing = isTriggerElement && shouldDescribe && !isDisabled && !isLabelRepeat

  const trigger = isTriggerElement
    ? cloneElement(
        children,
        {
          // Points at the hidden copy below, not the bubble, so the hint is
          // there before focus lands and in browse mode, where focus never moves.
          'aria-describedby': isDescribing ? descriptionId : undefined,
          onPointerDown: (event: PointerEvent<HTMLElement>) => {
            setIsSuppressed(true)
            children.props.onPointerDown?.(event)
          },
          onClick: (event: MouseEvent<HTMLElement>) => {
            // Only a pointer click hides the bubble and drops focus. A keyboard
            // activation (Enter/Space reports `detail === 0`) must keep focus on
            // the trigger, or it falls back to <body> and the Tab position is lost.
            if (event.detail !== 0) {
              setIsSuppressed(true)
              ;(event.currentTarget as HTMLElement).blur()
            }
            children.props.onClick?.(event)
          },
        },
      )
    : children

  return (
    <>
      <span
        ref={wrapRef}
        className={cn('relative inline-flex', className)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={(event) => {
          setIsFocused(true)
          // Keyboard focus always shows the bubble, even if an earlier click left
          // it suppressed with the pointer still resting on the trigger.
          if ((event.target as HTMLElement).matches(':focus-visible')) setIsSuppressed(false)
        }}
        onBlurCapture={(event) => {
          if (!wrapRef.current?.contains(event.relatedTarget as Node | null)) {
            setIsFocused(false)
          }
        }}
        onPointerLeave={() => setIsSuppressed(false)}
      >
        {trigger}
        {isDescribing && (
          <span id={descriptionId} hidden>
            {content}
          </span>
        )}
      </span>
      {isOpen &&
        createPortal(
          // Visual only: screen readers get the hidden copy as the trigger's
          // description.
          <span
            ref={bubbleRef}
            className={bubbleVariants({ isVisible: coords != null })}
            aria-hidden
            style={{
              top: coords?.top ?? OFFSCREEN,
              left: coords?.left ?? OFFSCREEN,
              maxWidth,
            }}
          >
            {content}
          </span>,
          document.body,
        )}
    </>
  )
}
