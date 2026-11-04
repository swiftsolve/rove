/**
 * Run every check in this folder and report all of them before failing, so one
 * run shows every problem. They read the build, so build first.
 *
 *   npm run build && node scripts/checks/run.mjs
 *
 * A new check is a script here that exits non-zero on a problem; it runs
 * without being listed.
 */
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SELF = basename(fileURLToPath(import.meta.url))
const checks = readdirSync(HERE)
  .filter((name) => name.endsWith('.mjs') && name !== SELF)
  .sort()

const failed = []
for (const name of checks) {
  const { status } = spawnSync(process.execPath, [join(HERE, name)], { stdio: 'inherit' })
  if (status !== 0) failed.push(name)
}

if (failed.length > 0) {
  console.error(`\nFailed: ${failed.join(', ')}`)
  process.exit(1)
}
