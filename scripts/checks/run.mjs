/**
 * Run every check in this folder, plus each generator in ../gen with `--check`
 * (its output is fresh), and report all of them before failing, so one run
 * shows every problem.
 *
 *   node scripts/checks/run.mjs
 *
 * A new check is a script here that exits non-zero on a problem, and a new
 * generator one in ../gen that takes `--check`; either runs without being
 * listed.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const GEN = join(HERE, '..', 'gen')
const scripts = (dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.mjs') && name !== basename(fileURLToPath(import.meta.url)))
    .sort()
    .map((name) => join(dir, name))
const CHECKS = [...scripts(HERE).map((path) => [path]), ...scripts(GEN).map((path) => [path, '--check'])]

const failed = []
for (const [script, ...args] of CHECKS) {
  const { status } = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' })
  if (status !== 0) failed.push(basename(script))
}

if (failed.length > 0) {
  console.error(`\nFailed: ${failed.join(', ')}`)
  process.exit(1)
}
