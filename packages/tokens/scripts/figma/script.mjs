/**
 * The plugin's sync, for an agent: writes a script for the Figma MCP's
 * use_figma that runs figma-plugin/code.js against the Rove Design System
 * file, so an agent and the plugin check, apply and export the same way.
 *
 *   npm run figma -- check               # list every difference, change nothing
 *   npm run figma -- check --ref v1.3.1  # against a tag or commit, not the working tree
 *   npm run figma -- apply               # make the file match the repo
 *   npm run figma -- apply --prune       # and remove what the repo doesn't have
 *   npm run figma -- export              # the file's variables and text styles
 *   npm run figma -- save <result.json>  # write an export's result into src/figma/
 *
 * The script goes to stdout, or to a file with --out <path>. Pass it to
 * use_figma as `code`, with the file key from src/figma/variables.json.
 */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// use_figma refuses code longer than this.
const LIMIT = 50_000
const FILES = ['variables.json', 'text-styles.json']

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { prune: { type: 'boolean' }, ref: { type: 'string' }, out: { type: 'string' } },
})
const [action, input] = positionals
const usage = (message) => {
  console.error(message ?? 'Usage: npm run figma -- check|apply|export [--prune] [--ref <git ref>] [--out <path>]')
  process.exit(1)
}
if (!['check', 'apply', 'export', 'save'].includes(action)) usage()
if (values.prune && action !== 'apply') usage('--prune only goes with apply.')

if (action === 'save') {
  if (!input) usage('Usage: npm run figma -- save <result.json>')
  await save(input)
  process.exit(0)
}

// The plugin's code without its UI (or, to export, without Check and Apply),
// comment lines and indentation, to fit use_figma.
const engine = (await readFile(resolve(ROOT, 'figma-plugin/code.js'), 'utf8'))
  .split(action === 'export' ? "// ── The repo's shadows" : '// ── The plugin')[0]
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !/^(\/\/|\/\*\*|\*)/.test(line))
  .join('\n')

let body
if (action === 'export') {
  body = `return { ${FILES.map((f) => `'${f}': await ${f === 'variables.json' ? 'exportVariables' : 'exportTextStyles'}()`).join(', ')} }`
} else {
  /** A repo file from the working tree, or from a git ref. */
  const source = async (path) =>
    JSON.parse(
      values.ref
        ? execFileSync('git', ['show', `${values.ref}:${path}`], { cwd: ROOT, encoding: 'utf8' })
        : await readFile(resolve(ROOT, path), 'utf8'),
    )
  const repo = {
    variables: await source('src/figma/variables.json'),
    textStyles: await source('src/figma/text-styles.json'),
    codeTokens: await source('src/code-tokens.json'),
  }
  // Each variable goes as a tuple, not an object, to save its keys' length;
  // the script turns them back.
  const KEYS = ['name', 'collection', 'type', 'code', 'description', 'scopes', 'values']
  repo.variables = { ...repo.variables, variables: repo.variables.variables.map((v) => KEYS.map((k) => v[k])) }
  const call = action === 'check' ? 'checkTokens(REPO)' : `applyTokens(REPO, { prune: ${!!values.prune} })`
  body = [
    `const REPO = ${JSON.stringify(repo)}`,
    `REPO.variables.variables = REPO.variables.variables.map((t) => Object.fromEntries(${JSON.stringify(KEYS)}.map((k, i) => [k, t[i]])))`,
    `return await ${call}`,
  ].join('\n')
}
const script = `${engine}\n${body}\n`

if (script.length > LIMIT) usage(`The script is ${script.length} characters; use_figma takes ${LIMIT}. Use the plugin.`)
if (values.out) {
  await writeFile(values.out, script)
  console.error(`${values.out}: ${script.length} characters`)
} else process.stdout.write(script)

/**
 * Write an export's result into src/figma/, as the plugin's Export button
 * does. The result is the JSON use_figma returned, as saved, or wrapped in the
 * MCP's [{ type: 'text', text }] content list.
 */
async function save(path) {
  let result = JSON.parse(await readFile(path, 'utf8'))
  if (Array.isArray(result)) result = result.find((part) => part.type === 'text')?.text ?? result
  if (typeof result === 'string') result = JSON.parse(result)
  for (const name of FILES) {
    if (!result[name]) usage(`${path} has no ${name}: is it an export's result?`)
    const target = resolve(ROOT, 'src/figma', name)
    // Through use_figma, figma.root.name is "Document", so keep the name the plugin exported.
    const { file } = JSON.parse(await readFile(target, 'utf8'))
    if (file?.key === result[name].file?.key) result[name].file = file
    await writeFile(target, JSON.stringify(result[name], null, 2) + '\n')
    console.error(`src/figma/${name}`)
  }
}
