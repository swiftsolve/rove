/**
 * Check that every checked tag in DESIGN.md names the check behind it,
 * [✓ CHECKED by `checks/contrast.mjs`], and that this repo's still exists, so
 * a renamed or deleted script can't leave a rule pointing at nothing.
 *
 * A tag lists its checks after `by`, each in backticks, as paths under
 * `scripts/`. Those it calls "Rove's" are in Rove's repo, whose own
 * checked-tags.mjs holds them; the bold tag in the intro is skipped.
 *
 *   node scripts/checks/checked-tags.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ROVE_PREFIX = "Rove's "
const FORM = '[✓ CHECKED by `checks/its-file.mjs`]'

// A tag outside bold: its tick, and what follows its `by` if anything does.
const TAG = /(?<!\*)\[(✓ )?CHECKED(?:\s+by\s+([^\]]*))?\](?!\*)/g

const text = readFileSync(join(ROOT, 'DESIGN.md'), 'utf8')
const problems = []
let checked = 0

for (const match of text.matchAll(TAG)) {
  const [, tick, rest] = match
  const line = text.slice(0, match.index).split('\n').length
  const list = rest?.trim() ?? ''
  const names = [...list.matchAll(/`([^`]+)`/g)].map(([, name]) => name)
  if (!tick) problems.push(`DESIGN.md:${line}: start the tag with its tick, ${FORM}`)
  if (names.length === 0) problems.push(`DESIGN.md:${line}: name the check in backticks, ${FORM}`)
  if (list.startsWith(ROVE_PREFIX)) continue
  checked += 1
  for (const name of names.filter((n) => !existsSync(join(ROOT, 'scripts', n)))) {
    problems.push(`DESIGN.md:${line}: \`${name}\` names a check that isn't in scripts/`)
  }
}

if (problems.length > 0) {
  console.error(`checked-tags: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`checked-tags: ${checked} of this repo's tags name a check that exists`)
