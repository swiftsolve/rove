// Rove Tokens: brings the Rove Design System file's tokens into the rove-tokens
// repo, one way. Figma is where tokens are designed; the repo only records them.
//
// - Export writes the file's variables, text styles and Shadow/* effect styles
//   in the shapes src/figma/variables.json, src/figma/text-styles.json and
//   src/figma/effect-styles.json hold.
// - Check lists every difference between the file and a copy of those files,
//   so a repo that's behind Figma, or was edited by hand, shows up. Nothing
//   here writes to the file.
//
// Run from Figma desktop: Plugins > Development > Import plugin from manifest.
// The same functions run through the Figma MCP's use_figma, wrapped by
// scripts/figma/use-figma.mjs, so an agent can export and check too.

const round = (n, places) => +n.toFixed(places)
// The key is the ID in the file's link (figma.com/design/<key>); Figma can withhold it.
const file = () => ({ name: figma.root.name, ...(figma.fileKey && { key: figma.fileKey }) })

// ── Export ─────────────────────────────────────────────────────────────────

const exportColor = (c) => ({ r: round(c.r, 5), g: round(c.g, 5), b: round(c.b, 5), a: round(c.a, 4) })

/** A variable's value in one mode as the export writes it. */
function exportValue(value, byId) {
  if (value && value.type === 'VARIABLE_ALIAS') return { alias: byId[value.id].name }
  if (typeof value === 'object') return exportColor(value)
  return value
}

async function exportVariables() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  const variables = await figma.variables.getLocalVariablesAsync()
  const byId = Object.fromEntries(variables.map((v) => [v.id, v]))
  // getLocalVariablesAsync lists variables in creation order; within each
  // collection, follow the order of the variables panel instead, so dragging a
  // variable in Figma reorders the docs. Each collection keeps its slots.
  const queues = Object.fromEntries(collections.map((c) => [c.id, c.variableIds.map((id) => byId[id])]))
  const ordered = variables.map((v) => queues[v.variableCollectionId].shift())
  return {
    file: file(),
    collections: collections.map((c) => ({ name: c.name, modes: c.modes.map((m) => m.name) })),
    variables: ordered.map((v) => {
      const collection = collections.find((c) => c.id === v.variableCollectionId)
      const values = {}
      for (const mode of collection.modes) values[mode.name] = exportValue(v.valuesByMode[mode.modeId], byId)
      return {
        name: v.name,
        collection: collection.name,
        type: v.resolvedType,
        code: v.codeSyntax.WEB || null,
        description: v.description || '',
        scopes: v.scopes,
        values,
      }
    }),
  }
}

// Text styles hold no numeric weight, so it comes from the style name.
const WEIGHTS = {
  thin: 100,
  'extra light': 200,
  light: 300,
  regular: 400,
  medium: 500,
  'semi bold': 600,
  bold: 700,
  'extra bold': 800,
  black: 900,
}
const weightOf = (style) => {
  const key = style
    .toLowerCase()
    .replace('italic', '')
    .replace(/([a-z])(bold|light)/, '$1 $2')
    .replace(/[-_]/g, ' ')
    .trim()
  return WEIGHTS[key || 'regular'] ?? null
}

const exportLineHeight = (lh) => (lh.unit === 'AUTO' ? { unit: 'AUTO' } : { unit: lh.unit, value: round(lh.value, 4) })
const exportLetterSpacing = (ls) => ({ unit: ls.unit, value: round(ls.value, 4) })

async function exportTextStyles() {
  const styles = await figma.getLocalTextStylesAsync()
  return {
    file: file(),
    styles: await Promise.all(
      styles.map(async (s) => ({
        name: s.name,
        description: s.description || '',
        fontFamily: s.fontName.family,
        fontStyle: s.fontName.style,
        fontWeight: weightOf(s.fontName.style),
        fontSize: s.fontSize,
        lineHeight: exportLineHeight(s.lineHeight),
        letterSpacing: exportLetterSpacing(s.letterSpacing),
        // Only when set, such as Label/Field's UPPER.
        ...(s.textCase && s.textCase !== 'ORIGINAL' ? { textCase: s.textCase } : {}),
        boundVariables: await boundNames(s),
      })),
    ),
  }
}

/** A text style's variable bindings as { field: variable name }. */
async function boundNames(style) {
  const bound = {}
  for (const [field, alias] of Object.entries(style.boundVariables ?? {})) {
    bound[field] = (await figma.variables.getVariableByIdAsync(alias.id))?.name ?? alias.id
  }
  return bound
}

// Shadows: Figma variables can't hold one, so each is a Shadow/* effect style
// whose layers' colours are bound to variables.

/** An effect style's drop shadows: offsets and sizes in px, each colour as its variable's name. */
const shadowLayers = (style, byId) =>
  style.effects
    .filter((e) => e.type === 'DROP_SHADOW')
    .map((e) => ({
      x: e.offset.x,
      y: e.offset.y,
      blur: e.radius,
      spread: e.spread ?? 0,
      // An unbound colour is exported as itself, and the build refuses it.
      color: byId[e.boundVariables?.color?.id]?.name ?? exportColor(e.color),
    }))

