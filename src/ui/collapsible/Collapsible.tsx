import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react'
import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import { cva, cx } from 'class-variance-authority'
import { cn } from '../foundations/cn'

type CollapsibleProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  /** `li` for a group in a list. */
  as?: 'div' | 'li'
  /**
   * Rings the whole collapsible (trigger and open panel) when the trigger has
   * keyboard focus, instead of the trigger alone: for a trigger that spans a
   * card's or group's header.
   */
  hasFocusFrame?: boolean
  /** A CollapsibleTrigger and a CollapsiblePanel, wherever the layout puts them. */
  children: ReactNode
}

const FOCUS_FRAME = cx(
  'has-[[data-collapsible-trigger]:focus-visible]:[outline:var(--focus-outline)]',
  'has-[[data-collapsible-trigger]:focus-visible]:outline-offset-(--focus-inset)',
)

/** Shows and hides a panel from a trigger: a card's details, a group's rows. */
export function Collapsible({
  isOpen,
  onOpenChange,
  as = 'div',
  hasFocusFrame = false,
  className,
  children,
  ...props
}: CollapsibleProps): JSX.Element {
  return (
    <BaseCollapsible.Root
      open={isOpen}
      onOpenChange={(isNowOpen) => onOpenChange(isNowOpen)}
      render={as === 'li' ? <li /> : <div />}
      className={cn(hasFocusFrame && FOCUS_FRAME, className)}
      {...props}
    >
      {children}
    </BaseCollapsible.Root>
  )
}

/**
 * The button that opens and closes the panel; it says which (aria-expanded)
 * and what it controls. `data-panel-open` is set while open, for styling.
 */
export const CollapsibleTrigger = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function CollapsibleTrigger(props, ref) {
    return <BaseCollapsible.Trigger ref={ref} data-collapsible-trigger="" {...props} />
  },
)

const panelVariants = cva(null, {
  variants: {
    /** Grows and shrinks to its height, rather than appearing at once. */
    isAnimated: {
      true: [
        'h-(--collapsible-panel-height) overflow-hidden',
        'transition-[height] duration-(--duration-normal) ease-out',
        'data-starting-style:h-0 data-ending-style:h-0',
      ],
    },
  },
})

interface CollapsiblePanelProps {
  isAnimated?: boolean
  className?: string
  children: ReactNode
}

/** What the trigger shows and hides; out of the page, and the accessibility tree, while closed. */
export function CollapsiblePanel({ isAnimated = false, className, children }: CollapsiblePanelProps): JSX.Element {
  return <BaseCollapsible.Panel className={cn(panelVariants({ isAnimated }), className)}>{children}</BaseCollapsible.Panel>
}
