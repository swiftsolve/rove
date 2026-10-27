import { useState } from 'react'
import { cva } from 'class-variance-authority'
import type { PendingUpdate } from '@/app/utils/updater'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import { BrandIcon, ArrowRightIcon, DownloadIcon } from '@/components/icons/Icons'
import { useModalFocus } from '@/hooks/useModalFocus'
import styles from './UpdateDialog.module.css'

const buttonVariants = cva(styles.button, {
  variants: {
    /** Accent fill: Install and restart. */
    isPrimary: { true: styles.isPrimary },
    /** Installing: the spinner shows the wait. */
    isBusy: { true: styles.isBusy },
  },
})

/**
 * Non-blocking update prompt. Replaces window.confirm, which freezes the
 * webview on Linux/WebKitGTK because native JS dialogs block the GTK loop.
 *
 * Sectioned-shell layout to match the Wi-Fi share and Add service dialogs: a
 * header on the panel surface with the brand mark and a version-diff line, then
 * a recessed "What's new" well (only when the release ships notes).
 */
export function UpdateDialog({
  update,
  onDismiss,
}: {
  update: PendingUpdate
  onDismiss: () => void
}): JSX.Element {
  const [isInstalling, setIsInstalling] = useState(false)
  // Focus stays in the dialog while it's open; Escape dismisses it (not mid-install).
  const dialogRef = useModalFocus(onDismiss, !isInstalling)

  const handleInstall = (): void => {
    setIsInstalling(true)
    // install() ends in relaunch(), so this promise never resolves on success;
    // only a failure returns control here, in which case we surface it and
    // let the user dismiss.
    update.install().catch((err) => {
      console.warn('Update install failed:', err)
      setIsInstalling(false)
      onDismiss()
    })
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={isInstalling ? undefined : onDismiss}>
      <div
        className={styles.dialog}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <div className={styles.mark} aria-hidden>
            <BrandIcon size={20} />
          </div>
          <div className={styles.heading}>
            <h2 id="update-title" className={styles.title}>
              Update available
            </h2>
            <p className={styles.versions}>
              <span className={styles.versionOld}>{update.currentVersion}</span>
              <ArrowRightIcon />
              <span className="sr-only">{' to '}</span>
              <span className={styles.versionNew}>{update.version}</span>
            </p>
          </div>
        </div>

        {update.notes && (
          <div className={styles.body}>
            <h3 className={styles.notesLabel}>What&rsquo;s new</h3>
            <div className={styles.notes}>{update.notes}</div>
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={buttonVariants()}
            onClick={onDismiss}
            disabled={isInstalling}
          >
            Later
          </button>
          <button
            type="button"
            className={buttonVariants({ isPrimary: true, isBusy: isInstalling })}
            onClick={handleInstall}
            disabled={isInstalling}
          >
            {isInstalling ? <ButtonSpinner size={14} color="#fff" /> : <DownloadIcon size={15} />}
            {isInstalling ? 'Installing…' : 'Install and restart'}
          </button>
        </div>
        <p className="sr-only" role="status">
          {isInstalling ? 'Installing the update. Rove will restart when it’s done.' : ''}
        </p>
      </div>
    </div>
  )
}
