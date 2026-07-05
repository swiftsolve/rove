import { useState } from 'react'
import type { PendingUpdate } from '@/lib/updater'
import './UpdateDialog.css'

/**
 * Non-blocking update prompt. Replaces window.confirm, which freezes the
 * webview on Linux/WebKitGTK because native JS dialogs block the GTK loop.
 */
export default function UpdateDialog({
  update,
  onDismiss,
}: {
  readonly update: PendingUpdate
  readonly onDismiss: () => void
}): JSX.Element {
  const [installing, setInstalling] = useState(false)

  const handleInstall = (): void => {
    setInstalling(true)
    // install() ends in relaunch(), so this promise never resolves on success;
    // only a failure returns control here, in which case we surface it and
    // let the user dismiss.
    update.install().catch((err) => {
      console.warn('Update install failed:', err)
      setInstalling(false)
      onDismiss()
    })
  }

  return (
    <div className="update-overlay" role="presentation" onClick={installing ? undefined : onDismiss}>
      <div
        className="update-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="update-title" className="update-title">
          Update available
        </h2>
        <p className="update-sub">
          Beacon {update.version} is ready to install. You have {update.currentVersion}.
        </p>
        {update.notes && <div className="update-notes">{update.notes}</div>}
        <div className="update-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onDismiss}
            disabled={installing}
          >
            Later
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing && <span className="btn-spinner" aria-hidden />}
            {installing ? 'Installing…' : 'Install and restart'}
          </button>
        </div>
      </div>
    </div>
  )
}
