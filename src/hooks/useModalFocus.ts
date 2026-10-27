import { useEffect, useRef, useState, type RefObject } from 'react'
import { useLatestRef } from '@/hooks/useLatestRef'

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)]
}

/**
 * Focus handling for a modal dialog, so keyboard and screen-reader users stay
 * inside it:
 *
 *   - on open, focus moves into the dialog — unless a control there already
 *     took it (React's `autoFocus`) — to the first control, else the dialog;
 *   - Tab and Shift+Tab cycle within the dialog;
 *   - Escape calls `onClose`, unless `canClose` is false (e.g. mid-install);
 *   - on close, focus returns to whatever had it before the dialog opened.
 *
 * Attach the returned ref to the `role="dialog"` element; give it
 * `tabIndex={-1}` so it can take focus when it holds no controls.
 */
export function useModalFocus(onClose: () => void, canClose = true): RefObject<HTMLDivElement> {
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useLatestRef(onClose)
  const canCloseRef = useLatestRef(canClose)
  // Whatever had focus when the dialog first rendered: the control that opened
  // it. Read on the first render, before React's autoFocus moves focus inside.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null))

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!dialog.contains(document.activeElement)) (focusableIn(dialog)[0] ?? dialog).focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (canCloseRef.current) onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const controls = focusableIn(dialog)
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (!first || !last) {
        event.preventDefault()
        return
      }
      const isLeavingForward = !event.shiftKey && document.activeElement === last
      const isLeavingBackward = event.shiftKey && (document.activeElement === first || document.activeElement === dialog)
      if (isLeavingForward) {
        event.preventDefault()
        first.focus()
      } else if (isLeavingBackward) {
        event.preventDefault()
        last.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener?.isConnected) opener.focus()
    }
  }, [onCloseRef, canCloseRef, opener])

  return dialogRef
}
