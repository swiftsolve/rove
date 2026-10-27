import { useState } from 'react'
import type { PendingUpdate } from '@/app/utils/updater'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import { BrandIcon, ArrowRightIcon, DownloadIcon } from '@/components/icons/Icons'
import { cx } from '@/lib/cx'
import styles from './UpdateDialog.module.css'

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
              <span className={styles.versionNew}>{update.version}</span>
            </p>
          </div>
        </div>

        {update.notes && (
          <div className={styles.body}>
            <p className={styles.notesLabel}>What&rsquo;s new</p>
            <div className={styles.notes}>{update.notes}</div>
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            onClick={onDismiss}
            disabled={isInstalling}
          >
            Later
          </button>
          <button
            type="button"
            className={cx(styles.button, styles.isPrimary, isInstalling && styles.isBusy)}
            onClick={handleInstall}
            disabled={isInstalling}
          >
            {isInstalling ? <ButtonSpinner size={14} color="#fff" /> : <DownloadIcon size={15} />}
            {isInstalling ? 'Installing…' : 'Install and restart'}
          </button>
        </div>
      </div>
    </div>
  )
}
