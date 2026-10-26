import './Toggle.css'

interface ToggleProps {
  isChecked: boolean
  onChange: (isChecked: boolean) => void
  /** Accessible label — required since the switch renders no visible text. */
  label: string
  isDisabled?: boolean
}

/** A compact on/off switch styled to match the app's accent + surface tokens. */
export default function Toggle({ isChecked, onChange, label, isDisabled }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      aria-label={label}
      disabled={isDisabled}
      className={`toggle ${isChecked ? 'on' : ''}`}
      onClick={() => onChange(!isChecked)}
    >
      <span className="toggle-knob" aria-hidden />
    </button>
  )
}
