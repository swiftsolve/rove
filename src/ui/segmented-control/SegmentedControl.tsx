import type { ReactNode } from 'react'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import { cx } from 'class-variance-authority'

// An inset pill track, like the Toggle's, so the two read as a set.
const TRACK = 'inline-flex gap-2 p-2 bg-inset border border-line rounded-sm'

// Segments sit 2px inside the track, so the focus ring goes inside the segment
// rather than over the track's edge and its neighbours. The chosen one is lit
// with the accent.
const SEGMENT = cx(
  'inline-flex items-center gap-6 py-[5px] px-10 border-none rounded-xs cursor-pointer',
  'text-xs font-medium',
  'transition-[background,color] duration-(--duration-fast) ease-in-out',
  'focus-visible:outline-offset-(--focus-inset)',
  'bg-transparent text-tertiary hover:text-secondary',
  'data-checked:bg-accent-muted data-checked:text-accent-text data-checked:hover:text-accent-text',
)

export interface SegmentedOption<Value extends string> {
  value: Value
  label: string
  icon?: ReactNode
}

interface SegmentedControlProps<Value extends string> {
  options: SegmentedOption<Value>[]
  value: Value
  onChange: (value: Value) => void
  /** Names the group, or the id of the text that does. */
  'aria-label'?: string
  'aria-labelledby'?: string
  /** Id of the text that explains it. */
  'aria-describedby'?: string
}

/**
 * A few mutually exclusive options side by side: a radio group with one Tab
 * stop, the arrow keys choosing the next or previous option.
 */
export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  ...ariaProps
}: SegmentedControlProps<Value>): JSX.Element {
  return (
    <RadioGroup
      className={TRACK}
      value={value}
      onValueChange={(next) => onChange(next as Value)}
      {...ariaProps}
    >
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={SEGMENT}
          nativeButton
          render={<button type="button" />}
        >
          {option.icon}
          <span>{option.label}</span>
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}
