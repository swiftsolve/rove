// Rove Tokens: keeps the Rove Design System file and the rove-tokens repo in step.
//
// - Export writes the file's variables and text styles in the shapes
//   src/figma/variables.json and src/figma/text-styles.json hold.
// - Check lists every difference between the file and a copy of the repo's
//   tokens: those two files plus src/code-tokens.json, whose shadows are the
//   file's Shadow/* effect styles.
// - Apply makes the file match that copy.
//
// Run from Figma desktop: Plugins > Development > Import plugin from manifest.
// The same functions run through the Figma MCP's use_figma, wrapped by
// scripts/figma/script.mjs, so an agent can check and apply too.

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
        // Only when set, such as Overline's UPPER.
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

// ── The repo's shadows ─────────────────────────────────────────────────────

/** `--shadow-panel` is the effect style `Shadow/Panel`. */
const shadowStyleName = (token) =>
  'Shadow/' + token.replace(/^--shadow-/, '').replace(/(^|-)(\w)/g, (_, dash, c) => (dash ? ' ' : '') + c.toUpperCase())

const SHADOW_LAYER = /^(-?[\d.]+)(?:px)? (-?[\d.]+)(?:px)? ([\d.]+)(?:px)?(?: (-?[\d.]+)(?:px)?)? \{([\w/-]+)\}$/

/**
 * code-tokens.json's `--shadow-*` tokens as effect styles: each layer is
 * `x y blur [spread] {colour variable}`, in px.
 */
