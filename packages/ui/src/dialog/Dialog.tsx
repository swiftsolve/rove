import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { cx } from 'class-variance-authority'
import { type ReactNode, useState } from 'react'

import { Button } from '../button/Button'
import { IconButton } from '../button/IconButton'
import { useContentHeight } from '../hooks/useContentHeight'
import { usePortalContainer } from '../hooks/usePortalContainer'
import { CloseIcon } from '../icons/Icons'
import { cn } from '../utils/cn'
import { LAYER_DIALOG } from '../utils/layers'
import { useDialogState } from './hooks/useDialogState'

// Absolute (not fixed) in the PortalProvider's container, so the scrim covers
// and the dialog centres over that area (the app's content column), not the
// whole window. The two fade together, as one layer.
const LAYER = cx(
  'absolute inset-0',
  LAYER_DIALOG,
  'data-closed:pointer-events-none data-closed:animate-overlay-out data-open:animate-overlay-in',
)

// No padding on the shell: the header, body and footer own their insets, and
// the shell clips the body's square corners to its radius. No lines between
// the sections; the body's darker well sets them apart.
// It takes focus itself when no field does, and isn't a control: no ring.
const PANEL = cx(
  'w-full max-w-[340px] overflow-hidden rounded-lg border border-line bg-surface shadow-raised outline-none',
  'data-closed:animate-dialog-out data-open:animate-dialog-in',
)

// Clips the panel's contents while it springs to their height, so a body that
// swaps state (a spinner for a QR code) or a description that comes and goes
// resizes the panel instead of snapping.
const SIZER = 'overflow-hidden transition-[height] duration-(--duration-spring) ease-spring'

const HEADER = 'flex items-start justify-between gap-8 p-16'

// Pulled toward the panel's corner without cramping the title.
const CLOSE = 'shrink-0 self-start -mt-4 -mr-4'

/**
 * A field that took focus with `autoFocus` keeps it. Otherwise the panel takes
 * it, not its first button: that's the close button, whose tooltip would open
 * over the title and take the first Escape. Tab goes on to the close button.
 */
function initialFocusTarget(popup: HTMLElement | null): HTMLElement | true {
  const focusedElement = document.activeElement
  if (popup == null) return true
  return focusedElement instanceof HTMLElement && popup.contains(focusedElement) ? focusedElement : popup
}

type DialogProps = {
  /** Names the dialog. */
  title: ReactNode
  /** The line under the title, read as the dialog's description. */
  description?: ReactNode
  /** The body, in a recessed well. Omit for a dialog that's only a header and actions. */
  children?: ReactNode
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
 * the opener on close. Escape, the close button, Cancel and a click on the
 * backdrop all call `onClose`.
 *
 * Render it inside a DialogRoot, which opens it and plays its leave animation.
 */
export function Dialog({
  title,
  description,
  children,
  footnote,
  actions,
  cancelLabel,
  onClose,
  canClose = true,
  isDirty = false,
}: DialogProps) {
  const { isOpen, onExitComplete } = useDialogState()
  const portalContainer = usePortalContainer()
  // Whatever had focus as the dialog mounted: the control that opened it, which
  // gets focus back on close. Base UI only knows its own Trigger part.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  const [popup, setPopup] = useState<HTMLDivElement | null>(null)
  const [content, setContent] = useState<HTMLDivElement | null>(null)
  const contentHeight = useContentHeight(content)
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
      {/* Base UI waits while the container is null; undefined means the body. */}
      <BaseDialog.Portal container={portalContainer ?? undefined}>
        <BaseDialog.Backdrop className={cn(LAYER, 'bg-scrim')} />
        <BaseDialog.Viewport className={cn(LAYER, 'flex items-center justify-center p-20')}>
          <BaseDialog.Popup
            ref={setPopup}
            className={PANEL}
            initialFocus={() => initialFocusTarget(popup)}
            finalFocus={() => (opener?.isConnected ? opener : true)}
          >
            <div className={SIZER} style={{ height: contentHeight ?? undefined }}>
              <div ref={setContent}>
                <div className={HEADER}>
                  <div className="min-w-0">
                    <BaseDialog.Title className="type-title text-primary">{title}</BaseDialog.Title>
                    {description != null && (
                      <BaseDialog.Description
                        render={<div />}
                        className="type-body mt-4 animate-fade-in text-secondary"
                      >
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

                {children != null && <div className="bg-base p-16">{children}</div>}

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
              </div>
            </div>
          </BaseDialog.Popup>
        </BaseDialog.Viewport>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  )
}
