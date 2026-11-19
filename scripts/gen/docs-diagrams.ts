/**
 * Write the doc diagrams in docs/assets/ from scripts/docs-diagrams/diagrams.ts,
 * in the style docs/assets/README.md sets.
 *
 * Before writing, each diagram is checked against that style: text that runs
 * past its card, a label taller than its cards, cards closer than one gap, or
 * an arrow that crosses a card or a label fails it. `--check` also fails when
 * an SVG on disk isn't what the data draws, so a hand edit can't stay.
 *
 *   node scripts/gen/docs-diagrams.ts           # rewrite them (pnpm diagrams)
 *   node scripts/gen/docs-diagrams.ts --check   # fail if one breaks the style or is stale
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DIAGRAMS } from '../docs-diagrams/diagrams.ts'
import { diagramProblems, drawDiagram } from '../docs-diagrams/layout.ts'

const ASSETS = join(resolve(dirname(fileURLToPath(import.meta.url)), '../..'), 'docs/assets')
const isCheck = process.argv.includes('--check')

async function readIfThere(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

const problems = DIAGRAMS.flatMap((diagram) => diagramProblems(diagram))
for (const diagram of DIAGRAMS) {
  const path = join(ASSETS, diagram.file)
  const drawn = await drawDiagram(diagram)
  if (isCheck) {
    if ((await readIfThere(path)) !== drawn) {
      problems.push(`docs/assets/${diagram.file} isn't what its data draws: run pnpm diagrams`)
    }
  } else if (problems.length === 0) {
    await writeFile(path, drawn)
    console.log(`wrote docs/assets/${diagram.file}`)
  }
}

if (problems.length > 0) {
  console.error(['Doc diagrams break the style (docs/assets/README.md):', ...problems.map((p) => `  ${p}`)].join('\n'))
  process.exit(1)
}
