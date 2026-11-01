import { createContext, useContext, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cva } from 'class-variance-authority'
import { CloseIcon } from '../../icons/Icons'
import { Button } from '../button/Button'
import { IconButton } from '../button/IconButton'
import { useModalFocus } from './useModalFocus'
import { usePortalContainer } from '../../hooks/usePortalContainer'
import { usePresence } from '../../hooks/usePresence'
import { cn } from '../../foundations/cn'

// How long a closing dialog takes to leave (`--duration-fast`).
const EXIT_MS = 140

// False while the Dialog inside a DialogRoot plays its leave animation.
const DialogOpenContext = createContext(true)

interface DialogRootProps {
  isOpen: boolean
  /** The component that renders the Dialog: mounted while open and while it leaves. */
  children: ReactNode
}

/**
 * Opens and closes a Dialog. Its children mount when `isOpen` turns true and
 * stay mounted through the Dialog's leave animation after it turns false, so
 * the component that renders the Dialog (and its state) lives only that long.
 */
export function DialogRoot({ isOpen, children }: DialogRootProps): JSX.Element | null {
  const isMounted = usePresence(isOpen, EXIT_MS)
  if (!isMounted) return null
  return <DialogOpenContext.Provider value={isOpen}>{children}</DialogOpenContext.Provider>
}

// Absolute (not fixed) and portaled into the PortalProvider's container, so it
// covers and centres over that area (the app's content column) rather than the
// whole window.
const overlayVariants = cva('absolute inset-0 z-90 flex items-center justify-center bg-scrim p-20', {
  variants: {
    isLeaving: { true: 'pointer-events-none animate-overlay-out', false: 'animate-overlay-in' },
  },
})

// No padding on the shell: the header, body and footer own their insets, and
// the shell clips the body's square corners to its radius. No lines between
// the sections; the body's darker well sets them apart.
const panelVariants = cva(
  'w-full max-w-[340px] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-raised',
  {
    variants: {
      isLeaving: { true: 'animate-dialog-out', false: 'animate-dialog-in' },
    },
  },
)

const HEADER = 'flex items-start justify-between gap-8 p-16'

// Pulled toward the panel's corner without cramping the title.
const CLOSE = 'shrink-0 self-start -mt-4 -mr-4'

interface DialogProps {
  title: ReactNode
  /** The line under the title, read as the dialog's description. */
  description?: ReactNode
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
 * Render it inside a DialogRoot, which opens it and plays its leave animation.
 */
export function Dialog({
  title,
  description,
  children,
  bodyClassName,
  actions,
  cancelLabel,
  onClose,
  canClose = true,
  isDirty = false,
}: DialogProps): JSX.Element {
  const isOpen = useContext(DialogOpenContext)
  const portalContainer = usePortalContainer()
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
        <div className={HEADER}>
          <div className="min-w-0">
            <h2 id={titleId} className="text-heading-medium">
              {title}
            </h2>
            {description != null && (
              <div id={descriptionId} className="mt-4 text-sm text-secondary">
                {description}
              </div>
            )}
          </div>
          <IconButton
            variant="ghost"
            className={CLOSE}
            label="Close"
            icon={CloseIcon}
            onClick={onClose}
            isDisabled={!isClosable}
          />
        </div>

        {children != null && <div className={cn('bg-base p-16', bodyClassName)}>{children}</div>}

        {hasFooter && (
          <div className="flex justify-end gap-8 p-16">
            {/* At the main action's size, so the two sit level. */}
            {cancelLabel != null && (
              <Button size="md" onClick={onClose} isDisabled={!isClosable}>
                {cancelLabel}
              </Button>
            )}
            {actions}
          </div>
        )}
      </div>
    </div>
  )

  return portalContainer ? createPortal(overlay, portalContainer) : overlay
}
