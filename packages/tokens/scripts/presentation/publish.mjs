/**
 * Publish presentation/ to GitHub Pages.
 *
 *   npm run present:publish
 *
 * Pushes the exported page and its frames, as a single fresh commit, to the
 * repo's gh-pages branch, which Pages serves at
 * https://swiftsolve.github.io/rove-tokens/. Run `npm run present` first.
 * The branch only ever holds the latest export: each publish replaces it.
 */
import { execFileSync } from 'node:child_process'
import { access, cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PRESENTATION = resolve(ROOT, 'presentation')
const PAGES_URL = 'https://swiftsolve.github.io/rove-tokens/'

try {
  await access(join(PRESENTATION, 'index.html'))
} catch {
  console.error('No presentation yet. Run `npm run present` to export it from Figma.')
  process.exit(1)
}

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const remote = git(['remote', 'get-url', 'origin'], ROOT)
const built = git(['rev-parse', '--short', 'HEAD'], ROOT)

const work = await mkdtemp(join(tmpdir(), 'rove-presentation-'))
try {
  await cp(PRESENTATION, work, { recursive: true })
  // Serve the files as they are, without Jekyll.
  await writeFile(join(work, '.nojekyll'), '')
  git(['init', '-q', '-b', 'gh-pages'], work)
  git(['add', '-A'], work)
  git(['commit', '-q', '-m', `Presentation exported from Figma, built at ${built}`], work)
  git(['push', '-q', '--force', remote, 'gh-pages'], work)
} finally {
  await rm(work, { recursive: true, force: true })
}
console.log(`Published to ${PAGES_URL}`)
