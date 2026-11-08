/**
 * A Claude Code PostToolUse hook: after an Edit or Write, format the file with
 * Prettier (rustfmt for Rust) and lint it with ESLint, so a problem goes back to the agent while
 * the change is still in its context. Exit 2 hands stderr to the agent.
 *
 * Wired up in .claude/settings.json; reads the hook's JSON on stdin.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const LINTED_FILE = /\.(ts|tsx|js|mjs)$/

const hookInput = JSON.parse(readFileSync(0, 'utf8'))
const editedFile = hookInput.tool_input?.file_path
const relativePath = editedFile ? relative(ROOT, resolve(editedFile)) : ''
// Outside this checkout (another worktree, the scratchpad) isn't ours to lint.
if (!relativePath || relativePath.startsWith('..')) process.exit(0)

const runNpx = (command, args) => spawnSync('npx', [command, ...args], { cwd: ROOT, encoding: 'utf8' })

if (relativePath.endsWith('.rs')) {
  // rustfmt finds rustfmt.toml from the file's directory up.
  spawnSync('rustfmt', ['--edition', '2021', relativePath], { cwd: ROOT })
  process.exit(0)
}
runNpx('prettier', ['--write', '--ignore-unknown', '--log-level', 'warn', relativePath])
if (!LINTED_FILE.test(relativePath)) process.exit(0)

const lint = runNpx('eslint', ['--no-warn-ignored', relativePath])
if (lint.status !== 0) {
  console.error(`ESLint found problems in ${relativePath}:\n${lint.stdout}${lint.stderr}`)
  process.exit(2)
}
