import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import { cx } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../utils/cn'

type CollapsibleProps = Omit<ComponentProps<'div'>, 'children'> & {
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
