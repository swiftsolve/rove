import { forwardRef, type InputHTMLAttributes, type MouseEventHandler, type ReactNode } from 'react'
import { Field } from '@base-ui/react/field'
import { cva, cx } from 'class-variance-authority'
import { cn } from '../foundations/cn'
import { ButtonSpinner } from '../spinner/ButtonSpinner'
import { pressableProps } from '../foundations/pressable'

const LABEL = 'text-overline mb-6 block'

// Explicit line-height pins the field to an even height (18 + 20 = 38px), so a
// fixed-height action centred beside the text lands on a symmetric gap.
const INPUT = cx(
  'w-full rounded-sm px-12 py-10 text-md leading-[18px] text-primary placeholder:text-tertiary',
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

const groupVariants = cva(
  [
    'flex items-center gap-4 rounded-sm border bg-inset pr-6',
    'transition-[border-color] duration-(--duration-fast) ease-in-out',
  ],
  {
    variants: {
      isInvalid: { true: 'border-status-negative', false: 'border-line focus-within:border-accent' },
    },
  },
)

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'> & {
  label: string
  value: string
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
  /** On the field as a whole: its place in the form. */
  className?: string
}

/** A labelled single-line text input. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, value, onChange, isInvalid = false, feedback, action, className, ...inputProps },
  ref,
) {
  const control = (
    <Field.Control
      ref={ref}
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
        <div className={groupVariants({ isInvalid })}>
          {control}
          {action}
        </div>
      )}
      {feedback !== undefined && (
        <Field.Description render={<div role="status" />}>{feedback}</Field.Description>
      )}
    </Field.Root>
  )
})

// A quiet accent wash with an accent label, so it reads as secondary to the
// form's solid confirm. Loading, the label is just a spinner, so the button
// collapses to a square rather than holding its width around it.
const actionVariants = cva(
  [
    'inline-flex h-[30px] shrink-0 items-center justify-center rounded-sm',
    'bg-accent-muted text-xs font-semibold tracking-label-default text-accent-text',
    'transition-[background,color] duration-(--duration-fast) ease-in-out',
    'data-disabled:cursor-not-allowed data-disabled:opacity-(--opacity-disabled)',
  ],
  {
    variants: {
      isLoading: { true: 'w-[30px] min-w-0 cursor-default', false: 'min-w-[52px] px-10' },
    },
  },
)

interface TextFieldActionProps {
  children: string
  onClick: MouseEventHandler<HTMLButtonElement>
  isDisabled?: boolean
  isLoading?: boolean
  /** Names the button while loading, when only a spinner shows ("Testing"). */
  loadingLabel?: string
}

/** The button inside a TextField's border (Test). Disabled and loading work as on Button. */
export function TextFieldAction({
  children,
  onClick,
  isDisabled,
  isLoading = false,
  loadingLabel,
}: TextFieldActionProps): JSX.Element {
  return (
    <button
      type="button"
      className={actionVariants({ isLoading })}
      aria-label={isLoading ? loadingLabel : undefined}
      {...pressableProps({ isDisabled, isLoading, onClick })}
    >
      {isLoading ? <ButtonSpinner size={13} /> : children}
    </button>
  )
}
