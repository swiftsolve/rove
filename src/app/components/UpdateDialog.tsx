import { useMutation } from '@tanstack/react-query'
import { cx } from 'class-variance-authority'

import { releaseNoteItems } from '@/app/utils/release-notes'
import type { PendingUpdate } from '@/app/utils/updater'
import { ArrowRightIcon, Button, Dialog, DownloadIcon } from '@/ui'

/**
 * The update prompt. Not window.confirm: native JS dialogs block the GTK loop
 * and freeze the webview on WebKitGTK. A failed install stays open with the error.
 */
export function UpdateDialog({ update, onDismiss }: { update: PendingUpdate; onDismiss: () => void }) {
  // install() ends in relaunch(), so it never resolves on success; only a
  // failure returns control here.
  const install = useMutation({
    mutationFn: () => update.install(),
    onError: (err) => console.warn('Update install failed:', err),
  })
  const isInstalling = install.isPending
  const hasFailed = install.isError

  return (
    <Dialog
      title="Update available"
      // The version diff: the current one dim, the new one in the accent.
      description={
        <p className="flex items-center gap-6 tabular-nums">
          <span className="text-tertiary">{update.currentVersion}</span>
          <ArrowRightIcon className="text-tertiary" />
          <span className="sr-only">{' to '}</span>
          <span className="font-semibold text-accent-text">{update.version}</span>
        </p>
      }
      onClose={onDismiss}
      canClose={!isInstalling}
      cancelLabel="Later"
      actions={
        <>
          <Button variant="solid" icon={DownloadIcon} onClick={() => install.mutate()} isLoading={isInstalling}>
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
            <p className="type-body-default inline-error last:mb-0" role="alert">
              Couldn’t install the update.
            </p>
          )}
          {update.notes && (
            <>
              <h3 className="type-overline text-tertiary mb-8">What&rsquo;s new</h3>
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