async function exportEffectStyles() {
  const variables = await figma.variables.getLocalVariablesAsync()
  const byId = Object.fromEntries(variables.map((v) => [v.id, v]))
  const styles = (await figma.getLocalEffectStylesAsync()).filter((s) => s.name.startsWith('Shadow/'))
  return {
    file: file(),
    styles: styles.map((s) => ({ name: s.name, description: s.description || '', layers: shadowLayers(s, byId) })),
  }
}

// ── Check ──────────────────────────────────────────────────────────────────

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const sortedKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))

/** A value as one line of text, for the list of differences. */
function show(value) {
  if (value === undefined) return 'none'
  if (value && value.alias) return `→ ${value.alias}`
  if (value && typeof value === 'object' && 'r' in value) {
    const hex = [value.r, value.g, value.b]
      .map((n) =>
        Math.round(n * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
    return value.a < 1 ? `#${hex} at ${Math.round(value.a * 100)}%` : `#${hex}`
  }
  return typeof value === 'string' ? `"${value}"` : JSON.stringify(value)
}

/** The live file: its collections, variables, text styles and effect styles. */
async function readFile() {
  return {
    collections: await figma.variables.getLocalVariableCollectionsAsync(),
    variables: await figma.variables.getLocalVariablesAsync(),
    textStyles: await figma.getLocalTextStylesAsync(),
    effectStyles: await figma.getLocalEffectStylesAsync(),
  }
}

/** The fields where a text style differs from the repo's, as [field, [figma, repo]]. */
async function textStyleChanges(l, r) {
  const fields = {
    description: [l.description || '', r.description],
    font: [`${l.fontName.family} ${l.fontName.style}`, `${r.fontFamily} ${r.fontStyle}`],
    size: [l.fontSize, r.fontSize],
    'line height': [exportLineHeight(l.lineHeight), r.lineHeight],
    'letter spacing': [exportLetterSpacing(l.letterSpacing), r.letterSpacing],
    case: [l.textCase || 'ORIGINAL', r.textCase || 'ORIGINAL'],
    variables: [sortedKeys(await boundNames(l)), sortedKeys(r.boundVariables ?? {})],
  }
  return Object.entries(fields).filter(([, [a, b]]) => !same(a, b))
}

/**
 * Every difference between the file and the repo, as
 * { kind, name, change: 'missing' | 'extra' | 'differs', field, figma, repo }.
 * `missing` is in the repo but not the file; `extra` is in the file only.
 * Order (of variables, styles and collections) isn't compared.
 */
async function diffTokens(repo) {
  const live = await readFile()
  const out = []
  const add = (entry) => out.push(entry)
  const byId = Object.fromEntries(live.variables.map((v) => [v.id, v]))

  // Collections and their modes.
  const liveCollections = Object.fromEntries(live.collections.map((c) => [c.name, c]))
  const repoCollections = new Set(repo.variables.collections.map((c) => c.name))
  for (const c of repo.variables.collections) {
    const l = liveCollections[c.name]
    if (!l) {
      add({ kind: 'collection', name: c.name, change: 'missing' })
      continue
    }
    const liveModes = l.modes.map((m) => m.name)
    for (const m of c.modes.filter((m) => !liveModes.includes(m)))
      add({ kind: 'collection', name: c.name, change: 'missing', field: `mode ${m}` })
    for (const m of liveModes.filter((m) => !c.modes.includes(m)))
      add({ kind: 'collection', name: c.name, change: 'extra', field: `mode ${m}` })
    const shared = (modes, other) => modes.filter((m) => other.includes(m))
    if (!same(shared(liveModes, c.modes), shared(c.modes, liveModes)))
      // The first mode is the default, so the order matters.
      add({
        kind: 'collection',
        name: c.name,
        change: 'differs',
        field: 'mode order',
        figma: liveModes.join(', '),
        repo: c.modes.join(', '),
      })
  }
  for (const c of live.collections.filter((c) => !repoCollections.has(c.name)))
    add({ kind: 'collection', name: c.name, change: 'extra' })

  // Variables.
  const liveVars = Object.fromEntries(live.variables.map((v) => [v.name, v]))
  const repoVars = new Set(repo.variables.variables.map((v) => v.name))
  for (const r of repo.variables.variables) {
    const l = liveVars[r.name]
    if (!l) {
      add({ kind: 'variable', name: r.name, change: 'missing' })
      continue
    }
    const collection = live.collections.find((c) => c.id === l.variableCollectionId)
    const blocked = (field, figmaValue, repoValue) =>
      add({
        kind: 'variable',
        name: r.name,
        change: 'differs',
        field,
        figma: figmaValue,
        repo: repoValue,
      })
    if (collection.name !== r.collection) {
      blocked('collection', collection.name, r.collection)
      continue
    }
    if (l.resolvedType !== r.type) {
      blocked('type', l.resolvedType, r.type)
      continue
    }
    const differs = (field, figmaValue, repoValue) =>
      !same(figmaValue, repoValue) &&
      add({ kind: 'variable', name: r.name, change: 'differs', field, figma: show(figmaValue), repo: show(repoValue) })
    differs('code', l.codeSyntax.WEB || null, r.code)
    differs('description', l.description || '', r.description)
    // An export from before scopes were exported has none to compare.
    if (r.scopes) differs('scopes', [...l.scopes].sort(), [...r.scopes].sort())
    for (const mode of collection.modes) {
      if (!(mode.name in r.values)) continue
      differs(`value in ${mode.name}`, exportValue(l.valuesByMode[mode.modeId], byId), r.values[mode.name])
    }
  }
  for (const l of live.variables.filter((v) => !repoVars.has(v.name)))
    add({ kind: 'variable', name: l.name, change: 'extra' })

  // Text styles.
  const liveStyles = Object.fromEntries(live.textStyles.map((s) => [s.name, s]))
  const repoStyles = new Set(repo.textStyles.styles.map((s) => s.name))
  for (const r of repo.textStyles.styles) {
    const l = liveStyles[r.name]
    if (!l) {
      add({ kind: 'text style', name: r.name, change: 'missing' })
      continue
    }
    for (const [field, [figmaValue, repoValue]] of await textStyleChanges(l, r))
      add({
        kind: 'text style',
        name: r.name,
        change: 'differs',
        field,
        figma: show(figmaValue),
        repo: show(repoValue),
      })
  }
  for (const l of live.textStyles.filter((s) => !repoStyles.has(s.name)))
    add({ kind: 'text style', name: l.name, change: 'extra' })

  // Shadows: the Shadow/* effect styles against effect-styles.json.
  const shadows = repo.effectStyles.styles
  const liveEffects = Object.fromEntries(live.effectStyles.map((s) => [s.name, s]))
  const colour = (c) => (typeof c === 'string' ? `{${c}}` : show(c))
  const text = (layers) => layers.map((s) => `${s.x} ${s.y} ${s.blur} ${s.spread} ${colour(s.color)}`).join(', ')
  for (const r of shadows) {
    const l = liveEffects[r.name]
    if (!l) {
      add({ kind: 'effect style', name: r.name, change: 'missing' })
      continue
    }
    const layers = shadowLayers(l, byId)
    if (!same(layers, r.layers) || l.effects.length !== layers.length)
      add({
        kind: 'effect style',
        name: r.name,
        change: 'differs',
        field: 'shadow',
        figma: text(layers),
        repo: text(r.layers),
      })
    if ((l.description || '') !== r.description)
      add({
        kind: 'effect style',
        name: r.name,
        change: 'differs',
        field: 'description',
        figma: show(l.description || ''),
        repo: show(r.description),
      })
  }
  const shadowNames = new Set(shadows.map((s) => s.name))
  for (const l of live.effectStyles.filter((s) => s.name.startsWith('Shadow/') && !shadowNames.has(s.name)))
    add({ kind: 'effect style', name: l.name, change: 'extra' })

  return out
}

/** Refuse to touch a file that isn't the one the repo was exported from. */
function assertSameFile(repo) {
  const key = repo.variables.file && repo.variables.file.key
  if (key && figma.fileKey && key !== figma.fileKey)
    throw new Error(`These tokens come from file ${key}; this is ${figma.fileKey}.`)
}

/** Check: the differences, with a count, for the plugin or an agent. */
async function checkTokens(repo) {
  assertSameFile(repo)
  const diff = await diffTokens(repo)
  return { file: file(), inSync: diff.length === 0, count: diff.length, diff }
}

// ── The plugin ─────────────────────────────────────────────────────────────

// Through use_figma there's no UI: scripts/figma/use-figma.mjs calls the export or checkTokens itself.
if (typeof __html__ === 'string') {
  figma.showUI(__html__, { width: 480, height: 560, themeColors: true })
  const send = (message) => figma.ui.postMessage(message)
  const fail = (error) => send({ type: 'error', error: String((error && error.message) || error) })

  Promise.all([exportVariables(), exportTextStyles(), exportEffectStyles()])
    .then(([variables, textStyles, effectStyles]) =>
      send({
        type: 'export',
        files: {
          'variables.json': JSON.stringify(variables, null, 2),
          'text-styles.json': JSON.stringify(textStyles, null, 2),
          'effect-styles.json': JSON.stringify(effectStyles, null, 2),
        },
      }),
    )
    .catch(fail)

  figma.ui.onmessage = (message) => {
    if (message.type !== 'check') return
    checkTokens(message.repo)
      .then((result) => send({ type: 'check', ...result }))
      .catch(fail)
  }
}
