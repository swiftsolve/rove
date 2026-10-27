import { useState } from 'react'
import { cva, cx } from 'class-variance-authority'
import type { PendingUpdate } from '@/app/utils/updater'
import { ButtonSpinner } from '@/components/ButtonSpinner'
import { BrandIcon, ArrowRightIcon, DownloadIcon } from '@/components/icons/Icons'
import { useModalFocus } from '@/hooks/useModalFocus'
import styles from './UpdateDialog.module.css'

// Dialog action buttons, mirroring the Add service dialog's so the two read as
// one control set: a bordered secondary and a filled-accent primary.
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-6 min-w-[76px] px-(--section-padding) py-10',
    'rounded-sm border text-sm font-semibold tracking-[0.01em]',
    'transition-[background,color] duration-(--duration-fast) ease-in-out',
    'not-disabled:active:transform-[translateY(0.5px)]',
  ],
  {
    variants: {
      /** Accent fill: Install and restart. */
      isPrimary: {
        true: 'text-on-fill bg-accent-fill border-transparent not-disabled:hover:bg-accent-fill-hover',
        false: cx(
          'text-(--text-secondary) bg-raised border-line',
          'not-disabled:hover:bg-hover not-disabled:hover:text-primary',
        ),
      },
      /** Installing: full opacity (the spinner shows the wait) while ignoring input. */
      isBusy: {
        true: 'pointer-events-none cursor-default',
        false: 'disabled:opacity-(--opacity-disabled) disabled:cursor-not-allowed',
      },
    },
    defaultVariants: { isPrimary: false, isBusy: false },
  },
)

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
    <div
      className={cx(
        styles.overlay,
        'fixed inset-[0] z-100 flex items-center justify-center p-20 bg-scrim',
      )}
      role="presentation"
      onClick={isInstalling ? undefined : onDismiss}
    >
      {/* Sectioned shell, like the Wi-Fi share and Add service dialogs: the
          header, notes and actions own their insets, and the shell clips the
          recessed well's square corners to its radius. */}
      <div
        className={cx(
          styles.dialog,
          'w-full max-w-[360px] overflow-hidden',
          'bg-panel border border-line-strong rounded-lg shadow-raised',
        )}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-12 p-16">
          {/* An accent-tinted tile holding the Rove mark: the dialog's visual anchor. */}
          <div
            className={cx(
              'flex items-center justify-center shrink-0 size-[40px] rounded-sm',
              'text-accent bg-accent-muted border border-line',
            )}
            aria-hidden
          >
            <BrandIcon size={20} />
          </div>
          <div className="min-w-[0]">
            <h2
              id="update-title"
              className="text-xl font-semibold tracking-[-0.01em] text-primary"
            >
              Update available
            </h2>
            {/* The version diff: the current one dim, the new one in the accent. */}
            <p className="flex items-center gap-6 mt-[3px] text-sm tabular-nums">
              <span className="text-tertiary">{update.currentVersion}</span>
              <ArrowRightIcon className="text-tertiary" />
              <span className="sr-only">{' to '}</span>
              <span className="text-accent font-semibold">{update.version}</span>
            </p>
          </div>
        </div>

        {/* A recessed well framing the notes, a step below the header. Only when
            the release ships notes. */}
        {update.notes && (
          <div className="p-16 bg-chrome border-t border-line">
            <h3 className="mb-8 text-2xs font-semibold tracking-[0.06em] uppercase text-tertiary">
              What&rsquo;s new
            </h3>
            <div
              className={cx(
                'max-h-[168px] overflow-y-auto px-12 py-10',
                'bg-inset border border-line rounded-sm',
                'text-md leading-[1.5] text-(--text-secondary) whitespace-pre-wrap',
              )}
            >
              {update.notes}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-8 p-16">
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