function repoShadows(codeTokens) {
  const shadows = []
  for (const [token, value] of Object.entries(codeTokens?.tokens ?? {})) {
    if (!token.startsWith('--shadow-')) continue
    const layers = value.split(/,\s*(?![^(]*\))/).map((layer) => {
      const match = layer.trim().match(SHADOW_LAYER)
      if (!match) throw new Error(`${token}: can't read the shadow layer "${layer.trim()}"`)
      const [, x, y, blur, spread, color] = match
      return { x: +x, y: +y, blur: +blur, spread: +(spread ?? 0), color }
    })
    shadows.push({ name: shadowStyleName(token), token, layers })
  }
  return shadows
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

/** A Shadow/* effect style's drop shadows in the shape repoShadows gives. */
const shadowLayers = (style, byId) =>
  style.effects
    .filter((e) => e.type === 'DROP_SHADOW')
    .map((e) => ({
      x: e.offset.x,
      y: e.offset.y,
      blur: e.radius,
      spread: e.spread ?? 0,
      color: byId[e.boundVariables?.color?.id]?.name ?? show(e.color),
    }))

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
 * { kind, name, change: 'missing' | 'extra' | 'differs', field, figma, repo, fixable }.
 * `missing` is in the repo but not the file; `extra` is in the file only.
 * Order (of variables, styles and collections) isn't compared.
 */
async function diffTokens(repo) {
  const live = await readFile()
  const out = []
  const add = (entry) => out.push({ fixable: true, ...entry })
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
      // The first mode is the default, and the Plugin API can't reorder modes.
      add({
        kind: 'collection',
        name: c.name,
        change: 'differs',
        field: 'mode order',
        figma: liveModes.join(', '),
        repo: c.modes.join(', '),
        fixable: false,
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
        fixable: false,
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

  // Shadows: the Shadow/* effect styles against code-tokens.json.
  const shadows = repoShadows(repo.codeTokens)
  const liveEffects = Object.fromEntries(live.effectStyles.map((s) => [s.name, s]))
  const text = (layers) => layers.map((s) => `${s.x} ${s.y} ${s.blur} ${s.spread} {${s.color}}`).join(', ')
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

// ── Apply ──────────────────────────────────────────────────────────────────

/** A repo value as a value Figma's setValueForMode takes. */
function figmaValue(value, liveVars) {
  if (value && value.alias) {
    const target = liveVars[value.alias]
    if (!target) throw new Error(`Alias to unknown variable ${value.alias}`)
    return figma.variables.createVariableAlias(target)
  }
  if (value && typeof value === 'object') return { r: value.r, g: value.g, b: value.b, a: value.a }
  return value
}

/**
 * Make the file match the repo. Creates and updates collections, modes,
 * variables, text styles and Shadow/* effect styles; with `prune`, also removes
 * what the repo doesn't have. Returns what it did and what still differs.
 */
async function applyTokens(repo, { prune = false } = {}) {
  assertSameFile(repo)
  const done = []
  const live = await readFile()

  // Collections and modes first, so every variable has somewhere to go.
  const collections = Object.fromEntries(live.collections.map((c) => [c.name, c]))
  for (const c of repo.variables.collections) {
    let collection = collections[c.name]
    if (!collection) {
      collection = figma.variables.createVariableCollection(c.name)
      collection.renameMode(collection.modes[0].modeId, c.modes[0])
      collections[c.name] = collection
      done.push(`Created collection ${c.name}`)
    }
    for (const mode of c.modes.filter((m) => !collection.modes.some((l) => l.name === m))) {
      collection.addMode(mode)
      done.push(`Added mode ${mode} to ${c.name}`)
    }
  }

  // Then variables: create the missing ones, then set every field, so an alias
  // can point at a variable created in the same run.
  const liveVars = Object.fromEntries(live.variables.map((v) => [v.name, v]))
  for (const r of repo.variables.variables.filter((r) => !liveVars[r.name])) {
    liveVars[r.name] = figma.variables.createVariable(r.name, collections[r.collection], r.type)
    done.push(`Created variable ${r.name}`)
  }
  const byId = Object.fromEntries(Object.values(liveVars).map((v) => [v.id, v]))
  for (const r of repo.variables.variables) {
    const v = liveVars[r.name]
    const collection = collections[r.collection]
    // A variable can't move collection or change type; Check reports those.
    if (v.variableCollectionId !== collection.id || v.resolvedType !== r.type) continue
    const changed = []
    if ((v.description || '') !== r.description) {
      v.description = r.description
      changed.push('description')
    }
    if ((v.codeSyntax.WEB || null) !== r.code) {
      if (r.code) v.setVariableCodeSyntax('WEB', r.code)
      else v.removeVariableCodeSyntax('WEB')
      changed.push('code')
    }
    if (r.scopes && !same([...v.scopes].sort(), [...r.scopes].sort())) {
      v.scopes = r.scopes
      changed.push('scopes')
    }
    for (const mode of collection.modes) {
      if (!(mode.name in r.values)) continue
      if (same(exportValue(v.valuesByMode[mode.modeId], byId), r.values[mode.name])) continue
      v.setValueForMode(mode.modeId, figmaValue(r.values[mode.name], liveVars))
      changed.push(`value in ${mode.name}`)
    }
    if (changed.length) done.push(`Updated ${r.name}: ${changed.join(', ')}`)
  }

  // Text styles.
  const liveStyles = Object.fromEntries(live.textStyles.map((s) => [s.name, s]))
  for (const r of repo.textStyles.styles) {
    let style = liveStyles[r.name]
    const changes = style ? (await textStyleChanges(style, r)).map(([field]) => field) : []
    if (style && !changes.length) continue
    if (!style) {
      style = figma.createTextStyle()
      style.name = r.name
    }
    // Setting a raw value unbinds its variable, so rebind them all after.
    const fontName = { family: r.fontFamily, style: r.fontStyle }
    await figma.loadFontAsync(style.fontName)
    await figma.loadFontAsync(fontName)
    if (!same(style.fontName, fontName)) style.fontName = fontName
    style.description = r.description
    style.fontSize = r.fontSize
    style.lineHeight = r.lineHeight
    style.letterSpacing = r.letterSpacing
    style.textCase = r.textCase || 'ORIGINAL'
    const bound = r.boundVariables ?? {}
    for (const field of Object.keys(style.boundVariables ?? {})) if (!bound[field]) style.setBoundVariable(field, null)
    for (const [field, name] of Object.entries(bound)) {
      if (!liveVars[name]) throw new Error(`${r.name}: binds unknown variable ${name}`)
      style.setBoundVariable(field, liveVars[name])
    }
    done.push(changes.length ? `Updated text style ${r.name}: ${changes.join(', ')}` : `Created text style ${r.name}`)
  }

  // Shadows, only where they differ: rewriting a style's effects resets what the repo doesn't hold.
  const shadows = repoShadows(repo.codeTokens)
  const liveEffects = Object.fromEntries(live.effectStyles.map((s) => [s.name, s]))
  for (const r of shadows) {
    let style = liveEffects[r.name]
    if (style && same(shadowLayers(style, byId), r.layers) && style.effects.length === r.layers.length) continue
    const behind = style?.effects[0]?.showShadowBehindNode ?? true
    if (!style) {
      style = figma.createEffectStyle()
      style.name = r.name
      done.push(`Created effect style ${r.name}`)
    } else done.push(`Updated effect style ${r.name}`)
    style.effects = r.layers.map((layer) => {
      const variable = liveVars[layer.color]
      if (!variable) throw new Error(`${r.token}: unknown colour variable ${layer.color}`)
      const collection = Object.values(collections).find((c) => c.id === variable.variableCollectionId)
      const resolved = variable.valuesByMode[collection.defaultModeId]
      const effect = {
        type: 'DROP_SHADOW',
        visible: true,
        blendMode: 'NORMAL',
        showShadowBehindNode: behind,
        offset: { x: layer.x, y: layer.y },
        radius: layer.blur,
        spread: layer.spread,
        // The binding sets the colour; this is its value until Figma resolves it.
        color: resolved && 'r' in resolved ? resolved : { r: 0, g: 0, b: 0, a: 0.2 },
      }
      return figma.variables.setBoundVariableForEffect(effect, 'color', variable)
    })
  }

  if (prune) {
    const styleNames = new Set(repo.textStyles.styles.map((s) => s.name))
    for (const s of live.textStyles.filter((s) => !styleNames.has(s.name))) {
      s.remove()
      done.push(`Removed text style ${s.name}`)
    }
    const shadowNames = new Set(shadows.map((s) => s.name))
    for (const s of live.effectStyles.filter((s) => s.name.startsWith('Shadow/') && !shadowNames.has(s.name))) {
      s.remove()
      done.push(`Removed effect style ${s.name}`)
    }
    const varNames = new Set(repo.variables.variables.map((v) => v.name))
    for (const v of live.variables.filter((v) => !varNames.has(v.name))) {
      v.remove()
      done.push(`Removed variable ${v.name}`)
    }
    const repoCollections = Object.fromEntries(repo.variables.collections.map((c) => [c.name, c]))
    for (const c of live.collections) {
      const r = repoCollections[c.name]
      if (!r) {
        c.remove()
        done.push(`Removed collection ${c.name}`)
        continue
      }
      for (const m of c.modes.filter((m) => !r.modes.includes(m.name))) {
        c.removeMode(m.modeId)
        done.push(`Removed mode ${m.name} from ${c.name}`)
      }
    }
  }

  const diff = await diffTokens(repo)
  return { file: file(), done, inSync: diff.length === 0, count: diff.length, diff }
}

// ── The plugin ─────────────────────────────────────────────────────────────

// Through use_figma there's no UI: scripts/figma/script.mjs calls checkTokens or applyTokens itself.
if (typeof __html__ === 'string') {
  figma.showUI(__html__, { width: 480, height: 560, themeColors: true })
  const send = (message) => figma.ui.postMessage(message)
  const fail = (error) => send({ type: 'error', error: String((error && error.message) || error) })

  Promise.all([exportVariables(), exportTextStyles()])
    .then(([variables, textStyles]) =>
      send({
        type: 'export',
        files: {
          'variables.json': JSON.stringify(variables, null, 2),
          'text-styles.json': JSON.stringify(textStyles, null, 2),
        },
      }),
    )
    .catch(fail)

  figma.ui.onmessage = (message) => {
    const run =
      message.type === 'check'
        ? checkTokens(message.repo)
        : message.type === 'apply'
          ? applyTokens(message.repo, { prune: message.prune })
          : null
    if (run) run.then((result) => send({ type: message.type, ...result })).catch(fail)
  }
}
