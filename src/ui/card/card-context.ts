import { createContext } from 'react'

/** What a Card tells the CardHeader inside it. */
export type CardContextValue = {
  /** The id a CardHeader gives its title, so a `section` card is named by it. */
  titleId?: string
  /** The card opens something, so its CardHeader ends in a caret. */
  isOpenable: boolean
}

export const CardContext = createContext<CardContextValue>({ isOpenable: false })
