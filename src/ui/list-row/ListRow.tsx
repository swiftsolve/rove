import { cx } from 'class-variance-authority'
import type { ComponentProps, MouseEventHandler, ReactNode } from 'react'

import { ChevronRightIcon } from '../icons/Icons'
import { cn } from '../utils/cn'
import { pressableProps, STATE_CLASSES } from '../utils/pressable'

// The hover wash bleeds 8px into the card's padding while the content stays on
// the 16px edge, so the focus ring (the ring alone, no wash) goes inside it.
const ROW = cx(
  'group/row flex items-center gap-12 rounded-sm text-left',
  '-mx-8 w-[calc(100%+16px)] px-8 py-(--row-padding-y)',
  'transition-[background] duration-(--duration-fast) ease-in-out',
  'focus-visible:outline-offset-(--focus-inset)',
  'usable:hover:bg-fill-hover',
  STATE_CLASSES,
)

// Always faintly there, so the right edge is consistent and rows read as
// tappable; brighter on hover (unless disabled) and focus.
const CHEVRON = cx(
  'shrink-0 text-tertiary opacity-30',
  'transition-opacity duration-(--duration-fast) ease-in-out',
  'group-usable/row:group-hover/row:opacity-70 group-focus-visible/row:opacity-70',
)

type ListRowProps = Omit<ComponentProps<'button'>, 'children' | 'onClick' | 'disabled' | 'type'> & {
  /** What the row opens. */
  onClick: MouseEventHandler<HTMLButtonElement>
  /**
   * Inert for now (results that are being replaced): faded like any disabled
   * control, no hover, no action. It keeps its place in the Tab order.
   */
  isDisabled?: boolean
  /**
   * The row's content: an icon tile, a title and its description. Anything
   * right-aligned (a meter) goes last, after a text column that takes `flex-1`.
   */
  children: ReactNode
}

/** A whole-row button in a card's list that opens something, with a trailing chevron. */
export function ListRow({ onClick, isDisabled = false, className, children, ...props }: ListRowProps) {
  return (
    <button {...props} type="button" className={cn(ROW, className)} {...pressableProps({ isDisabled, onClick })}>
      <span className="flex min-w-0 flex-1 items-center gap-12">{children}</span>
      <ChevronRightIcon size={16} className={CHEVRON} />
    </button>
  )
}
