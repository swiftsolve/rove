/**
 * A Claude Code PostToolUse hook: after an Edit or Write, format the file with
 * Prettier and lint it with ESLint, so a problem goes back to the agent while
 * the change is still in its context. Exit 2 hands stderr to the agent.
 *
 * Wired up in .claude/settings.json; reads the hook's JSON on stdin.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const LINTED_FILE = /\.(js|jsx|ts)$/

type HookInput = { tool_input?: { file_path?: string } }
const hookInput = JSON.parse(readFileSync(0, 'utf8')) as HookInput
const editedFile = hookInput.tool_input?.file_path
const path = editedFile ? relative(ROOT, resolve(editedFile)) : ''
// Outside this checkout (another worktree, the scratchpad) isn't ours to lint.
if (!path || path.startsWith('..')) process.exit(0)

const runNpx = (command: string, args: string[]) =>
  spawnSync('npx', [command, ...args], { cwd: ROOT, encoding: 'utf8' })

runNpx('prettier', ['--write', '--ignore-unknown', '--log-level', 'warn', path])
if (!LINTED_FILE.test(path)) process.exit(0)

const lint = runNpx('eslint', ['--no-warn-ignored', path])
if (lint.status !== 0) {
  console.error(`ESLint found problems in ${path}:\n${lint.stdout}${lint.stderr}`)
  process.exit(2)
}
