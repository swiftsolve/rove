/**
 * Check that every custom property src/ reads is one something defines. A
 * misspelt `var(--bg-surfce)` or `p-(--card-paddin)` doesn't fail anywhere
 * else: the browser just drops the declaration, and the element quietly loses
 * its colour or spacing.
 *
 * A read is `var(--name)` in CSS or a class, or Tailwind's `(--name)` shorthand
 * (`p-(--card-padding)`). It's defined when rove-tokens' tokens.css or
 * text-styles.css declares it, a stylesheet in src/ does (`--name: …`, the
 * theme's `@theme` included), or code sets it (`style={{ '--name': … }}`, a
 * `[--name:…]` class). Tailwind's own `--tw-*` properties are its business.
 * One a library sets at runtime goes in SET_AT_RUNTIME, with who sets it.
 *
 *   node scripts/checks/custom-properties.ts
 */
import { readdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SRC = join(ROOT, 'src')
const SKIPPED = [join(SRC, 'assets')]
const require = createRequire(import.meta.url)
const TOKEN_FILES = ['tokens.css', 'text-styles.css'].map((f) => require.resolve(`@swiftsolve/rove-tokens/${f}`))

/** Custom properties a library sets on its own elements while it runs, by who sets them. */
const SET_AT_RUNTIME: Record<string, string> = {
  '--collapsible-panel-height': "Base UI's Collapsible, on the panel, for its height transition",
}

const DECLARED = /(--[\w-]+)\s*:/g
const SET_IN_STYLE = /['"](--[\w-]+)['"]\s*[:\]]/g
const SET_IN_CLASS = /\[(--[\w-]+):/g
const READ = /var\(\s*(--[\w-]+)|\((--[\w-]+)\)/g

async function listFiles(dir: string): Promise<string[]> {
  if (SKIPPED.includes(dir)) return []
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => (entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)])),
  )
  return nested.flat()
}

const files = (await listFiles(SRC)).filter((file) => /\.(?:css|tsx?)$/.test(file))
const sources = await Promise.all(
  files.map(async (file): Promise<[file: string, text: string]> => [file, await readFile(file, 'utf8')]),
)

const defined = new Set<string>()
const addDefinedNames = (text: string, pattern: RegExp) => {
  for (const [, name] of text.matchAll(pattern)) if (name) defined.add(name)
}
for (const file of TOKEN_FILES) addDefinedNames(await readFile(file, 'utf8'), DECLARED)
for (const [, text] of sources) {
  addDefinedNames(text, DECLARED)
  addDefinedNames(text, SET_IN_STYLE)
  addDefinedNames(text, SET_IN_CLASS)
}

const problems: string[] = []
const runtimeNamesRead = new Set<string>()
for (const [file, text] of sources) {
  for (const match of text.matchAll(READ)) {
    const name = match[1] ?? match[2] ?? ''
    if (defined.has(name) || name.startsWith('--tw-')) continue
    if (name in SET_AT_RUNTIME) {
      runtimeNamesRead.add(name)
      continue
    }
    const line = text.slice(0, match.index).split('\n').length
    problems.push(`${relative(ROOT, file)}:${line}: ${name} isn't defined by rove-tokens or src/; a typo?`)
  }
}
for (const name of Object.keys(SET_AT_RUNTIME)) {
  if (!runtimeNamesRead.has(name))
    problems.push(`scripts/checks/custom-properties.ts: SET_AT_RUNTIME lists ${name}, which nothing reads`)
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  console.error(`\n${problems.length} custom propert${problems.length === 1 ? 'y' : 'ies'} with nothing defining them`)
  process.exit(1)
}
console.log(`Custom properties OK (${defined.size} defined, ${files.length} files)`)
