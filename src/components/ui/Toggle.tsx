import './Toggle.css'

interface ToggleProps {
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
  /** Accessible label — required since the switch renders no visible text. */
  readonly label: string
  readonly disabled?: boolean
}

/** A compact on/off switch styled to match the app's accent + surface tokens. */
export default function Toggle({ checked, onChange, label, disabled }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob" aria-hidden />
    </button>
  )
}
