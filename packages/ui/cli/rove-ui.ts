#!/usr/bin/env node
/**
 * rove-ui: looks up the UI library's components in catalog/components.gen.json,
 * so an agent or a person reads one component instead of the whole file.
 * `pnpm rove-ui --help` lists the commands. Node runs it as .ts (>= 24).
 */
import { CommanderError } from 'commander'

import { readCatalog } from './catalog/catalog.ts'
import { MAX_LINE_WIDTH } from './output/text.ts'
import { askForAction, askForComponentName, writeNote } from './pick/prompts.ts'
import { copyToClipboard, openInBrowser } from './pick/system.ts'
import { createProgram } from './program.ts'

const isInteractive = process.stdin.isTTY && process.stdout.isTTY

const program = createProgram(readCatalog(), {
  write: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
  // A pipe has no size (columns and rows are undefined): piped text takes the widest line.
  columns: process.stdout.columns || MAX_LINE_WIDTH,
  rows: process.stdout.rows || Infinity,
  isInteractive,
  askForComponentName,
  askForAction,
  copyToClipboard,
  openInBrowser,
  writeNote,
})

/** With no command, a person at a terminal gets the picker and a pipe gets the help, which exits cleanly. */
const commandArgs = process.argv.slice(2)
if (commandArgs.length === 0) {
  commandArgs.push(isInteractive ? 'pick' : '--help')
}

try {
  await program.parseAsync(commandArgs, { from: 'user' })
} catch (error) {
  if (!(error instanceof CommanderError)) {
    throw error
  }
  process.exitCode = error.exitCode
}
