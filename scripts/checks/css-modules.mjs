/**
 * Check every CSS Module against the code that uses it:
 *
 *   - each `styles.someName` must be a class defined in the imported module
 *     (CSS Modules types every key as a string, so TypeScript can't catch a typo);
 *   - each class a module defines must be used somewhere, so dead CSS doesn't pile up.
 *
 * Class names are kebab-case in the CSS and camelCase in code (Vite's
 * `localsConvention: 'camelCaseOnly'`): `.row-name` is `styles.rowName`.
 *
 *   node scripts/checks/css-modules.mjs
 */
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'src')

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name)
      return entry.isDirectory() ? listFiles(path) : [path]
    }),
  )
  return nested.flat()
}

const toCamelCase = (name) => name.replace(/-+([a-z0-9])/g, (_, letter) => letter.toUpperCase())

/** Every class a module defines, outside comments and `:global(...)`. */
function moduleClasses(css) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const withoutGlobals = withoutComments.replace(/:global\([^)]*\)/g, '')
  // Only selectors (text before a `{`), not declarations like `0.5s` or `url(a.b)`.
  const selectors = [...withoutGlobals.matchAll(/([^{};]+)\{/g)].map((match) => match[1])
  const classes = new Set()
  for (const selector of selectors) {
    if (selector.trim().startsWith('@')) continue
    for (const [, name] of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes.add(toCamelCase(name))
  }
  return classes
}

const files = await listFiles(SRC)
const problems = []
const used = new Map(files.filter((f) => f.endsWith('.module.css')).map((f) => [f, new Set()]))

for (const file of files.filter((f) => /\.tsx?$/.test(f))) {
  const code = await readFile(file, 'utf8')
  for (const [, binding, specifier] of code.matchAll(/import\s+(\w+)\s+from\s+'([^']+\.module\.css)'/g)) {
    const cssPath = specifier.startsWith('@/') ? join(SRC, specifier.slice(2)) : resolve(dirname(file), specifier)
    const defined = moduleClasses(await readFile(cssPath, 'utf8'))
    const usedHere = used.get(cssPath) ?? new Set()
    for (const [, name] of code.matchAll(new RegExp(`\\b${binding}\\.(\\w+)`, 'g'))) {
      usedHere.add(name)
      if (!defined.has(name))
        problems.push(`${relative(ROOT, file)}: ${binding}.${name} is not a class in ${relative(ROOT, cssPath)}`)
    }
    // `styles[...]` lookups can reach any class, so they count as using all of them.
    if (new RegExp(`\\b${binding}\\[`).test(code)) defined.forEach((name) => usedHere.add(name))
    used.set(cssPath, usedHere)
  }
}

for (const [cssPath, usedNames] of used) {
  const defined = moduleClasses(await readFile(cssPath, 'utf8'))
  for (const name of defined) {
    if (!usedNames.has(name)) problems.push(`${relative(ROOT, cssPath)}: .${name} is never used`)
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} CSS Module problem${problems.length === 1 ? '' : 's'}`)
  process.exit(1)
}
console.log(`CSS Modules OK (${used.size} modules)`)
