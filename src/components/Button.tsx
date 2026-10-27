import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cx } from '@/lib/cx'
import styles from './Button.module.css'

const buttonVariants = cva(undefined, {
  variants: {
    variant: {
      /** Quiet accent text: secondary actions and links in a header. */
      primary: styles.primary,
      /** Solid accent fill: a page's main action (Run test, Add service). */
      filled: [styles.primary, styles.filled],
      /** Neutral inset: retries and other in-place actions. */
      secondary: styles.secondary,
    },
    /** The filled button while a test runs: red, for Stop. */
    isStop: { true: styles.isStop },
    /** In flight: full opacity (the spinner shows the wait) and no input. */
    isBusy: { true: styles.isBusy },
  },
  defaultVariants: { variant: 'secondary' },
})

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

/** A text button. Extra props (aria-*, handlers from a Tooltip) pass straight to the `<button>`. */
export function Button({
  variant,
  isStop,
  isBusy,
  className,
  type = 'button',
  ...buttonProps
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cx(buttonVariants({ variant, isStop, isBusy }), className)}
      {...buttonProps}
    />
  )
}
