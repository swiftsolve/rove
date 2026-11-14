import { use } from 'react'

import { type DialogState, DialogStateContext } from '../context/dialog-state-context'

/** The DialogRoot's state: whether the Dialog is open, and how to unmount it after its leave animation. */
export function useDialogState(): DialogState {
  return use(DialogStateContext)
}
