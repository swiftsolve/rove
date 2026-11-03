import { Switch } from '@base-ui/react/switch'
import { cx } from 'class-variance-authority'
import type { ComponentProps } from 'react'

import { cn } from '../utils/cn'
import { STATE_CLASSES } from '../utils/pressable'

const TRACK = cx(
  'relative shrink-0 w-[36px] h-20 rounded-full border',
  'transition-[background,border-color] duration-(--duration-fast) ease-in-out',
  'bg-inset border-line data-checked:bg-accent data-checked:border-accent',
  STATE_CLASSES,
)

const KNOB = cx(
  'absolute top-1/2 left-2 size-14 -translate-y-1/2 rounded-full bg-on-fill',
  'transition-transform duration-(--duration-fast) ease-in-out',
  'data-checked:translate-x-16',
)

type ToggleProps = Omit<ComponentProps<'button'>, 'onChange' | 'children' | 'disabled' | 'type' | 'value'> & {
  /** Whether it's on. */
  isChecked: boolean
  /** Called with the new state when the switch is flipped. */
  onChange: (isChecked: boolean) => void
  /** Names the switch, which shows no text of its own. */
  label: string
  /** Drops input and dims the switch. It stays focusable, like a disabled Button, so a tooltip can say why. */
  isDisabled?: boolean
}

/** An on/off switch for a setting. */
export function Toggle({ isChecked, onChange, label, isDisabled = false, className, ...props }: ToggleProps) {
  return (
    <Switch.Root
      checked={isChecked}
      onCheckedChange={(isNowChecked) => onChange(isNowChecked)}
      // Read-only, not disabled: Base UI's disabled sets the native attribute,
      // which drops the switch out of the Tab order.
      readOnly={isDisabled}
      aria-disabled={isDisabled || undefined}
      data-disabled={isDisabled ? '' : undefined}
      aria-label={label}
      nativeButton
      // The element's own props go on the rendered button: Base UI merges them,
      // and its Root types only some of them.
      render={<button type="button" {...props} />}
      className={cn(TRACK, className)}
    >
      <Switch.Thumb className={KNOB} />
    </Switch.Root>
  )
}
