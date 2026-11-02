import { Switch } from '@base-ui/react/switch'
import { cx } from 'class-variance-authority'

const TRACK = cx(
  'relative shrink-0 w-[36px] h-20 rounded-full border',
  'transition-[background,border-color] duration-(--duration-fast) ease-in-out',
  'bg-inset border-line data-checked:bg-accent data-checked:border-accent',
  'data-disabled:cursor-not-allowed data-disabled:opacity-(--opacity-disabled)',
)

const KNOB = cx(
  'absolute top-1/2 left-2 size-14 -translate-y-1/2 rounded-full bg-on-fill',
  'transition-transform duration-(--duration-fast) ease-in-out',
  'data-checked:translate-x-16',
)

type ToggleProps = {
  /** Whether it's on. */
  isChecked: boolean
  /** Called with the new state when the switch is flipped. */
  onChange: (isChecked: boolean) => void
  /** Names the switch, which shows no text of its own. */
  label: string
  /** Id of the text that explains the setting, read after the label. */
  'aria-describedby'?: string
  /** Drops input and dims the switch. */
  isDisabled?: boolean
}

/** An on/off switch for a setting. */
export function Toggle({ isChecked, onChange, label, isDisabled = false, ...ariaProps }: ToggleProps): JSX.Element {
  return (
    <Switch.Root
      checked={isChecked}
      onCheckedChange={(isNowChecked) => onChange(isNowChecked)}
      disabled={isDisabled}
      aria-label={label}
      nativeButton
      render={<button type="button" />}
      className={TRACK}
      {...ariaProps}
    >
      <Switch.Thumb className={KNOB} />
    </Switch.Root>
  )
}
