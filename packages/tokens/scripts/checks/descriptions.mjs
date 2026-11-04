/**
 * Check every token in the Figma export has a description: it's the token's
 * use, shown in Figma's picker, the Storybook and DESIGN.md's token reference,
 * so a token without one can't be chosen by its job. Add it in Figma, then
 * export.
 *
 *   node scripts/checks/descriptions.mjs
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const read = async (name) => JSON.parse(await readFile(resolve(ROOT, 'src/figma', name), 'utf8'))

const missing = [
  ...(await read('variables.json')).variables,
  ...(await read('text-styles.json')).styles,
  ...(await read('effect-styles.json')).styles,
]
  .filter((token) => !token.description?.trim())
  .map((token) => token.name)

if (missing.length > 0) {
  console.error(`No description in Figma: ${missing.join(', ')}`)
  process.exit(1)
}
console.log('Every token has a description')
