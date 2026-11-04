/**
 * A Claude Code PreToolUse hook: refuse shell commands that skip the checks or
 * throw away work. Other sessions share this checkout, so a hard reset or a
 * force push can take their work with it. Exit 2 blocks the command and hands
 * the reason to the agent.
 *
 * Wired up in .claude/settings.json; reads the hook's JSON on stdin.
 */
import { readFileSync } from 'node:fs'

const BLOCKED = [
  [/--no-verify\b/, 'skips the git hooks; fix what they report instead'],
  // A bare --force or -f. The guarded forms (--force-with-lease,
  // --force-if-includes) only share the prefix, so they pass.
  [/\bgit\s+push\b.*\s(--force|-f)(?![\w-])/, 'force-pushes over the remote; use --force-with-lease if you must'],
  [/\bgit\s+reset\b.*--hard\b/, "discards uncommitted work, other sessions' included"],
]

const input = JSON.parse(readFileSync(0, 'utf8'))
const command = input.tool_input?.command ?? ''
for (const [pattern, reason] of BLOCKED) {
  if (pattern.test(command)) {
    console.error(`Blocked: this ${reason}.`)
    process.exit(2)
  }
}
