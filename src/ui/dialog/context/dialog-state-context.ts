import { createContext } from 'react'

/** What a DialogRoot tells the Dialog inside it. */
export type DialogState = {
  /** False while the Dialog plays its leave animation. */
  isOpen: boolean
  /** The leave animation finished: unmount. */
  onExitComplete: () => void
}

export const DialogStateContext = createContext<DialogState>({ isOpen: true, onExitComplete: () => {} })
