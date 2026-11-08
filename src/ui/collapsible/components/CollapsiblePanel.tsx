import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import { cx } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../utils/cn'

const PANEL = cx(
  'h-(--collapsible-panel-height) overflow-hidden',
  'transition-[height] duration-(--duration-normal) ease-out',
  'data-ending-style:h-0 data-starting-style:h-0',
)

type CollapsiblePanelProps = Omit<ComponentProps<'div'>, 'children'> & {
  /**
   * What the trigger shows and hides. Pad an element inside: the panel's
   * `className` is for its place (`mt-8`), as padding would survive at height 0.
   */
  children: ReactNode
}

/**
 * What the trigger shows and hides, growing and shrinking to its height; out
 * of the page, and the accessibility tree, while closed.
 */
export function CollapsiblePanel({ className, children, ...props }: CollapsiblePanelProps) {
  return (
    <BaseCollapsible.Panel className={cn(PANEL, className)} render={<div {...props} />}>
      {children}
    </BaseCollapsible.Panel>
  )
}
