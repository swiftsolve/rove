/** A step through the app's history: back to the last screen, or forward again. */
export type HistoryStep = 'back' | 'forward'

/** The parts of a keydown that pick a history step. */
export type ShortcutKey = Pick<KeyboardEvent, 'key' | 'altKey' | 'metaKey' | 'ctrlKey' | 'shiftKey'>

/** Where the key was pressed. */
export type ShortcutContext = {
  isMac: boolean
  /** Focus is in a text field, where the arrows move the caret instead. */
  isEditing: boolean
}

const ARROWS: Record<string, HistoryStep> = { ArrowLeft: 'back', ArrowRight: 'forward' }
const BRACKETS: Record<string, HistoryStep> = { '[': 'back', ']': 'forward' }

/**
 * The history step a key press asks for, by the platform's own shortcuts:
 * ⌘[ ⌘] ⌘← ⌘→ on macOS, Alt+← Alt+→ elsewhere, and a keyboard's Back and
 * Forward keys anywhere. A browser maps these itself, but Tauri's webviews
 * don't, so the desktop app does.
 */
export function historyStepForKey(press: ShortcutKey, { isMac, isEditing }: ShortcutContext): HistoryStep | null {
  if (press.key === 'BrowserBack') return 'back'
  if (press.key === 'BrowserForward') return 'forward'
  if (press.shiftKey || press.ctrlKey) return null
  if (isMac) {
    if (!press.metaKey || press.altKey) return null
    const bracketStep = BRACKETS[press.key]
    if (bracketStep) return bracketStep
    if (isEditing) return null
    return ARROWS[press.key] ?? null
  }
  if (!press.altKey || press.metaKey || isEditing) return null
  return ARROWS[press.key] ?? null
}

/** The history step a mouse's thumb buttons ask for: 3 is back, 4 forward. */
export function historyStepForButton(button: number): HistoryStep | null {
  if (button === 3) return 'back'
  if (button === 4) return 'forward'
  return null
}
