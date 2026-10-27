import { cva } from 'class-variance-authority'
import styles from './Toggle.module.css'

const rootVariants = cva(styles.root, {
  variants: {
    isChecked: { true: styles.isOn },
  },
})

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
      <span className={styles.knob} aria-hidden />
    </button>
  )
}
