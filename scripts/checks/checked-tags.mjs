/**
 * Check that every checked tag in the guides names the check behind it,
 * [✓ CHECKED by `checks/raw-values.mjs`], and that the check still exists, so
 * a renamed or deleted script can't leave a rule pointing at nothing.
 *
 * A tag lists its checks after `by`, each in backticks: a path under `scripts/`
 * (`checks/raw-values.mjs`), one at the root (`eslint.config.js`), or a
 * command in COMMANDS. A tag without the tick or a check fails; the bold one
 * that explains the tag is skipped. In rove-tokens' DESIGN.md only the checks
 * it calls "Rove's" are this repo's; the rest are rove-tokens' own, so they're
 * left to it. A DESIGN.md from before this form (4.0.2 and older) is skipped.
 *
 *   node scripts/checks/checked-tags.mjs
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DESIGN_MD = 'node_modules/@swiftsolve/rove-tokens/DESIGN.md'
const SCRIPT_FOLDERS = ['checks/', 'gen/', 'eslint/']
const COMMANDS = ['prettier --check']
const ROVE_PREFIX = "Rove's "

// A tag outside bold: its tick, and what follows its `by` if anything does.
const TAG = /(?<!\*)\[(✓ )?CHECKED(?:\s+by\s+([^\]]*))?\](?!\*)/g
const FORM = '[✓ CHECKED by `its/file.mjs`]'

const exists = (name) =>
  COMMANDS.includes(name) ||
  existsSync(join(ROOT, SCRIPT_FOLDERS.some((folder) => name.startsWith(folder)) ? 'scripts' : '', name))

const problems = []
let checked = 0

function checkFile(path, isDesignMd) {
  const text = readFileSync(join(ROOT, path), 'utf8')
  if (isDesignMd && !text.includes('[✓ CHECKED by ')) return
  for (const match of text.matchAll(TAG)) {
    const line = text.slice(0, match.index).split('\n').length
    const [, tick, rest] = match
    const list = rest?.trim() ?? ''
    if (isDesignMd && !list.startsWith(ROVE_PREFIX)) continue
    checked += 1
    const names = [...list.matchAll(/`([^`]+)`/g)].map(([, name]) => name)
    if (!tick) problems.push(`${path}:${line}: start the tag with its tick, ${FORM}`)
    if (names.length === 0) problems.push(`${path}:${line}: name the check in backticks, ${FORM}`)
    for (const name of names.filter((n) => !exists(n))) {
      problems.push(`${path}:${line}: \`${name}\` names a check that doesn't exist`)
    }
  }
}

const guides = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
for (const path of guides) checkFile(path, false)
if (existsSync(join(ROOT, DESIGN_MD))) checkFile(DESIGN_MD, true)

if (problems.length > 0) {
  console.error(`checked-tags: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`checked-tags: ${checked} tags name a check that exists`)
