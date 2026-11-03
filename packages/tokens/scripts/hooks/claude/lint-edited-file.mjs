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
const SCRIPT = /\.(js|jsx|mjs)$/

const input = JSON.parse(readFileSync(0, 'utf8'))
const file = input.tool_input?.file_path
const path = file ? relative(ROOT, resolve(file)) : ''
// Outside this checkout (another worktree, the scratchpad) isn't ours to lint.
if (!path || path.startsWith('..')) process.exit(0)

const run = (command, args) => spawnSync('npx', [command, ...args], { cwd: ROOT, encoding: 'utf8' })

run('prettier', ['--write', '--ignore-unknown', '--log-level', 'warn', path])
if (!SCRIPT.test(path)) process.exit(0)

const lint = run('eslint', ['--no-warn-ignored', path])
if (lint.status !== 0) {
  console.error(`ESLint found problems in ${path}:\n${lint.stdout}${lint.stderr}`)
  process.exit(2)
}
