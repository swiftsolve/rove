import { createContext, useContext, useState, type ReactNode } from 'react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { cx } from 'class-variance-authority'
import { CloseIcon } from '../icons/Icons'
import { Button } from '../button/Button'
import { IconButton } from '../button/IconButton'
import { usePortalContainer } from '../hooks/usePortalContainer'
import { cn } from '../foundations/cn'

interface DialogState {
  /** False while the Dialog plays its leave animation. */
  isOpen: boolean
  /** The leave animation finished: unmount. */
  onExitComplete: () => void
}

const DialogStateContext = createContext<DialogState>({ isOpen: true, onExitComplete: () => {} })

interface DialogRootProps {
  /** Opens the Dialog; false plays its leave animation, then unmounts it. */
  isOpen: boolean
  /** The component that renders the Dialog: mounted while open and while it leaves. */
  children: ReactNode
}

/**
 * Opens and closes a Dialog. Its children mount when `isOpen` turns true and
 * stay mounted until the Dialog's leave animation ends after it turns false,
 * so the component that renders the Dialog (and its state) lives only that long.
 */
export function DialogRoot({ isOpen, children }: DialogRootProps): JSX.Element | null {
  const [isMounted, setIsMounted] = useState(isOpen)
  if (isOpen && !isMounted) setIsMounted(true)
  if (!isMounted) return null
  return (
    <DialogStateContext.Provider value={{ isOpen, onExitComplete: () => setIsMounted(false) }}>
      {children}
    </DialogStateContext.Provider>
  )
}

// Absolute (not fixed) in the PortalProvider's container, so the scrim covers
// and the dialog centres over that area (the app's content column), not the
// whole window. The two fade together, as one layer.
const LAYER = cx(
  'absolute inset-0 z-90',
  'data-open:animate-overlay-in data-closed:pointer-events-none data-closed:animate-overlay-out',
)

// No padding on the shell: the header, body and footer own their insets, and
// the shell clips the body's square corners to its radius. No lines between
// the sections; the body's darker well sets them apart.
const PANEL = cx(
  'w-full max-w-[340px] overflow-hidden rounded-lg border border-line bg-surface shadow-raised',
  'data-open:animate-dialog-in data-closed:animate-dialog-out',
)

const HEADER = 'flex items-start justify-between gap-8 p-16'

// Pulled toward the panel's corner without cramping the title.
const CLOSE = 'shrink-0 self-start -mt-4 -mr-4'

interface DialogProps {
  /** Names the dialog. */
  title: ReactNode
  /** The line under the title, read as the dialog's description. */
  description?: ReactNode
  /** The body, in a recessed well. Omit for a dialog that's only a header and actions. */
  children?: ReactNode
  /** The body well's layout and insets. */
  bodyClassName?: string
  /** A line under the body, on the panel: a caption or status. */
  footnote?: ReactNode
  /** The footer's buttons, main action last. */
  actions?: ReactNode
  /** Label for a button before the actions that closes the dialog. */
  cancelLabel?: string
  /** Escape, the close button, Cancel and a backdrop click: close it here. */
  onClose: () => void
  /** False while something runs that closing would abandon: every way out is off. */
  canClose?: boolean
  /** Holds input the user typed: a stray click on the backdrop won't throw it away. */
  isDirty?: boolean
}

/**
 * A modal dialog: title, optional description and close button, a recessed
 * body, an optional footnote, and a footer of actions. Focus moves in and
 * stays inside while it's open, the page behind is inert, and focus returns to
 * the opener on close.
 * Escape, the close button, Cancel and a click on the backdrop all call
 * `onClose`.
 *
 * Render it inside a DialogRoot, which opens it and plays its leave animation.
 */
export function Dialog({
  title,
  description,
  children,
  bodyClassName,
  footnote,
  actions,
  cancelLabel,
  onClose,
  canClose = true,
  isDirty = false,
}: DialogProps): JSX.Element {
  const { isOpen, onExitComplete } = useContext(DialogStateContext)
  const portalContainer = usePortalContainer()
  // Whatever had focus as the dialog mounted: the control that opened it, which
  // gets focus back on close. Base UI only knows its own Trigger part.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const isClosable = isOpen && canClose
  const hasFooter = actions != null || cancelLabel != null

  return (
    <BaseDialog.Root
      open={isOpen}
      onOpenChange={(isNowOpen) => {
        if (!isNowOpen && isClosable) onClose()
      }}
      onOpenChangeComplete={(isNowOpen) => {
        if (!isNowOpen) onExitComplete()
      }}
      disablePointerDismissal={isDirty || !isClosable}
    >
      {/* Base UI waits for a null container; with no provider, the body. */}
      <BaseDialog.Portal container={portalContainer ?? undefined}>
        <BaseDialog.Backdrop className={cn(LAYER, 'bg-scrim')} />
        <BaseDialog.Viewport className={cn(LAYER, 'flex items-center justify-center p-20')}>
          <BaseDialog.Popup className={PANEL} finalFocus={() => (opener?.isConnected ? opener : true)}>
            <div className={HEADER}>
              <div className="min-w-0">
                <BaseDialog.Title className="type-heading-medium text-primary">{title}</BaseDialog.Title>
                {description != null && (
                  <BaseDialog.Description render={<div />} className="mt-4 text-sm text-secondary">
                    {description}
                  </BaseDialog.Description>
                )}
              </div>
              <IconButton
                className={CLOSE}
                variant="ghost"
                label="Close"
                icon={CloseIcon}
                onClick={onClose}
                isDisabled={!isClosable}
              />
            </div>

            {children != null && <div className={cn('bg-base p-16', bodyClassName)}>{children}</div>}

            {footnote != null && <div className="px-16 py-12">{footnote}</div>}

            {hasFooter && (
              // With no body, the header's bottom inset already spaces the
              // actions; a full top inset too leaves a gap under the description.
              <div className={cn('flex justify-end gap-8 p-16', children == null && 'pt-4')}>
                {/* At the main action's size, so the two sit level. */}
                {cancelLabel != null && (
                  <Button size="md" onClick={onClose} isDisabled={!isClosable}>
                    {cancelLabel}
                  </Button>
                )}
                {actions}
              </div>
            )}
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
