import { Collapsible as BaseCollapsible } from '@base-ui/react/collapsible'
import type { ComponentProps } from 'react'

/**
 * The button that opens and closes the panel; it says which (aria-expanded)
 * and what it controls. `data-panel-open` is set while open, for styling.
 */
export function CollapsibleTrigger(props: ComponentProps<'button'>) {
  return <BaseCollapsible.Trigger data-collapsible-trigger="" {...props} />
}
