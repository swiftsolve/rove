/**
 * Test the Figma plugin (code.js) against a stand-in Figma file built from
 * this repo's tokens:
 *
 *   - Export must give back src/figma/*.json exactly, since the repo only ever
 *     takes tokens from an export;
 *   - Check must find no differences, then find each one planted in the file.
 *
 *   npm test
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readRepoJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8'))
const repo = {
  variables: await readRepoJson('src/figma/variables.json'),
  textStyles: await readRepoJson('src/figma/text-styles.json'),
  effectStyles: await readRepoJson('src/figma/effect-styles.json'),
}
const code = await readFile(resolve(ROOT, 'figma-plugin/code.js'), 'utf8')

/** A stand-in for the Plugin API, holding the repo's tokens as a Figma file would. */
function fakeFigma() {
  let nextId = 0
  const newId = () => `id:${nextId++}`
  const collections = repo.variables.collections.map((c) => ({
    id: newId(),
    name: c.name,
    modes: c.modes.map((name) => ({ modeId: newId(), name })),
    variableIds: [],
    get defaultModeId() {
      return this.modes[0].modeId
    },
  }))
  const byName = {}
  const variables = repo.variables.variables.map((v) => {
    const variable = {
      id: newId(),
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
    boundVariables: Object.fromEntries(
      Object.entries(s.boundVariables).map(([field, variableName]) => [field, alias(byName[variableName])]),
    ),
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
      getVariableByIdAsync: async (variableId) => variables.find((v) => v.id === variableId),
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

/** Run code.js against a fresh stand-in file; `figma` is that file, to plant differences in. */
const loadPlugin = () => {
  const figma = {}
  const plugin = new Function(
    'figma',
    `${code}\nreturn { checkTokens, exportVariables, exportTextStyles, exportEffectStyles }`,
  )(figma)
  Object.assign(figma, fakeFigma())
  return { figma, plugin }
}

// Compared as written JSON, so key order counts: the export is the file.
const asFile = (value) => JSON.stringify(value, null, 2)

test('Export gives back the repo files, value for value', async () => {
  const { plugin } = loadPlugin()
  assert.equal(asFile(await plugin.exportVariables()), asFile(repo.variables), 'src/figma/variables.json')
  assert.equal(asFile(await plugin.exportTextStyles()), asFile(repo.textStyles), 'src/figma/text-styles.json')
  assert.equal(asFile(await plugin.exportEffectStyles()), asFile(repo.effectStyles), 'src/figma/effect-styles.json')
})

test('Check finds nothing between the repo and a file made from it', async () => {
  const { plugin } = loadPlugin()
  const { inSync, diff } = await plugin.checkTokens(repo)
  assert.ok(inSync, asFile(diff))
})

test('Check finds one planted difference of each kind', async () => {
  const { figma, plugin } = loadPlugin()
  const variable = repo.variables.variables.find((v) => v.collection === 'Color' && v.description)
  figma.byName[variable.name].description = 'changed in Figma'
  figma.textStyles[0].fontSize += 1
  figma.effectStyles[0].effects[0] = { ...figma.effectStyles[0].effects[0], radius: 99 }
  figma.effectStyles[1].description = 'changed in Figma'
  const { diff } = await plugin.checkTokens(repo)
  assert.deepEqual(
    diff.map((d) => `${d.kind} ${d.name} ${d.field}`).sort(),
    [
      `effect style ${figma.effectStyles[0].name} shadow`,
      `effect style ${figma.effectStyles[1].name} description`,
      `text style ${figma.textStyles[0].name} size`,
      `variable ${variable.name} description`,
    ].sort(),
  )
})
