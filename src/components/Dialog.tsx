import { useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cva } from 'class-variance-authority'
import { CloseIcon } from '@/components/icons/Icons'
import { Button } from '@/components/Button'
import { IconButton } from '@/components/IconButton'
import { useModalFocus } from '@/hooks/useModalFocus'
import { cn } from '@/lib/cn'

/**
 * How long a closing dialog takes to leave (`--duration-fast`). Keep it
 * mounted this long after `isOpen` turns false: `usePresence(isOpen, DIALOG_EXIT_MS)`.
 */
export const DIALOG_EXIT_MS = 140

// Absolute (not fixed) and portaled into the content column
// ([data-modal-root]), so it covers and centres over the page area rather than
// the whole window: the nav rail stays uncovered.
const overlayVariants = cva('absolute inset-0 z-90 flex items-center justify-center bg-scrim p-20', {
  variants: {
    isLeaving: { true: 'pointer-events-none animate-overlay-out', false: 'animate-overlay-in' },
  },
})

// No padding on the shell: the header, body and footer own their insets, and
// the shell clips the body's square corners to its radius. No lines between
// the sections; the body's darker well sets them apart.
const panelVariants = cva(
  'w-full max-w-[340px] overflow-hidden rounded-lg border border-line-strong bg-panel shadow-raised',
  {
    variants: {
      isLeaving: { true: 'animate-dialog-out', false: 'animate-dialog-in' },
    },
  },
)

const headerVariants = cva('flex justify-between gap-8 p-16', {
  variants: {
    /** A leading tile centres beside the title block; text alone hangs from the top. */
    hasIcon: { true: 'items-center', false: 'items-start' },
  },
})

// Pulled toward the panel's corner without cramping the title, with no fill of
// its own until hovered.
const CLOSE = cn(
  'shrink-0 self-start -mt-4 -mr-4 text-secondary',
  'not-disabled:not-aria-disabled:hover:bg-hover not-disabled:not-aria-disabled:hover:text-primary',
)

// The secondary button at the filled one's size, so the two sit level.
const CANCEL = 'px-(--section-padding) py-10 text-sm font-semibold tracking-button-large'

interface DialogProps {
  /** False while the dialog plays its leave animation, before it unmounts. */
  isOpen: boolean
  title: ReactNode
  /** The line under the title, read as the dialog's description. */
  description?: ReactNode
  /** A tile before the title. */
  icon?: ReactNode
  /** The body, in a recessed well. Omit for a dialog that's only a header and actions. */
  children?: ReactNode
  bodyClassName?: string
  /** The footer's buttons, main action last. */
  actions?: ReactNode
  /** Label for a button before the actions that closes the dialog. */
  cancelLabel?: string
  onClose: () => void
  /** False while something runs that closing would abandon: every way out is off. */
  canClose?: boolean
  /** Holds input the user typed: a stray click on the backdrop won't throw it away. */
  isDirty?: boolean
}

/**
 * A modal dialog: title, optional description and close button, a recessed
 * body, and a footer of actions. Focus stays inside while it's open; Escape,
 * the close button, Cancel and a click on the backdrop all call `onClose`.
 *
 * It animates in on mount. To animate out, keep it mounted with
 * `usePresence(isOpen, DIALOG_EXIT_MS)` and pass `isOpen` false while it leaves.
 */
export function Dialog({
  isOpen,
  title,
  description,
  icon,
  children,
  bodyClassName,
  actions,
  cancelLabel,
  onClose,
  canClose = true,
  isDirty = false,
}: DialogProps): JSX.Element {
  const isClosable = isOpen && canClose
  const dialogRef = useModalFocus(onClose, isClosable)
  const titleId = useId()
  const descriptionId = useId()
  const hasFooter = actions != null || cancelLabel != null

  const overlay = (
    <div
      className={overlayVariants({ isLeaving: !isOpen })}
      role="presentation"
      onClick={isClosable && !isDirty ? onClose : undefined}
    >
      <div
        className={panelVariants({ isLeaving: !isOpen })}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description != null ? descriptionId : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={headerVariants({ hasIcon: icon != null })}>
          <div className="flex min-w-0 items-center gap-12">
            {icon}
            <div className="min-w-0">
              <h2 id={titleId} className="text-dialog-title">
                {title}
              </h2>
              {description != null && (
                <div id={descriptionId} className="mt-4 text-sm text-secondary">
                  {description}
                </div>
              )}
            </div>
          </div>
          <IconButton tone="plain" className={CLOSE} onClick={onClose} disabled={!isClosable} aria-label="Close">
            <CloseIcon size={15} />
          </IconButton>
        </div>

        {children != null && <div className={cn('bg-chrome p-16', bodyClassName)}>{children}</div>}

        {hasFooter && (
          <div className="flex justify-end gap-8 p-16">
            {cancelLabel != null && (
              <Button variant="secondary" className={CANCEL} onClick={onClose} disabled={!isClosable}>
                {cancelLabel}
              </Button>
            )}
            {actions}
          </div>
        )}
      </div>
    </div>
  )

  // Fall back to rendering in place if the content column isn't in the DOM.
  const portalTarget = typeof document !== 'undefined' ? document.querySelector('[data-modal-root]') : null
  return portalTarget ? createPortal(overlay, portalTarget) : overlay
}
