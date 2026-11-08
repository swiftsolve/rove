import { type RefObject, useLayoutEffect, useState } from 'react'

import { BAR_HEIGHT } from '../utils/active-bar'

type BarPlacement = {
  /** Offset from the rail's top. */
  top: number
  /** Whether an item is the current page. */
  isVisible: boolean
  /** Slides from its last spot; off when it first appears and on resizes, so it lands there. */
  isSliding: boolean
}

/** Follows the current page's item, so one accent bar can slide between items. */
export function useActiveBar(railRef: RefObject<HTMLElement | null>): BarPlacement {
  const [bar, setBar] = useState<BarPlacement>({ top: 0, isVisible: false, isSliding: false })
  useLayoutEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const placeBar = (isSliding: boolean): void => {
      const item = rail.querySelector('[aria-current="page"]')
      if (!item) {
        setBar((prev) => ({ ...prev, isVisible: false }))
        return
      }
      const itemBox = item.getBoundingClientRect()
      const top = itemBox.top - rail.getBoundingClientRect().top + (itemBox.height - BAR_HEIGHT) / 2
      setBar((prev) => ({ top, isVisible: true, isSliding: isSliding && prev.isVisible }))
    }
    placeBar(false)
    // Items mark the current page themselves, so watch for it moving.
    const currentPageObserver = new MutationObserver(() => placeBar(true))
    currentPageObserver.observe(rail, { subtree: true, attributeFilter: ['aria-current'] })
    const railResizeObserver = new ResizeObserver(() => placeBar(false))
    railResizeObserver.observe(rail)
    return () => {
      currentPageObserver.disconnect()
      railResizeObserver.disconnect()
    }
  }, [railRef])
  return bar
}
