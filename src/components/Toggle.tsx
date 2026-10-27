import { cva } from 'class-variance-authority'

const rootVariants = cva(
  [
    'relative shrink-0 w-[36px] h-20 rounded-full border',
    'transition-[background,border-color] duration-(--duration-fast) ease-in-out',
    'disabled:opacity-(--opacity-disabled) disabled:cursor-not-allowed',
  ],
  {
    variants: {
      isChecked: { true: 'bg-accent border-accent', false: 'bg-inset border-line' },
    },
  },
)

const knobVariants = cva(
  [
    'absolute top-1/2 left-2 size-14 rounded-full bg-on-fill',
    'transition-transform duration-(--duration-fast) ease-in-out',
  ],
  {
    variants: {
      isChecked: { true: 'translate-x-16 -translate-y-1/2', false: '-translate-y-1/2' },
    },
  },
)

interface ToggleProps {
  isChecked: boolean
  onChange: (isChecked: boolean) => void
  /** Accessible label — required since the switch renders no visible text. */
  label: string
  /** Id of the text that explains the setting, read after the label. */
  describedBy?: string
  isDisabled?: boolean
}

/** A compact on/off switch styled to match the app's accent + surface tokens. */
export function Toggle({ isChecked, onChange, label, describedBy, isDisabled }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={isDisabled}
      className={rootVariants({ isChecked })}
      onClick={() => onChange(!isChecked)}
    >
      <span className={knobVariants({ isChecked })} aria-hidden />
    </button>
  )
}
