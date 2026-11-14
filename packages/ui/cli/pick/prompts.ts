/**
 * The prompts behind `rove-ui pick`: the Rove banner, a list of components that
 * narrows as you type, then a menu of what to do with the one picked. The keys
 * and focus come from @clack/core; frames.ts draws them in Rove's colours. They
 * need a person at a terminal, so the program only calls them when stdin and
 * stdout are one.
 */
import { AutocompletePrompt, isCancel, SelectPrompt } from '@clack/core'

import type { NamedComponent } from '../catalog/catalog.ts'
import type { PickAction, PickActionId } from '../program.ts'
import { isLightTerminal } from '../theme.ts'
import { bannerText } from './banner.ts'
import { introText, listFrame, menuFrame, noteText, outroText } from './frames.ts'
import { rankComponents } from './match.ts'

/** Colour depth `getColorDepth` reports for a 24-bit terminal. */
const TRUE_COLOR_DEPTH = 24

/**
 * Joins the typed text to a name in an option's value. @clack/core keeps focus
 * on the option it was on when the list changes, which would leave a weaker
 * match focused above the best one. A value that changes with every keystroke
 * is never in the new list, so focus starts at the top, the best match.
 */
const TYPED_TEXT_SEPARATOR = '\u001f'

/** One row of the component list, as @clack/core holds it. */
type ComponentOption = { value: string; component: NamedComponent }

/** The component name a list option's value holds. */
function nameFromValue(value: string): string {
  return value.split(TYPED_TEXT_SEPARATOR).at(-1) ?? value
}

/** Asks which component to pick, after the banner the first time; null when the person quits. */
export async function askForComponentName(components: NamedComponent[], isFirstPick: boolean): Promise<string | null> {
  if (isFirstPick) {
    const hasTrueColor = process.stdout.getColorDepth() >= TRUE_COLOR_DEPTH
    const isLight = isLightTerminal(process.env.COLORFGBG)
    process.stdout.write(bannerText(hasTrueColor, process.stdout.columns, isLight))
  }
  const groupCount = new Set(components.map((component) => component.libraryGroup)).size
  process.stdout.write(introText(`${components.length} components in ${groupCount} groups`))

  const prompt = new AutocompletePrompt<ComponentOption>({
    options() {
      const typedText = this.userInput
      return rankComponents(components, typedText).map((component) => ({
        value: `${typedText}${TYPED_TEXT_SEPARATOR}${component.name}`,
        component,
      }))
    },
    render() {
      return listFrame({
        state: this.state,
        question: 'Which one?',
        typedTextWithCursor: this.userInputWithCursor,
        components: this.filteredOptions.map((option) => option.component),
        cursor: this.cursor,
        focusedName: this.focusedValue === undefined ? undefined : nameFromValue(this.focusedValue),
        columns: process.stdout.columns,
        rows: process.stdout.rows,
      })
    },
  })
  const choice = await prompt.prompt()
  if (isCancel(choice) || choice === undefined) {
    process.stdout.write(outroText('Done.'))
    return null
  }
  // A single-choice autocomplete answers with one value; the array form is for multiple.
  const value = Array.isArray(choice) ? choice[0] : choice
  return value === undefined ? null : nameFromValue(value)
}

/** Asks what to do with the picked component; null when the person quits (Escape or Ctrl+C). */
export async function askForAction(componentName: string, actions: PickAction[]): Promise<PickActionId | null> {
  const prompt = new SelectPrompt<PickAction & { value: PickActionId }>({
    options: actions.map((action) => ({ ...action, value: action.id })),
    render() {
      return menuFrame({ state: this.state, question: `${componentName}: what next?`, actions, cursor: this.cursor })
    },
  })
  const actionId = await prompt.prompt()
  if (isCancel(actionId) || actionId === undefined) {
    process.stdout.write(outroText('Done.'))
    return null
  }
  return actionId
}

/** Says what an action did, on the prompts' guide line. */
export function writeNote(text: string): void {
  process.stdout.write(noteText(text))
}
