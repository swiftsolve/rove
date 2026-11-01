import { useEffect, useId, useRef, type KeyboardEvent, type RefObject } from 'react'
import { useLatestRef } from '@/ui'

interface MenuWiring {
  /** Wraps the trigger and the open menu; a mousedown outside it closes the menu. */
  rootRef: RefObject<HTMLDivElement>
  /** Spread onto the button that opens the menu. */
  triggerProps: {
    ref: RefObject<HTMLButtonElement>
    id: string
    'aria-haspopup': 'menu'
    'aria-expanded': boolean
    'aria-controls': string | undefined
  }
  /** Spread onto the `role="menu"` element. Its items are `role="menuitem"` buttons
   *  with `tabIndex={-1}`: the arrow keys move between them, not Tab. */
  menuProps: {
    ref: RefObject<HTMLDivElement>
    id: string
    role: 'menu'
    'aria-labelledby': string
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
  }
}

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return menu ? [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')] : []
}

/**
 * The keyboard and focus behaviour of an overflow menu, per the ARIA menu
 * button pattern: opening focuses the first item; ↑/↓ move (and wrap), Home/End
 * jump to the ends; Escape closes and returns focus to the trigger; Tab or a
 * click outside closes it. The caller owns `isOpen` and renders the markup.
 */
export function useMenu(isOpen: boolean, close: () => void): MenuWiring {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerId = useId()
  const menuId = useId()
  // Callers often pass a fresh `close` each render; reading it through a ref
  // keeps the open effect (which moves focus) from re-running on every render.
  const closeRef = useLatestRef(close)

  useEffect(() => {
    if (!isOpen) return
    menuItems(menuRef.current)[0]?.focus()
    const closeOnOutsideMouseDown = (event: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closeRef.current()
    }
    document.addEventListener('mousedown', closeOnOutsideMouseDown)
    return () => document.removeEventListener('mousedown', closeOnOutsideMouseDown)
  }, [isOpen, closeRef])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const items = menuItems(menuRef.current)
    const current = items.indexOf(document.activeElement as HTMLElement)
    const focusAt = (index: number): void => items[(index + items.length) % items.length]?.focus()

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusAt(current + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusAt(current - 1)
        break
      case 'Home':
        event.preventDefault()
        focusAt(0)
        break
      case 'End':
        event.preventDefault()
        focusAt(items.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        close()
        triggerRef.current?.focus()
        break
      case 'Tab':
        close()
        break
    }
  }

  return {
    rootRef,
    triggerProps: {
      ref: triggerRef,
      id: triggerId,
      'aria-haspopup': 'menu',
      'aria-expanded': isOpen,
      'aria-controls': isOpen ? menuId : undefined,
    },
    menuProps: { ref: menuRef, id: menuId, role: 'menu', 'aria-labelledby': triggerId, onKeyDown },
  }
}
