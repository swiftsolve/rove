import { Menu as BaseMenu } from '@base-ui/react/menu'
import { cx } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../../utils/cn'
import { LAYER_POPOVER } from '../../utils/layers'

const CONTENT = cx(
  'flex min-w-[112px] flex-col gap-2 p-4',
  'rounded-sm border border-line bg-popover shadow-popover',
  'data-open:animate-menu-in',
  // Base UI parks focus on the popup when the menu opens without a keyboard;
  // the ring belongs on the items, which a keyboard open focuses instead.
  'outline-none',
)

/** The dropdown, under the kebab and lined up with its right edge. */
export function MenuContent({
  className,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & {
  /** MenuItems, in order. */
  children: ReactNode
}) {
  return (
    <BaseMenu.Portal>
      {/* Hidden once its kebab scrolls out of view, like a tooltip. */}
      <BaseMenu.Positioner
        className={cx(LAYER_POPOVER, 'data-anchor-hidden:hidden')}
        side="bottom"
        align="end"
        sideOffset={4}
      >
        <BaseMenu.Popup className={cn(CONTENT, className)} render={<div {...props} />}>
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  )
}
