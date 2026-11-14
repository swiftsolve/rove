/**
 * The prompt behind `rove-ui pick`: the Rove banner, then a list of components
 * that narrows as you type, from @clack/prompts. It needs a person at a
 * terminal, so the program only calls it when stdin and stdout are one.
 */
import { styleText } from 'node:util'

import { autocomplete, intro, isCancel, log, outro, select } from '@clack/prompts'

import type { NamedComponent } from '../catalog/catalog.ts'
import type { PickAction, PickActionId } from '../program.ts'
import { bannerText } from './banner.ts'

/** Colour depth `getColorDepth` reports for a 24-bit terminal. */
const TRUE_COLOR_DEPTH = 24

/** Columns a row spends before its label: the guide line, the radio dot and their gaps. */
const ROW_PREFIX_WIDTH = 6

/** A description's first sentence, on one line: "A text button." */
function firstSentence(description: string): string {
  const oneLine = description.replace(/\s*\n\s*/g, ' ').trim()
  const sentenceEnd = oneLine.indexOf('. ')
  return sentenceEnd === -1 ? oneLine : oneLine.slice(0, sentenceEnd + 1)
}

/** Text cut to a width, ending in an ellipsis when it was longer. */
function fitToWidth(text: string, width: number): string {
  if (text.length <= width) {
    return text
  }
  return `${text.slice(0, Math.max(0, width - 1)).trimEnd()}…`
}

/** Whether every letter typed appears in the name, in order: "crdhdr" finds CardHeader. */
function hasLettersInOrder(typedText: string, name: string): boolean {
  let nameIndex = 0
  for (const letter of typedText) {
    nameIndex = name.indexOf(letter, nameIndex)
    if (nameIndex === -1) {
      return false
    }
    nameIndex += 1
  }
  return true
}

/** Whether a component matches what was typed: its name loosely, or its group or first sentence. */
function isMatch(typedText: string, component: NamedComponent): boolean {
  const wantedText = typedText.toLowerCase().trim()
  if (hasLettersInOrder(wantedText.replaceAll(' ', ''), component.name.toLowerCase())) {
    return true
  }
  const searchedText = [component.libraryGroup, firstSentence(component.description)]
  return searchedText.some((text) => text.toLowerCase().includes(wantedText))
}

/** Asks which component to pick, after the banner the first time; null when the person cancels. */
export async function askForComponentName(components: NamedComponent[], isFirstPick: boolean): Promise<string | null> {
  if (isFirstPick) {
    const hasTrueColor = process.stdout.getColorDepth() >= TRUE_COLOR_DEPTH
    process.stdout.write(bannerText(hasTrueColor, process.stdout.columns))
  }
  const groupCount = new Set(components.map((component) => component.libraryGroup)).size
  intro(styleText('bold', `${components.length} components in ${groupCount} groups`))

  // Each row says what the component is in a column after its name, cut to the terminal's width.
  const nameWidth = Math.max(...components.map((component) => component.name.length)) + 2
  const descriptionWidth = process.stdout.columns - ROW_PREFIX_WIDTH - nameWidth
  const componentsByName = new Map(components.map((component) => [component.name, component]))
  const choice = await autocomplete({
    message: `Which one? ${styleText('gray', 'Esc quits')}`,
    maxItems: 12,
    options: components.map((component) => ({
      value: component.name,
      label: `${component.name.padEnd(nameWidth)}${styleText('gray', fitToWidth(firstSentence(component.description), descriptionWidth))}`,
    })),
    filter: (typedText, option) => {
      const component = componentsByName.get(option.value)
      return component !== undefined && isMatch(typedText, component)
    },
  })
  if (isCancel(choice)) {
    outro('Done.')
    return null
  }
  return choice
}

/** Asks what to do with the picked component; null when the person is done (Escape or Ctrl+C). */
export async function askForAction(componentName: string, actions: PickAction[]): Promise<PickActionId | null> {
  const actionId = await select({
    // The trailing line break leaves a blank guide line under the question, as the list prompt has.
    message: `${styleText('bold', componentName)}: what next? ${styleText('gray', 'Esc quits')}\n`,
    options: actions.map((action) => ({ value: action.id, label: action.label, hint: action.hint })),
  })
  if (isCancel(actionId)) {
    outro('Done.')
    return null
  }
  return actionId
}

/** Says what an action did, on the prompts' guide line. */
export function writeNote(text: string): void {
  log.success(text)
}
