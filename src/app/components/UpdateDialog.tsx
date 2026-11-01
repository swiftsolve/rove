import { useState } from 'react'
import { cx } from 'class-variance-authority'
import type { PendingUpdate } from '@/app/utils/updater'
import { releaseNoteItems } from '@/app/utils/release-notes'
import { ArrowRightIcon, DownloadIcon } from '@/components/icons/Icons'
import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'

/**
 * Non-blocking update prompt. Replaces window.confirm, which freezes the
 * webview on Linux/WebKitGTK because native JS dialogs block the GTK loop.
 *
 * The header carries a version-diff line; a recessed
 * "What's new" well follows when the release ships notes. A failed install
 * stays open with the error, to try again or leave for later.
 */
export function UpdateDialog({
  isOpen,
  update,
  onDismiss,
}: {
  /** False while the dialog leaves (see `Dialog`). */
  isOpen: boolean
  update: PendingUpdate
  onDismiss: () => void
}): JSX.Element {
  const [isInstalling, setIsInstalling] = useState(false)
  const [hasFailed, setHasFailed] = useState(false)

  const handleInstall = (): void => {
    setIsInstalling(true)
    setHasFailed(false)
    // install() ends in relaunch(), so this promise never resolves on success;
    // only a failure returns control here.
    update.install().catch((err) => {
      console.warn('Update install failed:', err)
      setIsInstalling(false)
      setHasFailed(true)
    })
  }

  return (
    <Dialog
      isOpen={isOpen}
      title="Update available"
      // The version diff: the current one dim, the new one in the accent.
      description={
        <p className="flex items-center gap-6 tabular-nums">
          <span className="text-tertiary">{update.currentVersion}</span>
          <ArrowRightIcon className="text-tertiary" />
          <span className="sr-only">{' to '}</span>
          <span className="font-semibold text-accent">{update.version}</span>
        </p>
      }
      onClose={onDismiss}
      canClose={!isInstalling}
      cancelLabel="Later"
      actions={
        <>
          <Button variant="filled" icon={DownloadIcon} onClick={handleInstall} isLoading={isInstalling}>
            {isInstalling ? 'Installing…' : hasFailed ? 'Try again' : 'Install and restart'}
          </Button>
          {/* In the footer, not the body, so a release without notes gets no empty well. */}
          <p className="sr-only" role="status">
            {isInstalling ? 'Installing the update. Rove will restart when it’s done.' : ''}
          </p>
        </>
      }
    >
      {hasFailed || update.notes ? (
        <>
          {hasFailed && (
            <p className="inline-error last:mb-0" role="alert">
              Couldn’t install the update.
            </p>
          )}
          {update.notes && (
            <>
              <h3 className="text-overline mb-8">What&rsquo;s new</h3>
              <ul
                className={cx(
                  'max-h-[168px] list-disc overflow-y-auto py-10 pr-12 pl-[26px]',
                  'rounded-sm border border-line bg-inset',
                  'text-md leading-body-default text-secondary marker:text-tertiary',
                )}
              >
                {releaseNoteItems(update.notes).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : null}
    </Dialog>
  )
}
