/**
 * Run every check in this folder, plus the UI catalogue's freshness check, and
 * report all of them before failing, so one run shows every problem.
 *
 *   node scripts/checks/run.mjs
 *
 * A new check is a script here that exits non-zero on a problem; it runs
 * without being listed.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const CHECKS = [
  ...readdirSync(HERE)
    .filter((name) => name.endsWith('.mjs') && name !== basename(fileURLToPath(import.meta.url)))
    .sort()
    .map((name) => [join(HERE, name)]),
  [join(HERE, '..', 'build-ui-catalogue.mjs'), '--check'],
]

const failed = []
for (const [script, ...args] of CHECKS) {
  const { status } = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' })
  if (status !== 0) failed.push(basename(script))
}

if (failed.length > 0) {
  console.error(`\nFailed: ${failed.join(', ')}`)
  process.exit(1)
}
