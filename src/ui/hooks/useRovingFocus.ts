import { type RefObject, useEffect } from 'react'

type RovingFocusOptions = {
  /** Selects the group's items inside it. */
  itemSelector: string
  /** Which arrow keys move between them: Up and Down, or Left and Right. */
  orientation: 'vertical' | 'horizontal'
  /** Selects the item Tab lands on when focus comes back, such as the current page's; the first item without one. */
  currentSelector?: string
}

const NEXT_KEY = { vertical: 'ArrowDown', horizontal: 'ArrowRight' }
const PREVIOUS_KEY = { vertical: 'ArrowUp', horizontal: 'ArrowLeft' }

/** The index an arrow, Home or End moves to from `index`, wrapping at the ends; null for any other key. */
function targetIndex(
  key: string,
  index: number,
  count: number,
  orientation: RovingFocusOptions['orientation'],
): number | null {
  if (key === NEXT_KEY[orientation]) return (index + 1) % count
  if (key === PREVIOUS_KEY[orientation]) return (index - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/**
 * Makes a group of items one Tab stop (a roving tabindex): the arrow keys move
 * between them, and Home and End jump to the ends. Leaving the group puts the
 * stop back on the `currentSelector` item. It sets the items' `tabIndex`, so they
 * mustn't set their own.
 *
 * Not Base UI's Toolbar, its only public roving focus: it makes the group a
 * `toolbar`, and its items throw outside one, but NavItem also stands alone.
 */
export function useRovingFocus(
  groupRef: RefObject<HTMLElement | null>,
  { itemSelector, orientation, currentSelector }: RovingFocusOptions,
): void {
  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    const getItems = (): HTMLElement[] => [...group.querySelectorAll<HTMLElement>(itemSelector)]
    const setTabStop = (stop: HTMLElement | undefined): void => {
      for (const item of getItems()) item.tabIndex = item === stop ? 0 : -1
    }
    const resetTabStop = (): void => {
      const currentItem = currentSelector ? group.querySelector<HTMLElement>(currentSelector) : null
      setTabStop(currentItem ?? getItems()[0])
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const groupItems = getItems()
      const index = groupItems.indexOf(event.target as HTMLElement)
      if (index === -1) return
      const nextIndex = targetIndex(event.key, index, groupItems.length, orientation)
      if (nextIndex === null) return
      event.preventDefault()
      const nextItem = groupItems[nextIndex]
      setTabStop(nextItem)
      nextItem?.focus()
    }
    // A click focuses an item too, so the stop follows focus however it got there.
    const onFocusIn = (event: FocusEvent): void => {
      const item = event.target as HTMLElement
      if (getItems().includes(item)) setTabStop(item)
    }
    const onFocusOut = (event: FocusEvent): void => {
      if (!group.contains(event.relatedTarget as Node | null)) resetTabStop()
    }

    resetTabStop()
    group.addEventListener('keydown', onKeyDown)
    group.addEventListener('focusin', onFocusIn)
    group.addEventListener('focusout', onFocusOut)
    // Items that mount later, or a new current item, while focus is elsewhere.
    const itemChangeObserver = new MutationObserver(() => {
      if (!group.contains(document.activeElement)) resetTabStop()
    })
    itemChangeObserver.observe(group, { subtree: true, childList: true, attributeFilter: ['aria-current'] })
    return () => {
      group.removeEventListener('keydown', onKeyDown)
      group.removeEventListener('focusin', onFocusIn)
      group.removeEventListener('focusout', onFocusOut)
      itemChangeObserver.disconnect()
    }
  }, [groupRef, itemSelector, orientation, currentSelector])
}
