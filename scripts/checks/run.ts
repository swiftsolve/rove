/**
 * Run every check in this folder, plus each generator in ../gen with `--check`
 * (its output is fresh), and report all of them before failing, so one run
 * shows every problem.
 *
 *   node scripts/checks/run.ts
 *
 * A new check is a script here that exits non-zero on a problem, and a new
 * generator one in ../gen that takes `--check`; either runs without being
 * listed.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const THIS_FILE = fileURLToPath(import.meta.url)
const CHECKS_DIR = dirname(THIS_FILE)
const GEN_DIR = join(CHECKS_DIR, '..', 'gen')

/** Every script in `dir` but this one, in name order. */
function scriptsIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.ts') && name !== basename(THIS_FILE))
    .sort()
    .map((name) => join(dir, name))
}

type Check = { script: string; args: string[] }
const CHECKS: Check[] = [
  ...scriptsIn(CHECKS_DIR).map((script) => ({ script, args: [] })),
  ...scriptsIn(GEN_DIR).map((script) => ({ script, args: ['--check'] })),
]

const failed: string[] = []
for (const { script, args } of CHECKS) {
  const { status } = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' })
  if (status !== 0) failed.push(basename(script))
}

if (failed.length > 0) {
  console.error(`\nFailed: ${failed.join(', ')}`)
  process.exit(1)
}
