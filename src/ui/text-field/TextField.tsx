import { Field } from '@base-ui/react/field'
import { cx } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../utils/cn'

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
