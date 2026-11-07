import { Field } from '@base-ui/react/field'
import { cva, cx } from 'class-variance-authority'
import type { ComponentProps, MouseEventHandler, ReactNode } from 'react'

import { ButtonSpinner } from '../spinner/ButtonSpinner'
import { cn } from '../utils/cn'
import { PRESS, pressableProps, STATE_CLASSES } from '../utils/pressable'

// The same 8px above the field as the feedback line below it.
const LABEL = 'type-body-medium text-tertiary mb-8 block'

// Explicit line-height pins the field to an even height (18 + 20 = 38px), so the
// 30px action centred beside the text sits 4px from the top and bottom edges.
const INPUT = cx(
  'type-body w-full rounded-sm px-12 py-10 leading-[18px] text-primary placeholder:text-tertiary',
  'transition-[border-color] duration-(--duration-fast) ease-in-out focus-visible:outline-none',
)

// On its own, the input draws the border.
const BORDERED_INPUT = cx(
  INPUT,
  'border border-line bg-inset focus-visible:border-accent data-invalid:border-status-negative',
)

// With an action, the group draws the border and the input inside goes
// borderless, so the two read as one control.
const GROUPED_INPUT = cx(INPUT, 'min-w-0 flex-auto border-none bg-transparent')

// Invalid reads from the input's `data-invalid`, which Field sets. The right
// padding matches the action's 4px above and below, so it's inset evenly.
const GROUP = cx(
  'flex items-center gap-4 rounded-sm border bg-inset pr-4',
  'border-line focus-within:border-accent has-data-invalid:border-status-negative',
  'transition-[border-color] duration-(--duration-fast) ease-in-out',
)

const FEEDBACK = 'mt-8 empty:mt-0 type-body text-tertiary data-invalid:text-negative'

type TextFieldProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'className' | 'placeholder'> & {
  /** Names the field, above it. */
  label: string
  /** What's typed in it. */
  value: string
  /** Called with the new text on every edit. */
  onChange: (value: string) => void
  /** The value failed to parse or check: a red border, and `aria-invalid`. */
  isInvalid?: boolean
  /**
   * Under the field and read as its description: a hint, a result, an error.
   * A live region, so it's announced as it changes.
   */
  feedback?: ReactNode
  /** A button inside the field's border, after the text: a TextFieldAction. */
  action?: ReactNode
  /** Sample input, shown while it's empty: "example.com or 192.168.1.1". */
  placeholder?: string
  /** On the field as a whole: its place in the form, such as space above it (`mt-16`). */
  className?: string
}

/** A labelled single-line text input. */
export function TextField({
  label,
  value,
  onChange,
  isInvalid = false,
  feedback,
  action,
  className,
  ...inputProps
}: TextFieldProps) {
  const control = (
    <Field.Control
      value={value}
      onValueChange={(next) => onChange(next)}
      className={action == null ? BORDERED_INPUT : GROUPED_INPUT}
      {...inputProps}
    />
  )
  return (
    <Field.Root invalid={isInvalid} className={cn('block', className)}>
      <Field.Label className={LABEL}>{label}</Field.Label>
      {action == null ? (
        control
      ) : (
        <div className={GROUP}>
          {control}
          {action}
        </div>
      )}
      {/* Always mounted, so the first message is announced: a region that mounts
          already holding its text often isn't. Empty, it takes no space. */}
      <Field.Description render={<div role="status" />} className={FEEDBACK}>
        {feedback}
      </Field.Description>
    </Field.Root>
  )
}

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
