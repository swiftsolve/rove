import type { ReactNode } from 'react'

import { CardContext, type CardContextValue } from './card-context'

type CardProviderProps = {
  /** The card's title id, and whether it opens something. */
  value: CardContextValue
  children: ReactNode
}

/** Shares what a Card knows with the CardHeader inside it. */
export function CardProvider({ value, children }: CardProviderProps) {
  return <CardContext value={value}>{children}</CardContext>
}
