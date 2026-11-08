import { Menu as BaseMenu } from '@base-ui/react/menu'
import type { ReactNode } from 'react'

type MenuProps = {
  /** Controlled open state; leave both out to let the menu keep its own. */
  isOpen?: boolean
  /** Called with the new state when the menu opens or closes. */
  onOpenChange?: (isOpen: boolean) => void
  /** A MenuTrigger and a MenuContent. */
  children: ReactNode
}

/**
 * An overflow menu: a kebab that opens a short list of actions. The arrow keys
 * move between items, Escape or a click outside closes it, and focus returns
 * to the kebab.
 */
export function Menu({ isOpen, onOpenChange, children }: MenuProps) {
  return (
    // Not modal: a click outside closes the menu and still lands where it was aimed.
    <BaseMenu.Root open={isOpen} onOpenChange={onOpenChange && ((isNowOpen) => onOpenChange(isNowOpen))} modal={false}>
      {children}
    </BaseMenu.Root>
  )
}
