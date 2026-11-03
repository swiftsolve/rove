/**
 * Check the token reference in DESIGN.md matches the last build, as CI does:
 * `npm run build` rewrites its bottom half, so a difference from the committed
 * file means the rebuilt reference wasn't committed.
 *
 *   npm run build && node scripts/checks/design-md.mjs
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

const { status } = spawnSync('git', ['diff', '--exit-code', '--stat', '--', 'DESIGN.md'], {
  cwd: ROOT,
  stdio: 'inherit',
})
if (status !== 0) {
  console.error('DESIGN.md is out of date: run npm run build and commit it.')
  process.exit(1)
}
