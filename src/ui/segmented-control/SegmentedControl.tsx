import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { cx } from 'class-variance-authority'
import type { ComponentProps, CSSProperties, ReactNode } from 'react'

import { cn } from '../foundations/cn'

// An inset track, like the Toggle's, so the two read as a set. Equal grid
// columns make every segment as wide as the widest, so the thumb slides by its
// own width. Plain `1fr`, since `auto-cols-fr`'s `minmax(0, 1fr)` collapses to
// nothing; `w-max`, since a track squeezed to min-content lets columns differ.
const TRACK =
  'relative inline-grid grid-flow-col auto-cols-[1fr] w-max gap-2 p-2 bg-inset border border-line rounded-sm'

// The accent-muted thumb behind the chosen segment. Its width and position
// come from `--count` and `--index` on the track: each column is the track's
// inner width, less the gaps, over the count, and each step is a column plus
// a gap. `data-keeps-transition` lets it slide while a theme switch has
// transitions off (styles/base.css), since picking a theme moves it.
const THUMB = cx(
  'absolute inset-y-2 left-2 rounded-xs bg-accent-muted pointer-events-none',
  'w-[calc((100%-(var(--count)+1)*var(--spacing-2))/var(--count))]',
  'translate-x-[calc(var(--index)*(100%+var(--spacing-2)))]',
  'transition-[translate] duration-(--duration-normal) ease-out',
)

// Segments sit 2px inside the track, so the focus ring goes inside the segment
// rather than over the track's edge and its neighbours. Padded like a small
// Button, so the two line up side by side. They sit above the thumb, and an
// unchosen one takes a faint fill on hover.
const SEGMENT = cx(
  'relative inline-flex items-center justify-center gap-6 py-6 px-10 border-none rounded-xs cursor-pointer',
  'type-label-small whitespace-nowrap',
  'transition-[background,color] duration-(--duration-fast) ease-in-out',
  'focus-visible:outline-offset-(--focus-inset)',
  'bg-transparent text-tertiary hover:bg-fill-subtle hover:text-secondary',
  'data-checked:text-accent-text data-checked:hover:bg-transparent data-checked:hover:text-accent-text',
)

export type SegmentedOption<Value extends string> = {
  /** What choosing it sets. */
  value: Value
  /** Its words. */
  label: string
  /** A 15px icon before the words. */
  icon?: ReactNode
}

type SegmentedControlProps<Value extends string> = Omit<
  ComponentProps<'div'>,
  'children' | 'onChange' | 'defaultValue' | 'aria-label'
> & {
  /** The segments, in order: each a value, its label and an optional icon. */
  options: SegmentedOption<Value>[]
  /** The chosen option's value. */
  value: Value
  /** Called with the option the user picks. */
  onChange: (value: Value) => void
  /** Names the group, unless `aria-labelledby` points at text on screen that does. */
  label?: string
}

/**
 * A few mutually exclusive options side by side: a radio group with one Tab
 * stop, the arrow keys choosing the next or previous option.
 */
export function SegmentedControl<Value extends string>({
  options,
  value,
  onChange,
  label,
  className,
  style,
  ...props
}: SegmentedControlProps<Value>) {
  const index = options.findIndex((option) => option.value === value)
  const thumbPosition = { '--count': options.length, '--index': index } as CSSProperties
  return (
    <RadioGroup
      className={cn(TRACK, className)}
      style={{ ...thumbPosition, ...style }}
      value={value}
      onValueChange={(next) => onChange(next)}
      aria-label={label}
      // The element's own props go on the rendered div: Base UI merges them.
      render={<div {...props} />}
    >
      {index >= 0 && <span className={THUMB} aria-hidden data-keeps-transition />}
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
