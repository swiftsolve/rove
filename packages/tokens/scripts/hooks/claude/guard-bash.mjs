/**
 * A Claude Code PreToolUse hook: refuse shell commands that skip the checks or
 * throw away work. Other sessions share this checkout, so a hard reset or a
 * force push can take their work with it. Exit 2 blocks the command and hands
 * the reason to the agent.
 *
 * Only real git commands are judged, not text that mentions their flags: heredoc
 * bodies and quoted strings (a commit message, a script written to a file) are
 * dropped first, then each simple command between `&&`, `;`, `|` and the like
 * is read on its own.
 *
 * Wired up in .claude/settings.json; reads the hook's JSON on stdin. The same
 * file is in Rove; keep the two alike.
 *
 *   node scripts/hooks/claude/guard-bash.mjs --test   # check the cases below
 */
import { readFileSync } from 'node:fs'

const SKIPS_HOOKS = 'skips the git hooks; fix what they report instead'
const FORCE_PUSH = 'force-pushes over the remote; use --force-with-lease if you must'
const HARD_RESET = "discards uncommitted work, other sessions' included"

/** The command with heredoc bodies and quoted text gone; a quoted lone flag stays. */
function stripText(command) {
  const withoutHeredocs = command.replace(
    /<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g,
    (_, _quote, _tag, rest) => rest,
  )
  return withoutHeredocs.replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, (quoted) => {
    const text = quoted.slice(1, -1)
    return /^-[\w-]+$/.test(text) ? text : "''"
  })
}

/** A git command's subcommand and the words after it, or null for any other command. */
function gitCall(words) {
  let i = 0
  // Leading assignments and wrappers: `GIT_DIR=x git …`, `env git …`.
  while (i < words.length && (/^\w+=/.test(words[i]) || ['env', 'command', 'nohup', 'time'].includes(words[i]))) i++
  if (words[i] !== 'git') return null
  i++
  // Options before the subcommand: `git -C dir`, `git -c key=value`.
  while (i < words.length && words[i].startsWith('-')) i += ['-C', '-c'].includes(words[i]) ? 2 : 1
  return { subcommand: words[i], args: words.slice(i + 1) }
}

function reasonFor({ subcommand, args }) {
  const flags = args.filter((word) => word.startsWith('-'))
  if (flags.includes('--no-verify')) return SKIPS_HOOKS
  if (subcommand === 'commit' && flags.some((flag) => /^-[a-zA-Z]*n[a-zA-Z]*$/.test(flag))) return SKIPS_HOOKS
  if (subcommand === 'push') {
    // A bare --force or -f, or a +refspec. The guarded forms
    // (--force-with-lease, --force-if-includes) only share the prefix.
    if (flags.includes('--force') || flags.some((flag) => /^-[a-zA-Z]*f[a-zA-Z]*$/.test(flag))) return FORCE_PUSH
    if (args.some((word) => /^\+[^+]/.test(word))) return FORCE_PUSH
  }
  if (subcommand === 'reset' && flags.includes('--hard')) return HARD_RESET
  return null
}

export function check(command) {
  for (const part of stripText(command).split(/&&|\|\||[;|&\n()`]|\$\(/)) {
    const call = gitCall(part.trim().split(/\s+/))
    const reason = call && reasonFor(call)
    if (reason) return reason
  }
  return null
}

if (process.argv.includes('--test')) {
  const cases = [
    ['git commit --no-verify -m x', SKIPS_HOOKS],
    ['git commit -nm x', SKIPS_HOOKS],
    ['cd repo && git -C . commit -am x --no-verify', SKIPS_HOOKS],
    ['git push --force', FORCE_PUSH],
    ['git push -uf origin main', FORCE_PUSH],
    ['git push origin +main', FORCE_PUSH],
    ['GIT_TRACE=1 git push "--force"', FORCE_PUSH],
    ['git reset --hard HEAD~1', HARD_RESET],
    ['echo ok; git reset --hard', HARD_RESET],
    ['git push --force-with-lease', null],
    ['git push --force-if-includes --force-with-lease', null],
    ['git commit -m "never use --no-verify or git reset --hard"', null],
    ["cat > notes.md <<'EOF'\nDon't skip hooks with --no-verify.\nEOF\ngit add notes.md", null],
    ["python3 - <<'EOF'\nprint('git push --force')\nEOF", null],
    ['grep -n -- "--no-verify" AGENTS.md', null],
    ['git push -n origin main', null],
    ['git reset --soft HEAD~1', null],
  ]
  const failures = cases.filter(([command, expected]) => check(command) !== expected)
  for (const [command, expected] of failures)
    console.error(`${JSON.stringify(command)}: want ${expected}, got ${check(command)}`)
  console.log(`${cases.length - failures.length}/${cases.length} cases pass`)
  process.exit(failures.length > 0 ? 1 : 0)
}

const input = JSON.parse(readFileSync(0, 'utf8'))
const reason = check(input.tool_input?.command ?? '')
if (reason) {
  console.error(`Blocked: this ${reason}.`)
  process.exit(2)
}
