/**
 * Check the Figma plugin (figma-plugin/code.js) against a stand-in Figma file
 * built from this repo's tokens:
 *
 *   - Export must give back src/figma/*.json exactly, since the repo only ever
 *     takes tokens from an export;
 *   - Check must find no differences, then find each one planted in the file.
 *
 *   node scripts/checks/figma-plugin.mjs
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const json = async (path) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'))
const repo = {
  variables: await json('src/figma/variables.json'),
  textStyles: await json('src/figma/text-styles.json'),
  effectStyles: await json('src/figma/effect-styles.json'),
}
const code = await readFile(resolve(ROOT, 'figma-plugin/code.js'), 'utf8')

/** A stand-in for the Plugin API, holding the repo's tokens as a Figma file would. */
function fakeFigma() {
  let next = 0
  const id = () => `id:${next++}`
  const collections = repo.variables.collections.map((c) => ({
    id: id(),
    name: c.name,
    modes: c.modes.map((name) => ({ modeId: id(), name })),
    variableIds: [],
    get defaultModeId() {
      return this.modes[0].modeId
    },
  }))
  const byName = {}
  const variables = repo.variables.variables.map((v) => {
    const variable = {
      id: id(),
      name: v.name,
      resolvedType: v.type,
      description: v.description,
      codeSyntax: v.code ? { WEB: v.code } : {},
      scopes: v.scopes ?? ['ALL_SCOPES'],
      variableCollectionId: collections.find((c) => c.name === v.collection).id,
      valuesByMode: {},
      setValueForMode(mode, value) {
        this.valuesByMode[mode] = value
      },
      setVariableCodeSyntax(platform, value) {
        this.codeSyntax[platform] = value
      },
      removeVariableCodeSyntax(platform) {
        delete this.codeSyntax[platform]
      },
    }
    byName[v.name] = variable
    collections.find((c) => c.id === variable.variableCollectionId).variableIds.push(variable.id)
    return variable
  })
  const alias = (v) => ({ type: 'VARIABLE_ALIAS', id: v.id })
  for (const v of repo.variables.variables) {
    const variable = byName[v.name]
    for (const mode of collections.find((c) => c.id === variable.variableCollectionId).modes) {
      const value = v.values[mode.name]
      variable.valuesByMode[mode.modeId] = value?.alias ? alias(byName[value.alias]) : value
    }
  }
  const textStyles = repo.textStyles.styles.map((s) => ({
    name: s.name,
    description: s.description,
    fontName: { family: s.fontFamily, style: s.fontStyle },
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    textCase: s.textCase ?? 'ORIGINAL',
    boundVariables: Object.fromEntries(Object.entries(s.boundVariables).map(([f, n]) => [f, alias(byName[n])])),
    setBoundVariable(field, variable) {
      if (variable) this.boundVariables[field] = alias(variable)
      else delete this.boundVariables[field]
    },
  }))
  const effectStyles = repo.effectStyles.styles.map((s) => ({
    name: s.name,
    description: s.description,
    effects: s.layers.map((l) => {
      if (!byName[l.color]) throw new Error(`${s.name}: no Figma variable ${l.color}`)
      return {
        type: 'DROP_SHADOW',
        offset: { x: l.x, y: l.y },
        radius: l.blur,
        spread: l.spread,
        color: {},
        boundVariables: { color: alias(byName[l.color]) },
      }
    }),
  }))
  return {
    root: { name: repo.variables.file.name },
    fileKey: repo.variables.file.key,
    variables: {
      getLocalVariableCollectionsAsync: async () => collections,
      getLocalVariablesAsync: async () => variables,
      getVariableByIdAsync: async (i) => variables.find((v) => v.id === i),
      createVariableAlias: alias,
      setBoundVariableForEffect: (effect, field, v) => ({ ...effect, boundVariables: { [field]: alias(v) } }),
    },
    getLocalTextStylesAsync: async () => textStyles,
    getLocalEffectStylesAsync: async () => effectStyles,
    loadFontAsync: async () => {},
    byName,
    textStyles,
    effectStyles,
  }
}

const load = () => {
  const figma = {}
  const engine = new Function(
    'figma',
    `${code}\nreturn { checkTokens, exportVariables, exportTextStyles, exportEffectStyles }`,
  )(figma)
  Object.assign(figma, fakeFigma())
  return { figma, engine }
}

const fail = (message, detail) => {
  console.error(`figma-plugin: ${message}`)
  if (detail) console.error(JSON.stringify(detail, null, 2))
  process.exit(1)
}

const { figma, engine } = load()

// 1. Export gives back the repo's files, value for value.
const exported = {
  'variables.json': [await engine.exportVariables(), repo.variables],
  'text-styles.json': [await engine.exportTextStyles(), repo.textStyles],
  'effect-styles.json': [await engine.exportEffectStyles(), repo.effectStyles],
}
for (const [name, [fromFigma, inRepo]] of Object.entries(exported)) {
  if (JSON.stringify(fromFigma) !== JSON.stringify(inRepo))
    fail(`Export doesn't give back src/figma/${name}`, { exported: fromFigma, repo: inRepo })
}

// 2. The repo against itself: nothing to report.
const clean = await engine.checkTokens(repo)
if (!clean.inSync) fail('Check reports differences between the repo and a file made from it', clean.diff)

// 3. Plant one difference of each kind in the file: Check must find them all.
const variable = repo.variables.variables.find((v) => v.collection === 'Color' && v.description)
figma.byName[variable.name].description = 'changed in Figma'
figma.textStyles[0].fontSize += 1
figma.effectStyles[0].effects[0] = { ...figma.effectStyles[0].effects[0], radius: 99 }
figma.effectStyles[1].description = 'changed in Figma'
const planted = await engine.checkTokens(repo)
const found = planted.diff.map((d) => `${d.kind} ${d.name} ${d.field}`).sort()
const expected = [
  `variable ${variable.name} description`,
  `text style ${figma.textStyles[0].name} size`,
  `effect style ${figma.effectStyles[0].name} shadow`,
  `effect style ${figma.effectStyles[1].name} description`,
].sort()
if (JSON.stringify(found) !== JSON.stringify(expected)) fail('Check missed a planted difference', { found, expected })

console.log(
  `figma-plugin: export and check agree on ${repo.variables.variables.length} variables, ${repo.textStyles.styles.length} text styles and ${repo.effectStyles.styles.length} shadows`,
)
