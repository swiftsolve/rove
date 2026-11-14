/**
 * The prompt behind `rove-ui pick`: a list of components that narrows as you
 * type, from @clack/prompts. It needs a person at a terminal, so the program
 * only calls it when stdin and stdout are one.
 */
import { autocomplete, isCancel } from '@clack/prompts'

import type { NamedComponent } from './catalog.ts'

/** The hint beside a component in the list: its group, and its family for a part. */
function componentHint(component: NamedComponent): string {
  if (component.partOf) {
    return `${component.libraryGroup}, part of ${component.partOf}`
  }
  return component.libraryGroup
}

/** Asks which component to show; null when the person cancels with Escape or Ctrl+C. */
export async function askForComponentName(components: NamedComponent[]): Promise<string | null> {
  const choice = await autocomplete({
    message: 'Which component?',
    placeholder: 'Type part of a name, like card',
    maxItems: 12,
    options: components.map((component) => ({ value: component.name, hint: componentHint(component) })),
  })
  if (isCancel(choice)) {
    return null
  }
  return choice
}
