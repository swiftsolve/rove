/**
 * Releases the tokens: bumps package.json's version, commits only that file,
 * and tags the commit `tokens-v<version>`. Pushing the tag runs
 * .github/workflows/publish-tokens.yml, which checks the tokens and publishes
 * them to npm.
 *
 *   pnpm tokens release minor
 *
 * The tag has its own prefix because Rove's app releases on `v*` tags. The
 * commit names package.json alone, as other sessions commit in this checkout
 * too.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BUMPS = ['patch', 'minor', 'major'] as const
type Bump = (typeof BUMPS)[number]

const TAG_PREFIX = 'tokens-v'
const PACKAGE_JSON_PATH = fileURLToPath(new URL('../package.json', import.meta.url))

function isBump(value: string | undefined): value is Bump {
  return BUMPS.some((bump) => bump === value)
}

function bumpVersion(version: string, bump: Bump): string {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function runGit(...args: string[]): void {
  execFileSync('git', args, { stdio: 'inherit' })
}

const bump = process.argv[2]
if (!isBump(bump)) {
  console.error(`Usage: pnpm tokens release <${BUMPS.join('|')}>`)
  process.exit(1)
}

const packageJsonText = readFileSync(PACKAGE_JSON_PATH, 'utf8')
const packageJson = JSON.parse(packageJsonText) as { version: string }
const nextVersion = bumpVersion(packageJson.version, bump)
writeFileSync(
  PACKAGE_JSON_PATH,
  packageJsonText.replace(`"version": "${packageJson.version}"`, `"version": "${nextVersion}"`),
)

const tag = `${TAG_PREFIX}${nextVersion}`
runGit('commit', '-m', `chore(tokens): release v${nextVersion}`, '--', PACKAGE_JSON_PATH)
runGit('tag', tag)
console.log(`Tagged ${tag}. Push it to publish: git push origin master ${tag}`)
