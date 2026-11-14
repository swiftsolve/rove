#!/usr/bin/env node
/**
 * rove-ui: looks up the UI library's components in catalog/components.gen.json,
 * so an agent or a person reads one component instead of the whole file.
 * `npx rove-ui --help` lists the commands. Node runs it as .ts (>= 24).
 */
import { CommanderError } from 'commander'

import { readCatalog } from './catalog.ts'
import { askForAction, askForComponentName, writeNote } from './pick.ts'
import { createProgram } from './program.ts'
import { copyToClipboard, openInBrowser } from './system.ts'

const program = createProgram(readCatalog(), {
  write: (text) => process.stdout.write(text),
  writeError: (text) => process.stderr.write(text),
  isInteractive: process.stdin.isTTY && process.stdout.isTTY,
  askForComponentName,
  askForAction,
  copyToClipboard,
  openInBrowser,
  writeNote,
})

try {
  await program.parseAsync()
} catch (error) {
  if (!(error instanceof CommanderError)) {
    throw error
  }
  process.exitCode = error.exitCode
}
