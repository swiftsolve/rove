/**
 * Check every file and folder name in src/ against the naming rule:
 *
 *   - components are PascalCase `.tsx` (`ThemeProvider.tsx`), and a component's
 *     CSS Module takes its name (`ConnectionStrip.module.css`);
 *   - hooks are camelCase starting with `use` (`useTheme.ts`, `.tsx` if it renders);
 *   - everything else is kebab-case: modules (`theme-context.ts`), global
 *     stylesheets (`base.css`), data (`components.json`) and folders
 *     (`live-throughput/`);
 *   - a test takes its module's name plus `.test` (`chart-scale.test.ts`,
 *     `Button.test.tsx`, `usePresence.test.tsx`);
 *   - a component's stories take its name plus `.stories` (`Button.stories.tsx`).
 *
 * `main.tsx` is Vite's entry point and keeps its name, as does `AGENTS.md`, the
 * name agents look for in a folder. Assets keep the names they came with
 * (`InterVariable.woff2`), so `src/assets` isn't checked.
 *
 *   node scripts/checks/file-names.mjs
 */
import { readdir } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'src')
const SKIPPED = [join(SRC, 'assets')]
const ENTRY_POINTS = ['main.tsx']
const AGENT_NOTES = 'AGENTS.md'

const KEBAB = '[a-z0-9]+(?:-[a-z0-9]+)*'
const PASCAL = '[A-Z][A-Za-z0-9]*'
const HOOK = 'use[A-Z][A-Za-z0-9]*'

// A kebab-case `use-…` name is a hook named the wrong way, not a module.
const SCRIPT = new RegExp(
  `^(?:${PASCAL}(?:\\.test|\\.stories)?\\.tsx|${HOOK}(?:\\.test)?\\.tsx?|(?!use-)${KEBAB}(?:\\.d|\\.test)?\\.ts)$`,
)
const STYLESHEET = new RegExp(`^(?:${PASCAL}\\.module|${KEBAB})\\.css$`)
const DATA = new RegExp(`^${KEBAB}\\.json$`)
const FOLDER = new RegExp(`^${KEBAB}$`)

const SCRIPT_RULE = 'name a component PascalCase.tsx, a hook useName.ts, and anything else kebab-case.ts'
const STYLESHEET_RULE =
  'name a CSS Module after its component (Name.module.css), and a global stylesheet kebab-case.css'
const DATA_RULE = 'name a data file kebab-case.json'

const problems = []
let checked = 0

async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (SKIPPED.includes(path)) continue
    checked += 1
    if (entry.isDirectory()) {
      if (!FOLDER.test(entry.name)) problems.push(`${relative(ROOT, path)}/: folders are kebab-case`)
      await check(path)
    } else if (ENTRY_POINTS.includes(entry.name) || entry.name === AGENT_NOTES) {
      continue
    } else if (entry.name.endsWith('.css')) {
      if (!STYLESHEET.test(entry.name)) problems.push(`${relative(ROOT, path)}: ${STYLESHEET_RULE}`)
    } else if (entry.name.endsWith('.json')) {
      if (!DATA.test(entry.name)) problems.push(`${relative(ROOT, path)}: ${DATA_RULE}`)
    } else if (!SCRIPT.test(entry.name)) {
      problems.push(`${relative(ROOT, path)}: ${SCRIPT_RULE}`)
    }
  }
}

await check(SRC)

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} file name problem${problems.length === 1 ? '' : 's'}`)
  process.exit(1)
}
console.log(`File names OK (${checked} in src/)`)
