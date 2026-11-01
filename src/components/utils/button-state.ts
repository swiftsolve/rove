import type { MouseEventHandler } from 'react'

// What Button and IconButton share: how `isDisabled` and `isLoading` look and
// behave. Each keeps its own shape and variants.

/** The press nudge, only while the button is usable: not disabled, not loading. */
export const BUTTON_PRESS = 'not-aria-disabled:not-aria-busy:active:transform-[translateY(0.5px)]'

/** CVA variants for the two states. Loading stays at full opacity: the spinner shows the wait. */
export const BUTTON_STATE_VARIANTS = {
  isDisabled: { true: 'opacity-(--opacity-disabled) cursor-not-allowed' },
  isLoading: { true: 'cursor-default' },
}

interface ButtonState {
  isDisabled?: boolean | null
  isLoading?: boolean | null
  onClick?: MouseEventHandler<HTMLButtonElement>
}

/**
 * The `<button>` attributes for the two states. Both drop clicks but keep the
 * button focusable, so a Tooltip explaining why still works: disabled sets
 * `aria-disabled`, loading `aria-busy`.
 */
export function buttonStateProps({ isDisabled, isLoading, onClick }: ButtonState): {
  'aria-disabled': true | undefined
  'aria-busy': true | undefined
  onClick: MouseEventHandler<HTMLButtonElement> | undefined
} {
  return {
    'aria-disabled': isDisabled || undefined,
    'aria-busy': isLoading || undefined,
    onClick: isDisabled || isLoading ? undefined : onClick,
  }
}
