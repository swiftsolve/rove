import { cva } from 'class-variance-authority'
import { BrandIcon, CloseIcon, MinimizeIcon } from '@/components/icons/Icons'
import { useAppData } from '@/app/hooks/useAppData'
import { cx } from '@/lib/cx'
import styles from './StatusBar.module.css'

const linkVariants = cva(['text-meta-strong', styles.link], {
  variants: {
    tone: {
      on: styles.isOn,
      bad: styles.isBad,
      /** Connecting or offline: the base look. */
      off: null,
    },
  },
})

// Kept out of the Tab order, like a native title bar: otherwise the first Tab
// lands on Minimize/Close at the top-right instead of the nav rail, and a stray
// Enter closes the window.
function WindowControls(): JSX.Element {
  const controls = window.windowControls
  if (!controls) return <></>

  return (
    <div className={styles.windowControls}>
      <button
        type="button"
        className={styles.windowButton}
        onClick={() => controls.minimize()}
        aria-label="Minimize"
        tabIndex={-1}
      >
        <MinimizeIcon size={15} />
      </button>
      <button
        type="button"
        className={cx(styles.windowButton, styles.closeButton)}
        onClick={() => controls.close()}
        aria-label="Close"
        tabIndex={-1}
      >
        <CloseIcon size={15} />
      </button>
    </div>
  )
}

/** The full-width title bar: brand, connection status and window controls. */
export function StatusBar(): JSX.Element {
  const { tone, label } = useAppData().connection
  return (
    <header className={styles.bar} data-tauri-drag-region>
      <div className={styles.left}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden>
            <BrandIcon size={22} />
          </span>
          <span className={styles.brandName}>Rove</span>
        </div>
        <span className={linkVariants({ tone })}>
          <span className={styles.dot} aria-hidden />
          {label}
        </span>
      </div>
      <WindowControls />
    </header>
  )
}
