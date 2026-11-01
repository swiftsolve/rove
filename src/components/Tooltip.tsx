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
   * Which edge the bubble aligns to. `right` (the default) pins the bubble's
   * right edge to the trigger and grows leftward, so a trigger near the app's
   * right edge never spills the bubble outside the window.
   */
  align?: 'left' | 'right'
  /**
   * Where the bubble opens relative to the trigger. `top`/`bottom` stack the
   * bubble vertically (honouring `align` for horizontal edge); `left`/`right`
   * place it beside the trigger, vertically centred — used by the icon rail.
   * Each side flips to its opposite when it would spill out of the viewport.
   */
  placement?: 'top' | 'bottom' | 'left' | 'right'
  /**
   * Vertical nudge (px) applied to the bubble's final position for `top`/`bottom`
   * placements — positive moves the bubble down. Lets a caller close the gap to
   * the trigger without changing the shared default for every tooltip.
   */
  offset?: number
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
type Placement = NonNullable<TooltipProps['placement']>

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

const GAP = 6
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
function computeSidePosition(
  triggerRect: DOMRect,
  bubble: BubbleSize,
  placement: 'left' | 'right',
): Coords {
  const wouldOverflowRight =
    triggerRect.right + GAP + bubble.width > window.innerWidth - VIEWPORT_PAD
  const wouldOverflowLeft = triggerRect.left - GAP - bubble.width < VIEWPORT_PAD

  let side = placement
  if (placement === 'right' && wouldOverflowRight) side = 'left'
  else if (placement === 'left' && wouldOverflowLeft) side = 'right'

  const left = side === 'right' ? triggerRect.right + GAP : triggerRect.left - GAP - bubble.width
  const top = triggerRect.top + triggerRect.height / 2 - bubble.height / 2
  return clampToViewport({ top, left }, bubble)
}

/**
 * Above or below the trigger, pinned to its `align` edge. Each axis flips to
 * the opposite edge/side when the bubble would overflow the viewport.
 */
function computeStackedPosition(
  triggerRect: DOMRect,
  bubble: BubbleSize,
  align: Align,
  placement: 'top' | 'bottom',
  offset: number,
): Coords {
  let effectiveAlign = align
  if (align === 'left' && triggerRect.left + bubble.width > window.innerWidth - VIEWPORT_PAD) {
    effectiveAlign = 'right'
  } else if (align === 'right' && triggerRect.right - bubble.width < VIEWPORT_PAD) {
    effectiveAlign = 'left'
  }

  let effectivePlacement = placement
  if (placement === 'bottom') {
    if (triggerRect.bottom + GAP + bubble.height > window.innerHeight - VIEWPORT_PAD) {
      effectivePlacement = 'top'
    }
  } else if (triggerRect.top - GAP - bubble.height < VIEWPORT_PAD) {
    effectivePlacement = 'bottom'
  }

  const top =
    effectivePlacement === 'bottom'
      ? triggerRect.bottom + GAP + offset
      : triggerRect.top - GAP - bubble.height + offset
  const left = effectiveAlign === 'left' ? triggerRect.left : triggerRect.right - bubble.width
  return clampToViewport({ top, left }, bubble)
}

function computePosition(
  triggerRect: DOMRect,
  bubble: BubbleSize,
  align: Align,
  placement: Placement,
  offset: number,
): Coords {
  if (placement === 'left' || placement === 'right') {
    return computeSidePosition(triggerRect, bubble, placement)
  }
  return computeStackedPosition(triggerRect, bubble, align, placement, offset)
}

/**
 * A small in-app tooltip. Renders the bubble in a portal with fixed positioning
 * so it is never clipped by `overflow: hidden` on cards.
 */
export function Tooltip({
  content,
  children,
  align = 'right',
  placement = 'bottom',
  offset = 0,
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

    setCoords(computePosition(triggerRect, { width, height }, align, placement, offset))
  }, [align, placement, offset])

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
