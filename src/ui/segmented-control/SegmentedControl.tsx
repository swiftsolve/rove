import type { CSSProperties, ReactNode } from 'react'
import { RadioGroup } from '@base-ui/react/radio-group'
import { Radio } from '@base-ui/react/radio'
import { cx } from 'class-variance-authority'

// An inset track, like the Toggle's, so the two read as a set. A grid of equal
// columns, so every segment is as wide as the widest and the thumb can slide
// between them by its own width. Plain `1fr`, not `auto-cols-fr`'s
// `minmax(0, 1fr)`, which collapses to nothing, and `w-max`, since a track
// shrunk to its min-content in a narrow parent lets the columns differ.
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
  'text-xs font-medium leading-label-small tracking-label-small whitespace-nowrap',
  'transition-[background,color] duration-(--duration-fast) ease-in-out',
  'focus-visible:outline-offset-(--focus-inset)',
  'bg-transparent text-tertiary hover:bg-fill-subtle hover:text-secondary',
  'data-checked:text-accent-text data-checked:hover:bg-transparent data-checked:hover:text-accent-text',
)

export interface SegmentedOption<Value extends string> {
  value: Value
  label: string
  icon?: ReactNode
}

type SegmentedControlProps<Value extends string> = {
  /** The segments, in order: each a value, its label and an optional icon. */
  options: SegmentedOption<Value>[]
  /** The chosen option's value. */
  value: Value
  /** Called with the option the user picks. */
  onChange: (value: Value) => void
  /** Names the group. */
  'aria-label'?: string
  /** Id of the text that names the group, in place of `aria-label`. */
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
}: SegmentedControlProps<Value>) {
  const index = options.findIndex((option) => option.value === value)
  const thumbPosition = { '--count': options.length, '--index': index } as CSSProperties
  return (
    <RadioGroup
      className={TRACK}
      style={thumbPosition}
      value={value}
      onValueChange={(next) => onChange(next as Value)}
      {...ariaProps}
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
