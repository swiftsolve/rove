import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import { cx } from 'class-variance-authority'
import type { ComponentProps, HTMLAttributes, ReactNode } from 'react'

import { cn } from '../foundations/cn'

type CollapsibleProps = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  /** Whether the panel shows. */
  isOpen: boolean
  /** Called with the new state when the trigger is pressed. */
  onOpenChange: (isOpen: boolean) => void
  /** `li` for a group in a list. */
  as?: 'div' | 'li'
  /**
   * Rings the whole collapsible (trigger and open panel) when the trigger has
   * keyboard focus, instead of the trigger: for a trigger that spans a card's
   * or group's header. Give the header its hover look on focus too.
   */
  hasFocusFrame?: boolean
  /** A CollapsibleTrigger and a CollapsiblePanel, wherever the layout puts them. */
  children: ReactNode
}

const FOCUS_FRAME = cx(
  'has-[[data-collapsible-trigger]:focus-visible]:[outline:var(--focus-outline)]',
  'has-[[data-collapsible-trigger]:focus-visible]:outline-offset-(--focus-inset)',
  // The trigger's own ring would draw a line between it and the panel.
  '[&_[data-collapsible-trigger]:focus-visible]:outline-none',
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
}: CollapsibleProps) {
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
export function CollapsibleTrigger(props: ComponentProps<'button'>) {
  return <BaseCollapsible.Trigger data-collapsible-trigger="" {...props} />
}

// Grows and shrinks to its measured height, rather than appearing at once.
const PANEL = cx(
  'h-(--collapsible-panel-height) overflow-hidden',
  'transition-[height] duration-(--duration-normal) ease-out',
  'data-starting-style:h-0 data-ending-style:h-0',
)

type CollapsiblePanelProps = {
  /** Its place in a layout: space above it (`mt-8`). Inset its content on an element inside it. */
  className?: string
  /** What the trigger shows and hides. */
  children: ReactNode
}

/**
 * What the trigger shows and hides, growing and shrinking to its height; out
 * of the page, and the accessibility tree, while closed.
 */
export function CollapsiblePanel({ className, children }: CollapsiblePanelProps) {
  return <BaseCollapsible.Panel className={cn(PANEL, className)}>{children}</BaseCollapsible.Panel>
}
