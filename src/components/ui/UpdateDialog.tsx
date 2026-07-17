import { useState } from 'react'
import type { PendingUpdate } from '@/lib/updater'
import { ButtonSpinner } from '@/components/ui/ButtonSpinner'
import { BrandIcon, ArrowRightIcon, DownloadIcon } from '@/components/ui/Icons'
import './UpdateDialog.css'

/**
 * Non-blocking update prompt. Replaces window.confirm, which freezes the
 * webview on Linux/WebKitGTK because native JS dialogs block the GTK loop.
 *
 * Sectioned-shell layout to match the Wi-Fi share and Add service dialogs: a
 * header on the panel surface with the brand mark and a version-diff line, then
 * a recessed "What's new" well (only when the release ships notes).
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
        <div className="update-head">
          <div className="update-mark" aria-hidden>
            <BrandIcon size={20} />
          </div>
          <div className="update-heading">
            <h2 id="update-title" className="update-title">
              Update available
            </h2>
            <p className="update-versions">
              <span className="update-version-old">{update.currentVersion}</span>
              <ArrowRightIcon />
              <span className="update-version-new">{update.version}</span>
            </p>
          </div>
        </div>

        {update.notes && (
          <div className="update-body">
            <p className="update-notes-label">What&rsquo;s new</p>
            <div className="update-notes">{update.notes}</div>
          </div>
        )}

        <div className="update-actions">
          <button
            type="button"
            className="update-btn"
            onClick={onDismiss}
            disabled={installing}
          >
            Later
          </button>
          <button
            type="button"
            className={`update-btn is-primary${installing ? ' is-busy' : ''}`}
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? <ButtonSpinner size={14} color="#fff" /> : <DownloadIcon size={15} />}
            {installing ? 'Installing…' : 'Install and restart'}
          </button>
        </div>
      </div>
    </div>
  )
}
