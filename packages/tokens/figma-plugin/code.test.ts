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

import type { FigmaEffectStyles, FigmaTextStyles, FigmaValue, FigmaVariables } from '../scripts/tokens/types.ts'

/** A pointer at a variable, as the Plugin API writes one. */
type Alias = { type: 'VARIABLE_ALIAS'; id: string }
/** A stand-in Figma variable: the fields and methods code.js uses. */
type FakeVariable = {
  id: string
  name: string
  resolvedType: string
  description: string | undefined
  codeSyntax: Record<string, string>
  scopes: string[]
  variableCollectionId: string
  valuesByMode: Record<string, unknown>
}
/** What code.js returns. */
type Plugin = {
  checkTokens: (repo: Repo) => Promise<{ inSync: boolean; diff: { kind: string; name: string; field: string }[] }>
  exportVariables: () => Promise<unknown>
  exportTextStyles: () => Promise<unknown>
  exportEffectStyles: () => Promise<unknown>
}
type Repo = { variables: FigmaVariables; textStyles: FigmaTextStyles; effectStyles: FigmaEffectStyles }

/** The item a test needs, or a failure naming what was missing. */
function found<T>(item: T | undefined, what: string): T {
  if (item === undefined) throw new Error(`The stand-in file has no ${what}`)
  return item
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readRepoJson = async <T>(path: string) => JSON.parse(await readFile(resolve(ROOT, path), 'utf8')) as T
const repo: Repo = {
  variables: await readRepoJson<FigmaVariables>('src/figma/variables.json'),
  textStyles: await readRepoJson<FigmaTextStyles>('src/figma/text-styles.json'),
  effectStyles: await readRepoJson<FigmaEffectStyles>('src/figma/effect-styles.json'),
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
    variableIds: [] as string[],
    get defaultModeId() {
      return this.modes[0]?.modeId
    },
  }))
  const collectionOf = (find: (c: (typeof collections)[number]) => boolean) =>
    found(collections.find(find), 'such collection')
  const byName: Record<string, FakeVariable> = {}
  const variables = repo.variables.variables.map((v) => {
    const variable = {
      id: newId(),
      name: v.name,
      resolvedType: v.type,
      description: v.description,
      codeSyntax: (v.code ? { WEB: v.code } : {}) as Record<string, string>,
      scopes: v.scopes,
      variableCollectionId: collectionOf((c) => c.name === v.collection).id,
      valuesByMode: {} as Record<string, unknown>,
      setValueForMode(mode: string, value: unknown) {
        this.valuesByMode[mode] = value
      },
      setVariableCodeSyntax(platform: string, value: string) {
        this.codeSyntax[platform] = value
      },
      removeVariableCodeSyntax(platform: string) {
        delete this.codeSyntax[platform]
      },
    }
    byName[v.name] = variable
    collectionOf((c) => c.id === variable.variableCollectionId).variableIds.push(variable.id)
    return variable
  })
  const variableNamed = (name: string) => found(byName[name], `variable ${name}`)
  const alias = (v: FakeVariable): Alias => ({ type: 'VARIABLE_ALIAS', id: v.id })
  /** An exported value as the Plugin API holds it: an easing's curve or spring under Figma's own keys. */
  const figmaValue = (value: FigmaValue | undefined) => {
    if (typeof value !== 'object') return value
    if ('alias' in value) return alias(variableNamed(value.alias))
    if ('cubicBezier' in value) return { type: value.type, easingFunctionCubicBezier: value.cubicBezier }
    if ('spring' in value) return { type: value.type, easingFunctionSpring: value.spring }
    return value
  }
  for (const v of repo.variables.variables) {
    const variable = variableNamed(v.name)
    for (const mode of collectionOf((c) => c.id === variable.variableCollectionId).modes)
      variable.valuesByMode[mode.modeId] = figmaValue(v.values[mode.name])
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
      Object.entries(s.boundVariables).map(([field, variableName]) => [field, alias(variableNamed(variableName))]),
    ),
    setBoundVariable(field: string, variable: FakeVariable | null) {
      if (variable) this.boundVariables[field] = alias(variable)
      else delete this.boundVariables[field]
    },
  }))
  const effectStyles = repo.effectStyles.styles.map((s) => ({
    name: s.name,
    description: s.description,
    effects: s.layers.map((l) => {
      if (typeof l.color !== 'string') throw new Error(`${s.name}: a shadow colour that's no variable`)
      const colour = variableNamed(l.color)
      return {
        type: 'DROP_SHADOW',
        offset: { x: l.x, y: l.y },
        radius: l.blur,
        spread: l.spread,
        color: {},
        boundVariables: { color: alias(colour) },
      }
    }),
  }))
  return {
    root: { name: repo.variables.file.name },
    fileKey: repo.variables.file.key,
    variables: {
      getLocalVariableCollectionsAsync: async () => collections,
      getLocalVariablesAsync: async () => variables,
      getVariableByIdAsync: async (variableId: string) => variables.find((v) => v.id === variableId),
      createVariableAlias: alias,
      setBoundVariableForEffect: (effect: object, field: string, v: FakeVariable) => ({
        ...effect,
        boundVariables: { [field]: alias(v) },
      }),
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
  // code.js reads `figma` when a function runs, not when it loads, so the
  // stand-in can be filled in after.
  const figma = {} as ReturnType<typeof fakeFigma>
  const plugin = new Function(
    'figma',
    `${code}\nreturn { checkTokens, exportVariables, exportTextStyles, exportEffectStyles }`,
  )(figma) as Plugin
  Object.assign(figma, fakeFigma())
  return { figma, plugin }
}

// Compared as written JSON, so key order counts: the export is the file.
const asFile = (value: unknown) => JSON.stringify(value, null, 2)

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
  const allVariables = repo.variables.variables
  const variable = found(
    allVariables.find((v) => v.collection === 'Color' && v.description),
    'described colour',
  )
  const textStyle = found(figma.textStyles[0], 'text style')
  const [firstShadow, secondShadow] = figma.effectStyles
  const shadowLayer = found(firstShadow?.effects[0], 'shadow layer')
  found(figma.byName[variable.name], variable.name).description = 'changed in Figma'
  textStyle.fontSize += 1
  found(firstShadow, 'first shadow').effects[0] = { ...shadowLayer, radius: 99 }
  found(secondShadow, 'second shadow').description = 'changed in Figma'
  // A timing and an easing, which Figma holds as a number and an object.
  const timing = found(
    allVariables.find((v) => v.type === 'TIMING'),
    'timing',
  )
  const easing = found(
    allVariables.find((v) => v.type === 'EASING'),
    'easing',
  )
  const setOnlyValue = (name: string, value: unknown) => {
    const planted = found(figma.byName[name], name)
    for (const mode of Object.keys(planted.valuesByMode)) planted.valuesByMode[mode] = value
  }
  setOnlyValue(timing.name, 0.3)
  setOnlyValue(easing.name, { type: 'CUSTOM_SPRING', easingFunctionSpring: { bounce: 0.5 } })
  const { diff } = await plugin.checkTokens(repo)
  assert.deepEqual(
    diff.map((d) => `${d.kind} ${d.name} ${d.field}`).sort(),
    [
      `effect style ${firstShadow?.name} shadow`,
      `effect style ${secondShadow?.name} description`,
      `text style ${textStyle.name} size`,
      `variable ${variable.name} description`,
      `variable ${timing.name} value in Value`,
      `variable ${easing.name} value in Value`,
    ].sort(),
  )
})
