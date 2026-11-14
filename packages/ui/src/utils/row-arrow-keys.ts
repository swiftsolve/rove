import type { KeyboardEvent } from 'react'

/**
 * A row's own control: the first button or link in it. A menu trigger is left
 * out, since its arrow keys open its menu.
 */
const ROW_CONTROL = 'button:not([aria-haspopup]), a[href]'

/** The row index an arrow, Home or End moves to from `index`, stopping at the ends; null for any other key. */
function targetRowIndex(key: string, index: number, rowCount: number): number | null {
  const lastIndex = rowCount - 1
  if (key === 'ArrowDown') return Math.min(index + 1, lastIndex)
  if (key === 'ArrowUp') return Math.max(index - 1, 0)
  if (key === 'Home') return 0
  if (key === 'End') return lastIndex
  return null
}

/**
 * A list's `onKeyDown`: Up and Down move focus to the next or previous row's
 * control, and Home and End to the first or last. Each row stays its own Tab
 * stop, so the arrows are a shortcut on top of Tab. Not `useRovingFocus`: a
 * roving tabindex suits a toolbar or the nav rail, and would hide all but one
 * row of a plain list from Tab and from a screen reader's list.
 */
export function moveFocusBetweenRows(event: KeyboardEvent<HTMLElement>): void {
  const hasModifier = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
  if (event.defaultPrevented || hasModifier) return
  const focused = event.target
  if (!(focused instanceof HTMLElement) || !focused.matches(ROW_CONTROL)) return

  const rows = [...event.currentTarget.children]
  const rowControls = rows.flatMap((row) => row.querySelector<HTMLElement>(ROW_CONTROL) ?? [])
  const focusedRow = rows.find((row) => row.contains(focused))
  const index = rowControls.findIndex((control) => focusedRow?.contains(control))
  if (index === -1) return
  const nextIndex = targetRowIndex(event.key, index, rowControls.length)
  if (nextIndex === null) return

  event.preventDefault()
  rowControls[nextIndex]?.focus()
}
