import type { MouseEvent, MouseEventHandler } from 'react'

// The behaviour every pressable in the library shares (Button, IconButton,
// PageHeader's back button…): how disabled and loading work. Each keeps its
// own look.

/** The press nudge, only while the control is usable. */
export const PRESS = 'usable:active:transform-[translateY(0.5px)]'

/** Disabled dims; loading stays at full opacity, since its spinner shows the wait. */
export const STATE_CLASSES = 'data-disabled:cursor-not-allowed data-disabled:opacity-(--opacity-disabled) data-loading:cursor-default'

interface PressableState {
  isDisabled?: boolean | null
  isLoading?: boolean | null
  onClick?: MouseEventHandler<HTMLButtonElement>
}

type PressableProps = {
  'aria-disabled': true | undefined
  'aria-busy': true | undefined
  'data-disabled': '' | undefined
  'data-loading': '' | undefined
  onClick: MouseEventHandler<HTMLButtonElement>
}

/**
 * The `<button>` attributes for the two states. Both keep the button
 * focusable, so a tooltip can still say why, and both swallow activation:
 * a click, Enter or Space never reaches `onClick`, and a submit button
 * never submits its form.
 */
export function pressableProps({ isDisabled, isLoading, onClick }: PressableState): PressableProps {
  const isInert = Boolean(isDisabled || isLoading)
  return {
    'aria-disabled': isDisabled || undefined,
    'aria-busy': isLoading || undefined,
    'data-disabled': isDisabled ? '' : undefined,
    'data-loading': isLoading ? '' : undefined,
    onClick: (event: MouseEvent<HTMLButtonElement>) => {
      if (isInert) {
        event.preventDefault()
        return
      }
      onClick?.(event)
    },
  }
}
