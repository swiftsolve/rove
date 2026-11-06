/**
 * Check DESIGN.md against the DESIGN.md format, with Google's linter
 * (https://github.com/google-labs-code/design.md). The linter exits 0 on a
 * warning, such as a missing `primary` colour or a section out of order, so
 * this fails on any error or warning and prints what it found.
 *
 *   npm run build && node scripts/checks/design-md-format.mjs [file]
 *
 * The front matter is written by the build (scripts/tokens/design-front-matter.mjs);
 * a section problem is in the prose, which is edited directly.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const LINTER = resolve(ROOT, 'node_modules/@google/design.md/dist/index.js')

const run = spawnSync(process.execPath, [LINTER, 'lint', process.argv[2] ?? 'DESIGN.md'], {
  cwd: ROOT,
  encoding: 'utf8',
})
let report
try {
  report = JSON.parse(run.stdout)
} catch {
  console.error(`The DESIGN.md linter didn't report:\n${run.stdout}${run.stderr}`)
  process.exit(1)
}

const problems = report.findings.filter((f) => f.severity === 'error' || f.severity === 'warning')
if (problems.length > 0) {
  for (const f of problems)
    console.error(`DESIGN.md ${f.severity}${f.path ? ` at ${f.path}` : ''}: ${f.message} (${f.rule})`)
  process.exit(1)
}
console.log(
  `DESIGN.md follows the format: ${report.findings.find((f) => f.rule === 'token-summary')?.message ?? 'no findings'}`,
)
