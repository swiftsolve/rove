import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cx } from '@/lib/cx'
import styles from './IconButton.module.css'

const iconButtonVariants = cva(styles.root, {
  variants: {
    tone: {
      /** No fill or colour of its own; the context styles it. */
      plain: null,
      /** Accent glyph, tinted on hover. */
      primary: styles.primary,
      /** Neutral inset chip: refresh, close, overflow menus. */
      secondary: styles.secondary,
      /** Red, for stopping something in progress. */
      stop: styles.stop,
    },
    /** In flight: full opacity (the spinner shows the wait) and no input. */
    isBusy: { true: styles.isBusy },
  },
  defaultVariants: { tone: 'secondary' },
})

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButtonVariants> & {
    /** Required: an icon-only button has no visible text to name it. */
    'aria-label': string
  }

/** A square, icon-only button. Extra props pass straight to the `<button>`. */
export function IconButton({
  tone,
  isBusy,
  className,
  type = 'button',
  ...buttonProps
}: IconButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cx(iconButtonVariants({ tone, isBusy }), className)}
      {...buttonProps}
    />
  )
}
