/**
 * What `pick` draws, as text: each prompt's frame for its state, and the lines
 * around them. Pure functions of what the prompt holds and the terminal's
 * width, so a test can draw one without a terminal. The guide line and
 * symbols are clack's; the colours are Rove's (theme.ts): the accent marks
 * the prompt waiting on you and the row you're on, gray carries the rest.
 */
import type { State } from '@clack/core'
import {
  limitOptions,
  S_BAR,
  S_BAR_END,
  S_BAR_START,
  S_RADIO_ACTIVE,
  S_RADIO_INACTIVE,
  S_STEP_ACTIVE,
  S_STEP_CANCEL,
  S_STEP_SUBMIT,
} from '@clack/prompts'

import type { NamedComponent } from '../catalog/catalog.ts'
import type { PickAction } from '../program.ts'
import { accentText, quietText, strongText } from '../theme.ts'
import { firstSentence } from './match.ts'

/** A prompt's state, as @clack/core names it: initial, active, validating, error, submit or cancel. */
export type PromptState = State

/** The guide line's prefix on a row inside a prompt: the bar and two spaces. */
const ROW_PREFIX = `${S_BAR}  `

/** Lines a list frame spends around its rows: guide lines, question, search, gap, hints, end. */
const LIST_FRAME_EXTRA_ROWS = 8

/** The most rows a list shows before it scrolls, however tall the terminal. */
const MAX_LIST_ROWS = 12

/** Columns a list row spends before its label: the guide line, the dot and their gaps. */
const LIST_ROW_PREFIX_WIDTH = ROW_PREFIX.length + 2

/** A key and what it does, in the hint line under a prompt. */
type KeyHint = { keys: string; action: string }

/** Text cut to a width, ending in an ellipsis when it was longer. */
function fitToWidth(text: string, width: number): string {
  if (text.length <= width) {
    return text
  }
  return `${text.slice(0, Math.max(0, width - 1)).trimEnd()}…`
}

/** A guide line, gray. */
function barText(): string {
  return quietText(S_BAR)
}

/** The prompt's symbol: the accent while it waits on you, gray once answered or left. */
function stateSymbol(state: PromptState): string {
  if (state === 'submit') {
    return quietText(S_STEP_SUBMIT)
  }
  if (state === 'cancel') {
    return quietText(S_STEP_CANCEL)
  }
  return accentText(S_STEP_ACTIVE)
}

/** The keys under a prompt, each key plain and its action gray. */
function keyHintsText(keyHints: KeyHint[]): string {
  return keyHints.map(({ keys, action }) => `${keys} ${quietText(action)}`).join('   ')
}

/** A question line, with "Esc quits" beside it while the prompt waits on you. */
function questionText(question: string, state: PromptState): string {
  const isWaiting = state === 'initial' || state === 'active'
  return isWaiting ? `${question} ${quietText('Esc quits')}` : question
}

/** The frame once answered or left: the question, then the answer quietly beneath it. */
function settledFrame(question: string, state: PromptState, answer: string | undefined): string {
  const lines = [barText(), `${stateSymbol(state)}  ${questionText(question, state)}`]
  if (state === 'submit' && answer !== undefined) {
    lines.push(`${barText()}  ${quietText(answer)}`)
  }
  return lines.join('\n')
}

/** What the component list prompt holds when it draws. */
export type ListFrameInput = {
  state: PromptState
  question: string
  /** What was typed, with the prompt's cursor drawn in. */
  typedTextWithCursor: string
  /** The components that match, in order. */
  components: NamedComponent[]
  cursor: number
  focusedName: string | undefined
  columns: number
  rows: number
}

/** One row of the component list: dot, name in a column, first sentence cut to fit. */
function componentRowText(
  component: NamedComponent,
  isFocused: boolean,
  nameWidth: number,
  descriptionWidth: number,
): string {
  const paddedName = component.name.padEnd(nameWidth)
  const description = quietText(fitToWidth(firstSentence(component.description), descriptionWidth))
  if (isFocused) {
    return `${accentText(S_RADIO_ACTIVE)} ${strongText(accentText(paddedName))}${description}`
  }
  return `${quietText(S_RADIO_INACTIVE)} ${paddedName}${description}`
}

/** The component list: question, search field, matching rows (scrolling), then the keys. */
export function listFrame(input: ListFrameInput): string {
  if (input.state === 'submit' || input.state === 'cancel') {
    return settledFrame(input.question, input.state, input.focusedName)
  }
  const nameWidth = Math.max(...input.components.map((component) => component.name.length), 0) + 2
  const descriptionWidth = input.columns - LIST_ROW_PREFIX_WIDTH - nameWidth
  const rows =
    input.components.length === 0
      ? [quietText('No component matches. Backspace to widen the search.')]
      : limitOptions({
          cursor: input.cursor,
          options: input.components,
          maxItems: Math.min(MAX_LIST_ROWS, input.rows - LIST_FRAME_EXTRA_ROWS),
          columnPadding: ROW_PREFIX.length,
          rowPadding: LIST_FRAME_EXTRA_ROWS,
          style: (component, isFocused) => componentRowText(component, isFocused, nameWidth, descriptionWidth),
        })
  const hints = keyHintsText([
    { keys: '↑/↓', action: 'move' },
    { keys: 'Enter', action: 'pick' },
    { keys: 'Type', action: 'to search by name or group' },
  ])
  return [
    barText(),
    `${stateSymbol(input.state)}  ${questionText(input.question, input.state)}`,
    barText(),
    `${barText()}  ${quietText('Search')} ${input.typedTextWithCursor}`,
    ...rows.map((row) => `${barText()}  ${row}`),
    barText(),
    `${barText()}  ${hints}`,
    quietText(S_BAR_END),
  ].join('\n')
}

/** What the action menu holds when it draws. */
export type MenuFrameInput = {
  state: PromptState
  question: string
  actions: PickAction[]
  cursor: number
}

/** One menu row: dot and label, with its hint beside it while focused. */
function actionRowText(action: PickAction, isFocused: boolean): string {
  if (!isFocused) {
    return `${quietText(S_RADIO_INACTIVE)} ${action.label}`
  }
  const hint = action.hint === undefined ? '' : `  ${quietText(action.hint)}`
  return `${accentText(S_RADIO_ACTIVE)} ${strongText(accentText(action.label))}${hint}`
}

/** The action menu: question, a row per action, then the keys. */
export function menuFrame(input: MenuFrameInput): string {
  if (input.state === 'submit' || input.state === 'cancel') {
    return settledFrame(input.question, input.state, input.actions[input.cursor]?.label)
  }
  const hints = keyHintsText([
    { keys: '↑/↓', action: 'move' },
    { keys: 'Enter', action: 'choose' },
  ])
  return [
    barText(),
    `${stateSymbol(input.state)}  ${questionText(input.question, input.state)}`,
    barText(),
    ...input.actions.map((action, index) => `${barText()}  ${actionRowText(action, index === input.cursor)}`),
    barText(),
    `${barText()}  ${hints}`,
    quietText(S_BAR_END),
  ].join('\n')
}

/** The line that opens the prompts: the start of the guide line and a title. */
export function introText(title: string): string {
  return `${quietText(S_BAR_START)}  ${strongText(title)}\n`
}

/** The lines that close the prompts. */
export function outroText(message: string): string {
  return `${barText()}\n${quietText(S_BAR_END)}  ${message}\n\n`
}

/** A note on the guide line, saying what an action did. */
export function noteText(message: string): string {
  return `${barText()}\n${accentText(S_RADIO_ACTIVE)}  ${message}\n`
}
