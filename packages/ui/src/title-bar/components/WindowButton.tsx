import { cva } from 'class-variance-authority'

import { CloseIcon, MinimizeIcon } from '../../icons/Icons'
import type { VariantOf } from '../../utils/variants'

const windowButtonVariants = cva(
  [
    'inline-flex h-[26px] w-[28px] items-center justify-center rounded-xs text-tertiary',
    'transition-[color,background] duration-(--duration-fast) ease-in-out',
  ],
  {
    variants: {
      action: {
        minimize: 'hover:bg-hover hover:text-primary',
        close: 'hover:bg-status-negative-solid hover:text-on-solid',
      },
    },
  },
)

const WINDOW_ACTIONS = {
  minimize: { label: 'Minimize', icon: MinimizeIcon },
  close: { label: 'Close', icon: CloseIcon },
}

type WindowButtonProps = {
  /** Which button: its icon, its name, and (for `close`) a red hover. */
  action: VariantOf<typeof windowButtonVariants, 'action'>
  /** Minimises or closes the window. */
  onClick: () => void
}

/**
 * Minimise or close the window. Out of the Tab order, like a native title
 * bar's: otherwise the first Tab lands here instead of the nav rail, and a
 * stray Enter closes the window.
 */
export function WindowButton({ action, onClick }: WindowButtonProps) {
  const { label, icon: Icon } = WINDOW_ACTIONS[action]
  return (
    <button
      type="button"
      className={windowButtonVariants({ action })}
      onClick={onClick}
      aria-label={label}
      tabIndex={-1}
    >
      <Icon size={15} />
    </button>
  )
}
