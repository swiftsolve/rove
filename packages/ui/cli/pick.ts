/**
 * The prompt behind `rove-ui pick`: the Rove banner, then a list of components
 * that narrows as you type, from @clack/prompts. It needs a person at a
 * terminal, so the program only calls it when stdin and stdout are one.
 */
import { styleText } from 'node:util'

import { autocomplete, cancel, intro, isCancel, outro } from '@clack/prompts'

import { bannerText } from './banner.ts'
import type { NamedComponent } from './catalog.ts'

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

/** Whether a component matches what was typed, by its name, group or first sentence. */
function isMatch(typedText: string, component: NamedComponent): boolean {
  const wantedText = typedText.toLowerCase()
  const searchedText = [component.name, component.libraryGroup, firstSentence(component.description)]
  return searchedText.some((text) => text.toLowerCase().includes(wantedText))
}

/** Asks which component to show; null when the person cancels with Escape or Ctrl+C. */
export async function askForComponentName(components: NamedComponent[]): Promise<string | null> {
  const hasTrueColor = process.stdout.getColorDepth() >= TRUE_COLOR_DEPTH
  process.stdout.write(bannerText(hasTrueColor))
  intro(styleText(['bgBlue', 'white', 'bold'], ' rove-ui pick '))

  // Each row says what the component is in a column after its name, cut to the terminal's width.
  const nameWidth = Math.max(...components.map((component) => component.name.length)) + 2
  const descriptionWidth = process.stdout.columns - ROW_PREFIX_WIDTH - nameWidth
  const componentsByName = new Map(components.map((component) => [component.name, component]))
  const choice = await autocomplete({
    message: 'Which component?',
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
    cancel('Nothing picked.')
    return null
  }
  outro(`${choice}. Next time, ${styleText('cyan', `rove-ui show ${choice}`)} goes straight to it.`)
  return choice
}
