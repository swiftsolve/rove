/**
 * The plugin, for an agent: writes a script for the Figma MCP's use_figma that
 * runs figma-plugin/code.js against the Rove Design System file, so an agent
 * and the plugin export and check the same way. Nothing writes to the file:
 * tokens are designed in Figma and only exported from it.
 *
 *   npm run figma:export               # the file's variables, text styles and Shadow/* effect styles
 *   npm run figma:save <result.json>   # write an export's result into src/figma/
 *   npm run figma:check                # list every difference between the file and the repo
 *   npm run figma:check v2.0.0         # against a tag or commit, not the working tree
 *
 * The script goes to stdout (add `> file.js` to keep it). Pass it to use_figma
 * as `code`, with the file key from src/figma/variables.json.
 */
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FigmaEffectStyles, FigmaFile, FigmaTextStyles, FigmaVariables } from '../tokens/types.ts'

/** One of src/figma/*.json, as far as saving it needs. */
type ExportFile = { file?: FigmaFile }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// use_figma refuses code longer than this.
const USE_FIGMA_CODE_LIMIT = 50_000
/** Each file in src/figma/ and the code.js function that exports it. */
const FILES: Record<string, string> = {
  'variables.json': 'exportVariables',
  'text-styles.json': 'exportTextStyles',
  'effect-styles.json': 'exportEffectStyles',
}

// No options, only words, so npm passes them through without `--`.
// The second word is the result file to save, or the git ref to check against.
const [action, actionArgument] = process.argv.slice(2)
function exitWithUsage(message?: string): never {
  console.error(message ?? 'Usage: npm run figma:export | figma:save <result.json> | figma:check [git ref]')
  process.exit(1)
}
if (!action || !['check', 'export', 'save'].includes(action)) exitWithUsage()

if (action === 'save') {
  if (!actionArgument) exitWithUsage('Usage: npm run figma:save <result.json>')
  await saveExport(actionArgument)
  process.exit(0)
}

// The plugin's code without its UI (or, to export, without Check), comment
// lines and indentation, to fit use_figma.
const pluginSource = await readFile(resolve(ROOT, 'figma-plugin/code.js'), 'utf8')
const [pluginCodeToSend = ''] = pluginSource.split(action === 'export' ? '// ── Check' : '// ── The plugin')
const pluginCode = pluginCodeToSend
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !/^(\/\/|\/\*\*|\*)/.test(line))
  .join('\n')

let scriptBody: string
if (action === 'export') {
  scriptBody = `return { ${Object.entries(FILES)
    .map(([name, exporter]) => `'${name}': await ${exporter}()`)
    .join(', ')} }`
} else {
  /** A repo file from the working tree, or from a git ref. */
  const readRepoJson = async <T>(path: string) =>
    JSON.parse(
      actionArgument
        ? execFileSync('git', ['show', `${actionArgument}:${path}`], { cwd: ROOT, encoding: 'utf8' })
        : await readFile(resolve(ROOT, path), 'utf8'),
    ) as T
  const variables = await readRepoJson<FigmaVariables>('src/figma/variables.json')
  // Each variable goes as a tuple, not an object, to save its keys' length;
  // the script turns them back.
  const VARIABLE_KEYS = ['name', 'collection', 'type', 'code', 'description', 'scopes', 'values'] as const
  const repo = {
    variables: { ...variables, variables: variables.variables.map((v) => VARIABLE_KEYS.map((key) => v[key])) },
    textStyles: await readRepoJson<FigmaTextStyles>('src/figma/text-styles.json'),
    effectStyles: await readRepoJson<FigmaEffectStyles>('src/figma/effect-styles.json'),
  }
  scriptBody = [
    `const REPO = ${JSON.stringify(repo)}`,
    `REPO.variables.variables = REPO.variables.variables.map((t) => Object.fromEntries(${JSON.stringify(VARIABLE_KEYS)}.map((k, i) => [k, t[i]])))`,
    'return await checkTokens(REPO)',
  ].join('\n')
}
const script = `${pluginCode}\n${scriptBody}\n`

if (script.length > USE_FIGMA_CODE_LIMIT)
  exitWithUsage(`The script is ${script.length} characters; use_figma takes ${USE_FIGMA_CODE_LIMIT}. Use the plugin.`)
process.stdout.write(script)

/**
 * Write an export's result into src/figma/, as the plugin's Export button
 * does. The result is the JSON use_figma returned, as saved, or wrapped in the
 * MCP's [{ type: 'text', text }] content list.
 */
async function saveExport(path: string) {
  type McpContent = { type: string; text?: string }[]
  const saved = JSON.parse(await readFile(path, 'utf8')) as McpContent | string | Record<string, ExportFile>
  const unwrapped = Array.isArray(saved) ? (saved.find((part) => part.type === 'text')?.text ?? saved) : saved
  const result = (typeof unwrapped === 'string' ? JSON.parse(unwrapped) : unwrapped) as Record<string, ExportFile>
  for (const name of Object.keys(FILES)) {
    const exported = result[name] ?? exitWithUsage(`${path} has no ${name}: is it an export's result?`)
    const target = resolve(ROOT, 'src/figma', name)
    // Through use_figma, figma.root.name is "Document", so keep the name the plugin exported.
    const { file } = JSON.parse(await readFile(target, 'utf8')) as ExportFile
    if (file?.key === exported.file?.key) exported.file = file
    await writeFile(target, JSON.stringify(exported, null, 2) + '\n')
    console.error(`src/figma/${name}`)
  }
}
