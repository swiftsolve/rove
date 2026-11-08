import { cva } from 'class-variance-authority'
import type { ComponentProps, MouseEventHandler } from 'react'

import { ButtonSpinner } from '../../spinner/ButtonSpinner'
import { cn } from '../../utils/cn'
import { PRESS, pressableProps, STATE_CLASSES } from '../../utils/pressable'

// A quiet accent wash with an accent label, so it reads as secondary to the
// form's solid confirm. Its corner is a step smaller than the field's, so the
// two curves stay parallel 4px apart. Loading, the label is just a spinner, so
// the button collapses to a square rather than holding its width around it.
const actionVariants = cva(
  [
    'inline-flex h-[30px] shrink-0 items-center justify-center rounded-xs',
    'type-body-semibold bg-accent-muted text-accent-text',
    'transition-[background,color,transform] duration-(--duration-fast) ease-in-out',
    PRESS,
    STATE_CLASSES,
  ],
  {
    variants: {
      isLoading: { true: 'w-[30px] min-w-0', false: 'min-w-[52px] px-10' },
    },
    defaultVariants: { isLoading: false },
  },
)

type TextFieldActionProps = Omit<ComponentProps<'button'>, 'children' | 'onClick' | 'disabled' | 'type'> & {
  /** The label: a word, "Test". */
  children: string
  /** Runs the action on the field's value. */
  onClick: MouseEventHandler<HTMLButtonElement>
  /** Drops input and dims the button. */
  isDisabled?: boolean
  /** Drops input and shows a spinner in the label's place. */
  isLoading?: boolean
  /** Names the button while loading, when only a spinner shows ("Testing"); the label when left out. */
  loadingLabel?: string
}

/** The button inside a TextField's border (Test). Disabled and loading work as on Button. */
export function TextFieldAction({
  children,
  onClick,
  isDisabled = false,
  isLoading = false,
  loadingLabel,
  className,
  ...props
}: TextFieldActionProps) {
  return (
    <button
      {...props}
      type="button"
      className={cn(actionVariants({ isLoading }), className)}
      // Loading, only a spinner shows, so the button still needs a name.
      aria-label={isLoading ? (loadingLabel ?? children) : undefined}
      {...pressableProps({ isDisabled, isLoading, onClick })}
    >
      {isLoading ? <ButtonSpinner size={13} /> : children}
    </button>
  )
}
