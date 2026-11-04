/**
 * Count the ways around the rules, so they stay in sight: lint disables and
 * TypeScript suppressions in src/, raw values allowed in raw-values.mjs, and
 * figma.json's exceptions to the Figma check. It never fails: each escape has
 * its reason beside it, and this only keeps the total visible. In CI the
 * counts also go to the job summary.
 *
 *   node scripts/checks/escapes.mjs [--list]
 */
import { appendFile, readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'src')
const isListing = process.argv.includes('--list')

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => (entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)])),
  )
  return nested.flat()
}

const escapes = { 'Lint disables': [], 'TypeScript suppressions': [], 'Allowed raw values': [], 'Figma exceptions': [] }

const sources = (await listFiles(SRC)).filter((file) => /\.(?:tsx?|css)$/.test(file) && !/\.test\.tsx?$/.test(file))
for (const file of sources) {
  const lines = (await readFile(file, 'utf8')).split('\n')
  lines.forEach((line, index) => {
    const where = `${relative(ROOT, file)}:${index + 1}`
    const rule = line.match(/eslint-disable(?:-next-line|-line)?\s+([^\s*]+)/)?.[1]
    if (rule) escapes['Lint disables'].push(`${where} ${rule}`)
    if (/@ts-(?:ignore|expect-error|nocheck)/.test(line)) escapes['TypeScript suppressions'].push(where)
  })
}

const rawValues = await readFile(join(ROOT, 'scripts/checks/raw-values.mjs'), 'utf8')
for (const [, file, value] of rawValues.matchAll(/\{\s*file: '([^']+)',\s*value: '([^']+)',?\s*\}/g)) {
  escapes['Allowed raw values'].push(`${file} ${value}`)
}

const { components } = JSON.parse(await readFile(join(ROOT, 'src/ui/figma.json'), 'utf8'))
for (const [component, entry] of Object.entries(components)) {
  for (const kind of ['codeOnly', 'figmaOnly', 'valuesDiffer']) {
    for (const name of Object.keys(entry?.[kind] ?? {}))
      escapes['Figma exceptions'].push(`${component} ${kind} ${name}`)
  }
}

const summary = Object.entries(escapes).map(([kind, found]) => `${kind}: ${found.length}`)
console.log(`Escapes (${summary.join(', ')})`)
if (isListing) for (const [kind, found] of Object.entries(escapes)) console.log(`\n${kind}\n  ${found.join('\n  ')}`)

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = Object.entries(escapes).map(([kind, found]) => `| ${kind} | ${found.length} |`)
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `### Escapes\n\n| Kind | Count |\n| --- | --- |\n${rows.join('\n')}\n`,
  )
}
