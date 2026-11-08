import { use } from 'react'

import { CardContext, type CardContextValue } from '../context/card-context'

/** What the Card around it knows: its title's id, and whether it opens something. */
export function useCardContext(): CardContextValue {
  return use(CardContext)
}
