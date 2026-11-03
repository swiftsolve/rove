/**
 * Check src/ui/figma.json against the Figma file: every node it names still
 * exists, and is still called the name written beside it. The catalogue check
 * only sees that each component has an entry; this one sees that the entry is
 * right, so a typo, a deleted component or a rename shows up here.
 *
 * It needs a token and the network, and skips (passing) without either, so
 * `npm run check` still runs on a machine that has neither. FIGMA_TOKEN is a
 * personal access token with the `file_content:read` scope (Figma → Settings →
 * Security → Personal access tokens). Put it in `.env.local` as
 * `FIGMA_TOKEN=figd_…` (git-ignored), or set it in the shell.
 *
 *   node scripts/checks/figma-nodes.mjs
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const FIGMA = join(ROOT, 'src/ui/figma.json')
const API = 'https://api.figma.com/v1'

/** FIGMA_TOKEN from the shell, else from the git-ignored .env.local. */
async function readToken() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN
  const env = await readFile(join(ROOT, '.env.local'), 'utf8').catch(() => '')
  return env.match(/^\s*FIGMA_TOKEN\s*=\s*["']?([^"'\s]+)/m)?.[1]
}

const token = await readToken()
if (!token) {
  console.log('Figma nodes skipped: no FIGMA_TOKEN in the shell or .env.local')
  process.exit(0)
}

const { file, components } = JSON.parse(await readFile(FIGMA, 'utf8'))
const fileKey = file.match(/figma\.com\/design\/([^/]+)/)?.[1]
if (!fileKey) {
  console.error(`figma.json's file isn't a figma.com/design URL: ${file}`)
  process.exit(1)
}

// Several components can share one Figma node (Menu and MenuContent), so each
// node is asked for once and every entry naming it is checked against it.
const entries = Object.entries(components).filter(([, entry]) => entry !== null)
const nodeIds = [...new Set(entries.map(([, entry]) => entry.node))]

// Offline skips; a bad token or file key answers, and fails.
const response = await fetch(`${API}/files/${fileKey}/nodes?ids=${nodeIds.join(',')}&depth=1`, {
  headers: { 'X-Figma-Token': token },
}).catch((error) => {
  console.log(`Figma nodes skipped: Figma couldn't be reached (${error.cause?.code ?? error.message})`)
  process.exit(0)
})
if (!response.ok) {
  console.error(`Figma answered ${response.status}: ${await response.text()}`)
  process.exit(1)
}
const { nodes } = await response.json()

const problems = []
for (const [component, { name, node }] of entries) {
  const found = nodes[node]?.document
  if (!found) problems.push(`${component}: node ${node} isn't in the Figma file`)
  else if (found.name !== name) problems.push(`${component}: node ${node} is "${found.name}" in Figma, not "${name}"`)
}

if (problems.length > 0) {
  console.error(`figma.json is out of step with Figma:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
console.log(`Figma nodes OK (${nodeIds.length} nodes in figma.json)`)
