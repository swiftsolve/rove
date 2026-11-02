/**
 * Export the main pages of the Rove Design System Figma file as a static HTML
 * presentation: one slide per top-level frame, grouped by page.
 *
 *   npm run present                                      # -> presentation/
 *   npm run present -- --out /tmp/deck
 *   npm run present -- --sections FOUNDATIONS,COMPONENTS
 *   npm run present -- --format png --scale 2            # bitmaps instead of SVG
 *
 * `npm run present` builds the tokens first: the page is styled with
 * tokens.css, so its chrome matches the app.
 *
 * SVG is the default: sharp at any zoom and small for flat UI. Text is
 * outlined, so slides look right without Rove's fonts installed. PNG or JPG
 * suit pages heavy with photos or blur, which bloat an SVG.
 *
 * FIGMA_TOKEN is a personal access token with the `file_content:read` scope
 * (Figma → Settings → Security → Personal access tokens). Put it in
 * `.env.local` as `FIGMA_TOKEN=figd_…` (git-ignored), or set it in the shell,
 * which wins.
 *
 * Figma stays the source of truth: the output is a snapshot, so rerun the
 * script whenever the file changes. Each run replaces the previous export.
 *
 * The file's page list uses divider pages (COVER, FOUNDATIONS, …) with the
 * real pages under each one, prefixed "↳". A section is a divider plus the
 * pages under it. Top-level frames become slides; Figma sections such as
 * "Main components" are the component sheets, not presentation pages — unless
 * a page has no loose frames (the screens are laid out in one section), in
 * which case each section is a slide.
 */
import { Buffer } from 'node:buffer'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const API = 'https://api.figma.com/v1'

/** FIGMA_TOKEN from the shell, else from the git-ignored .env.local. */
async function readToken() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN
  const env = await readFile(join(ROOT, '.env.local'), 'utf8').catch(() => '')
  return env.match(/^\s*FIGMA_TOKEN\s*=\s*["']?([^"'\s]+)/m)?.[1]
}

function flag(name, fallback) {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : process.argv[at + 1]
}

const fileKey = flag('file', 'NoICIoyhWNOya9tOnNfEhH')
const out = resolve(ROOT, flag('out', 'presentation'))
const format = flag('format', 'svg')
const scale = Number(flag('scale', '2'))
const sections = flag('sections', 'COVER,FOUNDATIONS,COMPONENTS,SCREENS').split(',').map((name) => name.trim().toUpperCase())
const token = await readToken()

if (!['svg', 'png', 'jpg'].includes(format)) {
  console.error(`--format must be svg, png or jpg, not "${format}".`)
  process.exit(1)
}
if (!token) {
  console.error('Add FIGMA_TOKEN=<token> to .env.local: a Figma personal access token with the file_content:read scope.')
  process.exit(1)
}

/** GET a Figma API path, waiting out rate limits instead of failing on them. */
async function figma(path, attempt = 1) {
  const response = await fetch(`${API}${path}`, { headers: { 'X-Figma-Token': token } })
  if (response.status === 429 && attempt <= 3) {
    const seconds = Number(response.headers.get('retry-after')) || 30
    console.log(`Rate limited, retrying in ${seconds}s…`)
    await new Promise((ok) => setTimeout(ok, seconds * 1000))
    return figma(path, attempt + 1)
  }
  if (!response.ok) throw new Error(`Figma API ${response.status} on ${path}: ${await response.text()}`)
  return response.json()
}

const isSubpage = (page) => page.name.startsWith('↳')
const pageTitle = (page) => page.name.replace(/^↳\s*/, '')
const isSameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()
const slugify = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** Group pages under their divider, keeping only the sections asked for. */
function groupPages(pages) {
  const groups = []
  for (const page of pages) {
    if (!isSubpage(page)) groups.push({ name: page.name, pages: [] })
    // A divider with content of its own (COVER) is a page too.
    groups.at(-1)?.pages.push(page)
  }
  return groups
    .filter((group) => sections.includes(group.name.trim().toUpperCase()))
    .map((group) => ({
      name: group.name,
      pages: group.pages
        .map((page) => {
          const visible = (page.children ?? []).filter((node) => node.visible !== false)
          const frames = visible.filter((node) => node.type === 'FRAME')
          return {
            title: pageTitle(page),
            isDivider: !isSubpage(page),
            frames: frames.length > 0 ? frames : visible.filter((node) => node.type === 'SECTION'),
          }
        })
        .filter((page) => page.frames.length > 0),
    }))
    .filter((group) => group.pages.length > 0)
}

/** Render frames to image URLs, a few at a time: big batches time out. */
async function renderFrames(ids, as = format) {
  const urls = {}
  for (let i = 0; i < ids.length; i += 8) {
    const batch = ids.slice(i, i + 8)
    const { err, images } = await figma(`/images/${fileKey}?ids=${batch.join(',')}&format=${as}${as === 'svg' ? '' : `&scale=${scale}`}`)
    if (err) throw new Error(`Figma couldn't render frames: ${err}`)
    Object.assign(urls, images)
  }
  return urls
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

/** Lucide icons (lucide.dev, ISC licence), inlined so the package keeps no dependencies. */
const LUCIDE = {
  BookOpen: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  Check: '<path d="M20 6 9 17l-5-5"/>',
  ChevronDown: '<path d="m6 9 6 6 6-6"/>',
  ChevronLeft: '<path d="m15 18-6-6 6-6"/>',
  ChevronRight: '<path d="m9 18 6-6-6-6"/>',
  Component: '<path d="M15.536 11.293a1 1 0 0 0 0 1.414l2.376 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z"/><path d="M2.297 11.293a1 1 0 0 0 0 1.414l2.377 2.377a1 1 0 0 0 1.414 0l2.377-2.377a1 1 0 0 0 0-1.414L6.088 8.916a1 1 0 0 0-1.414 0z"/><path d="M8.916 17.912a1 1 0 0 0 0 1.415l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.415l-2.377-2.376a1 1 0 0 0-1.414 0z"/><path d="M8.916 4.674a1 1 0 0 0 0 1.414l2.377 2.376a1 1 0 0 0 1.414 0l2.377-2.376a1 1 0 0 0 0-1.414l-2.377-2.377a1 1 0 0 0-1.414 0z"/>',
  Folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  Menu: '<path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/>',
  Minus: '<path d="M5 12h14"/>',
  Monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  Palette: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  Plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
}
const icon = (name, size = 16) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LUCIDE[name]}</svg>`

const SECTION_ICONS = { COVER: 'BookOpen', FOUNDATIONS: 'Palette', COMPONENTS: 'Component', SCREENS: 'Monitor' }
const sectionName = (group) => group.name.trim().charAt(0) + group.name.trim().slice(1).toLowerCase()
/** The Rove Mark with the app icon's blue — same geometry as the app's BrandIcon. */
const ROVE_MARK = `<svg width="28" height="28" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <defs><linearGradient id="rove-mark" x1="24" y1="7" x2="24" y2="41" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7aa4ff"/><stop offset="1" stop-color="#5484f5"/></linearGradient></defs>
        <circle cx="24" cy="24" r="7.5" fill="url(#rove-mark)"/>
        <path d="M 11.98 36.02 A 17 17 0 1 1 36.02 36.02" stroke="url(#rove-mark)" stroke-width="5" stroke-linecap="round"/>
      </svg>`

const sectionLabel = (group) => `${icon(SECTION_ICONS[group.name.trim().toUpperCase()] ?? 'Folder')}<span>${escapeHtml(sectionName(group))}</span>`

function renderHtml(file, groups, tokens, version) {
  const slides = groups.flatMap((group) => group.pages.flatMap((page) => page.frames.map((frame) => ({ group, page, frame }))))
  const indexOf = (frame) => slides.findIndex((slide) => slide.frame === frame)
  const link = (frame, html, className) => `<a class="${className}" href="#${indexOf(frame) + 1}" data-index="${indexOf(frame)}">${html}</a>`
  const date = (value) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const tree = (items) => (items.length > 0 ? `<div class="tree">${items.join('')}</div>` : '')

  // A divider's cover is reached from the section name rather than a "Cover"
  // link of its own. Pages hang off the section on a guide line; a page with
  // several slides gets a nested line of its own.
  const nav = groups.map((group) => {
    const [cover, ...extras] = group.pages.find((page) => page.isDivider)?.frames ?? []
    const heading = cover ? link(cover, sectionLabel(group), 'group') : `<p class="group">${sectionLabel(group)}</p>`
    const pages = group.pages.filter((page) => !page.isDivider).map((page) => (page.frames.length === 1
      ? link(page.frames[0], escapeHtml(page.title), 'page')
      : `<p class="page">${escapeHtml(page.title)}</p>${tree(page.frames.map((frame) => link(frame, escapeHtml(frame.name), 'page')))}`))
    return `
      <section>${heading}${tree([...extras.map((frame) => link(frame, escapeHtml(frame.name), 'page')), ...pages])}</section>`
  }).join('')

  // Section › page › slide. Every step but the last links back up the tree.
  const crumbs = (group, page, frame) => {
    const steps = [{ html: escapeHtml(sectionName(group)), to: group.pages.find((other) => other.isDivider)?.frames[0] }]
    if (!page.isDivider) steps.push({ html: escapeHtml(page.title), to: page.frames[0] })
    if (page.frames.length > 1 && !isSameName(frame.name, page.title)) steps.push({ html: escapeHtml(frame.name), to: frame })
    return steps.map((step, i) => (i < steps.length - 1 && step.to
      ? link(step.to, step.html, 'crumb')
      : `<span class="crumb"${i === steps.length - 1 ? ' aria-current="page"' : ''}>${step.html}</span>`))
      .join(`<span class="sep">${icon('ChevronRight', 14)}</span>`)
  }

  const trails = slides.map(({ group, page, frame }, index) => `
      <p class="crumbs" data-index="${index}" hidden>${crumbs(group, page, frame)}</p>`).join('')

  const figures = slides.map(({ frame }, index) => `
    <figure class="slide" data-index="${index}" data-width="${Math.round(frame.absoluteBoundingBox.width)}" data-ratio="${(frame.absoluteBoundingBox.width / frame.absoluteBoundingBox.height).toFixed(4)}" hidden>
      <img src="frames/${frame.file}" alt="${escapeHtml(frame.name)}" width="${Math.round(frame.absoluteBoundingBox.width)}" height="${Math.round(frame.absoluteBoundingBox.height)}" loading="lazy">
    </figure>`).join('')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(file.name)}</title>
<style>
${tokens}
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  /* One gap above and below the slide, so the page is framed evenly. */
  body { --page-gap: 64px; --page-pad: 32px; }
  /* Sidebar down the left; the top bar sits outside the scrolling area so it stays put when a zoomed slide scrolls. */
  body { margin: 0; display: grid; grid-template-columns: 240px 1fr; grid-template-rows: auto 1fr; height: 100vh; height: 100dvh; background: var(--bg-base); color: var(--text-primary); font: 13px/1.45 var(--font-family-sans); -webkit-font-smoothing: antialiased; }
  nav, main { overflow: auto; scrollbar-width: thin; scrollbar-color: var(--fill-strong) transparent; }
  nav { grid-row: 1 / 3; padding: 20px 10px 32px; background: var(--bg-surface); border-right: 1px solid var(--border-default); }
  /* Negative margins so the divider runs edge to edge of the sidebar. */
  nav > header { margin: 0 -10px; padding: 0 20px 18px; border-bottom: 1px solid var(--border-default); }
  nav h1 { margin: 0 0 2px; font-size: 14px; font-weight: 600; }
  nav .logo { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; font-size: 22px; font-weight: 600; letter-spacing: -.01em; }
  nav .meta { margin: 0; color: var(--text-tertiary); font-size: 12px; }
  nav section { padding-top: 12px; }
  nav section a, nav section p { display: flex; align-items: center; gap: 8px; margin: 1px 0; padding: 5px 8px; border-radius: 6px; color: var(--text-secondary); text-decoration: none; }
  nav .group { color: var(--text-primary); font-weight: 600; }
  nav .group svg { flex-shrink: 0; color: var(--text-tertiary); }
  nav .group[aria-current] svg { color: var(--accent-default); }
  /* The guide line runs down from the centre of the section icon. */
  nav .tree { margin: 2px 0 6px 15.5px; padding-left: 8px; border-left: 1px solid var(--border-strong); }
  nav .tree .tree { margin: 0 0 2px 8px; }
  nav p.page { color: var(--text-tertiary); }
  nav a:hover { background: var(--fill-subtle); color: var(--text-primary); }
  nav a[aria-current] { background: var(--bg-hover); color: var(--text-primary); }
  /* A near-black gray canvas, between the panels and the app backdrop. */
  main { display: flex; flex-direction: column; padding: var(--page-gap) var(--page-pad); background: var(--bg-base); }
  /* The page script sets each slide's width from the zoom. */
  /* Auto margins centre the slide both ways when there's room, and fall back to the top-left edge (still scrollable) when it's bigger than the canvas. */
  figure { flex-shrink: 0; margin: auto; }
  /* A top bar across the content area, like the sidebar's panel. */
  .bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 58px; padding: 0 var(--page-pad); background: var(--bg-surface); border-bottom: 1px solid var(--border-default); }
  /* Zoom: − [90% ▾] + floating in the bottom-right corner, with a menu of fit options, as in Figma. */
  .zoom { position: fixed; right: 24px; bottom: 24px; z-index: 2; display: flex; align-items: center; gap: 2px; padding: 3px; background: var(--bg-surface); border: 1px solid var(--border-strong); border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / .45); }
  .zoom > button { display: flex; align-items: center; justify-content: center; gap: 4px; height: 28px; min-width: 28px; padding: 0 6px; border: 0; border-radius: 7px; background: none; color: var(--text-secondary); font: inherit; font-size: 12px; cursor: pointer; }
  .zoom > button:hover, .zoom .level[aria-expanded="true"] { background: var(--fill-subtle); color: var(--text-primary); }
  /* Hugs its content, so the number sits as close to − and + as they sit to the edges. The number keeps a steady width as it changes. */
  .zoom .level { padding: 0 4px 0 6px; color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .zoom .value { min-width: 4.5ch; text-align: center; }
  .zoom .level svg { color: var(--text-tertiary); }
  .zoom .menu { position: absolute; right: 0; bottom: calc(100% + 6px); width: 100%; padding: 3px; background: var(--bg-surface); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: 0 8px 24px rgb(0 0 0 / .45); }
  .zoom .menu[hidden] { display: none; }
  .zoom .menu button { display: flex; align-items: center; gap: 6px; width: 100%; height: 26px; padding: 0 8px 0 6px; border: 0; border-radius: 5px; background: none; color: var(--text-primary); font: inherit; font-size: 12px; text-align: left; cursor: pointer; }
  .zoom .menu button:hover, .zoom .menu button:focus-visible { background: var(--bg-hover); outline: none; }
  .zoom .menu svg { flex-shrink: 0; color: var(--accent-default); visibility: hidden; }
  .zoom .menu [aria-checked="true"] svg { visibility: visible; }
  .trails { min-width: 0; }
  /* The menu button and the slide arrows are for phones, which have no sidebar or arrow keys. */
  .bar > button { display: none; flex-shrink: 0; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 8px; background: none; color: var(--text-secondary); cursor: pointer; }
  .bar > button:hover { background: var(--fill-subtle); color: var(--text-primary); }
  .bar > button:disabled { background: none; color: var(--text-tertiary); opacity: .5; cursor: default; }
  .crumbs[hidden] { display: none; }
  .crumbs { display: flex; align-items: center; gap: 6px; min-width: 0; margin: 0; white-space: nowrap; overflow: hidden; }
  .crumb { display: flex; align-items: center; gap: 6px; color: var(--text-secondary); text-decoration: none; }
  a.crumb:hover { color: var(--text-primary); }
  .crumb[aria-current] { color: var(--text-primary); font-weight: 600; }
  .sep { display: flex; color: var(--text-tertiary); }
  img { display: block; width: 100%; height: auto; border-radius: 8px; }
  /* On a touch screen one finger scrolls; two zoom the slide (the page script), never the whole page. Set on the root, at
     every width, so a pinch that starts on the top bar or with the phone on its side can't zoom the page either. */
  html { touch-action: pan-x pan-y; }
  @media (max-width: 760px) {
    body { --page-gap: 24px; --page-pad: 16px; grid-template-columns: 1fr; }
    /* The sidebar becomes a drawer over the slide, opened from the top bar. */
    nav { position: fixed; inset: 0 auto 0 0; z-index: 4; width: min(280px, 85vw); padding-bottom: calc(32px + env(safe-area-inset-bottom)); box-shadow: 0 8px 24px rgb(0 0 0 / .45); transform: translateX(-100%); visibility: hidden; transition: transform .2s ease, visibility 0s .2s; }
    body.is-nav-open nav { transform: none; visibility: visible; transition: transform .2s ease; }
    .scrim { position: fixed; inset: 0; z-index: 3; background: rgb(0 0 0 / .5); }
    .bar { gap: 4px; min-height: 52px; padding: 0 8px; }
    .bar > button { display: flex; }
    .trails { flex: 1; }
    /* Pinching replaces the zoom toolbar. */
    .zoom { display: none; }
  }
  @media (max-width: 760px) and (prefers-reduced-motion: reduce) {
    nav, body.is-nav-open nav { transition: none; }
  }
</style>
</head>
<body>
  <nav id="pages">
    <header>
      <p class="logo">${ROVE_MARK}<span>Rove</span></p>
      <h1>${escapeHtml(file.name.replace(/^Rove\s+/, ''))}</h1>
      <p class="meta" title="Exported ${date(Date.now())}">v${escapeHtml(version)} · Edited ${date(file.lastModified)}</p>
    </header>${nav}
  </nav>
  <header class="bar">
    <button type="button" class="menu-button" aria-label="Pages" aria-controls="pages" aria-expanded="false">${icon('Menu', 18)}</button>
    <div class="trails">${trails}
    </div>
    <button type="button" data-step="-1" aria-label="Previous slide">${icon('ChevronLeft', 18)}</button>
    <button type="button" data-step="1" aria-label="Next slide">${icon('ChevronRight', 18)}</button>
  </header>
  <div class="scrim" hidden></div>
  <main>${figures}
  </main>
  <div class="zoom" role="group" aria-label="Zoom">
    <button type="button" data-zoom="out" title="Zoom out (−)" aria-label="Zoom out">${icon('Minus', 14)}</button>
    <button type="button" class="level" aria-haspopup="menu" aria-expanded="false" title="Zoom options"><span class="value">100%</span>${icon('ChevronDown', 12)}</button>
    <button type="button" data-zoom="in" title="Zoom in (+)" aria-label="Zoom in">${icon('Plus', 14)}</button>
    <div class="menu" role="menu" hidden>
      <button type="button" role="menuitemradio" data-zoom="fit">${icon('Check', 12)}<span>Fit</span></button>
      <button type="button" role="menuitemradio" data-zoom="width">${icon('Check', 12)}<span>Fit width</span></button>
    </div>
  </div>
<script>
  const slides = [...document.querySelectorAll('.slide')]
  const links = [...document.querySelectorAll('nav a')]
  const trails = [...document.querySelectorAll('.bar .crumbs')]
  const toolbar = document.querySelector('.zoom')
  const menu = toolbar.querySelector('.menu')
  const levelButton = toolbar.querySelector('.level')
  const value = levelButton.querySelector('.value')
  const choices = [...menu.querySelectorAll('[role=menuitemradio]')]
  const main = document.querySelector('main')
  const menuButton = document.querySelector('.menu-button')
  const scrim = document.querySelector('.scrim')
  const stepButtons = [...document.querySelectorAll('[data-step]')]
  const STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 2, 3, 4]

  let current = 0
  // 'fit', 'width' or a scale (1 = the frame's size in Figma). It carries over
  // when you change slides. Until you pick one, landscape slides fit the screen
  // and tall pages show at their Figma width, shrunk if the window is narrower.
  let zoom = null
  let scale = 1

  function layout() {
    const slide = slides[current]
    const width = Number(slide.dataset.width)
    const ratio = Number(slide.dataset.ratio)
    const style = getComputedStyle(document.body)
    const pad = parseFloat(style.getPropertyValue('--page-pad'))
    const gap = parseFloat(style.getPropertyValue('--page-gap'))
    const fitWidth = (main.clientWidth - 2 * pad) / width
    const fit = Math.min(fitWidth, ((main.clientHeight - 2 * gap) * ratio) / width)
    const mode = zoom ?? (ratio > 1 ? 'fit' : Math.min(1, fitWidth))
    scale = mode === 'fit' ? fit : mode === 'width' ? fitWidth : mode
    slide.style.width = Math.round(width * scale) + 'px'
    value.textContent = Math.round(scale * 100) + '%'
    // Tick the fit option in effect, if any.
    choices.forEach((choice) => choice.setAttribute('aria-checked', String(choice.dataset.zoom === String(mode))))
  }

  function setZoom(next) {
    zoom = typeof next === 'number' ? Math.min(Math.max(next, STEPS[0]), STEPS.at(-1)) : next
    layout()
  }

  const isReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

  // Zoom keeping the point under (x, y) still: by default the middle of the
  // canvas, for a pinch the pointer. The slide jumps straight to its new size and
  // a transform eases it there from the old one, so the big image is redrawn
  // once instead of on every frame of a width animation.
  function zoomAround(next, x, y, isAnimated = true) {
    const before = slides[current].getBoundingClientRect()
    zoomKeeping(next, (x - before.left) / before.width, (y - before.top) / before.height, x, y, before, isAnimated)
  }

  // Resize the slide to the next zoom, scrolling so the point a fraction (fx,
  // fy) of the way across it lands on (x, y), then ease it there from the box it
  // was drawn in before. When the slide ends up smaller than the canvas it centres,
  // so the point can't always stay put; the easing makes that a glide.
  function zoomKeeping(next, fx, fy, x, y, before, isAnimated = true) {
    const slide = slides[current]
    slide.getAnimations().forEach((animation) => animation.finish())
    setZoom(next)
    let after = slide.getBoundingClientRect()
    main.scrollBy(after.left + fx * after.width - x, after.top + fy * after.height - y)
    after = slide.getBoundingClientRect()
    if (!isAnimated || isReducedMotion || Math.abs(after.width - before.width) < 1 && Math.abs(after.left - before.left) < 1 && Math.abs(after.top - before.top) < 1) return
    const k = before.width / after.width
    slide.animate([
      { transformOrigin: '0 0', transform: 'translate(' + (before.left - after.left) + 'px, ' + (before.top - after.top) + 'px) scale(' + k + ')' },
      { transformOrigin: '0 0', transform: 'none' },
    ], { duration: 180, easing: 'cubic-bezier(.2, .7, .3, 1)' })
  }

  function zoomCentred(next) {
    const box = main.getBoundingClientRect()
    zoomAround(next, box.left + main.clientWidth / 2, box.top + main.clientHeight / 2)
  }

  const zoomIn = () => zoomCentred(STEPS.find((step) => step > scale + 0.001) ?? STEPS.at(-1))
  const zoomOut = () => zoomCentred(STEPS.findLast((step) => step < scale - 0.001) ?? STEPS[0])

  // On a phone the sidebar is a drawer, closed once you pick a slide.
  function setNavOpen(isOpen) {
    document.body.classList.toggle('is-nav-open', isOpen)
    menuButton.setAttribute('aria-expanded', String(isOpen))
    scrim.hidden = !isOpen
  }

  const go = (step) => { location.hash = String(Math.min(Math.max(current + step, 0), slides.length - 1) + 1) }

  function show(index) {
    current = Math.min(Math.max(index, 0), slides.length - 1)
    slides.forEach((slide, i) => { slide.hidden = i !== current })
    trails.forEach((trail, i) => { trail.hidden = i !== current })
    links.forEach((link) => link.toggleAttribute('aria-current', Number(link.dataset.index) === current))
    stepButtons.forEach((button) => {
      const next = current + Number(button.dataset.step)
      button.disabled = next < 0 || next >= slides.length
    })
    document.querySelector('nav a[aria-current]')?.scrollIntoView({ block: 'nearest' })
    layout()
    main.scrollTo(0, 0)
  }

  const fromHash = () => Number(location.hash.slice(1)) - 1 || 0
  show(fromHash())
  addEventListener('hashchange', () => show(fromHash()))
  addEventListener('resize', layout)

  menuButton.addEventListener('click', () => setNavOpen(!document.body.classList.contains('is-nav-open')))
  scrim.addEventListener('click', () => setNavOpen(false))
  links.forEach((link) => link.addEventListener('click', () => setNavOpen(false)))
  stepButtons.forEach((button) => button.addEventListener('click', () => go(Number(button.dataset.step))))

  function setMenuOpen(isOpen) {
    menu.hidden = !isOpen
    levelButton.setAttribute('aria-expanded', String(isOpen))
    if (isOpen) (menu.querySelector('[aria-checked=true]') ?? menu.querySelector('button')).focus()
  }

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('button')
    if (button === levelButton) return setMenuOpen(menu.hidden)
    const action = button?.dataset.zoom
    if (action === 'in') zoomIn()
    else if (action === 'out') zoomOut()
    else if (action) zoomCentred(action)
    if (menu.contains(button)) setMenuOpen(false)
  })
  document.addEventListener('click', (event) => { if (!toolbar.contains(event.target)) setMenuOpen(false) })

  addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key === 'Escape') {
      setMenuOpen(false)
      return setNavOpen(false)
    }
    if (!menu.hidden && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      const items = [...menu.querySelectorAll('button')]
      const at = items.indexOf(document.activeElement)
      return items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus()
    }
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key]
    if (step) go(step)
    else if (event.key === '+' || event.key === '=') zoomIn()
    else if (event.key === '-' || event.key === '_') zoomOut()
    else if (event.shiftKey && event.code === 'Digit1') zoomCentred('fit')
    else if (event.shiftKey && event.code === 'Digit2') zoomCentred('width')
    else if (event.shiftKey && event.code === 'Digit0') zoomCentred(1)
  })

  // Pinch on a trackpad (and Ctrl + scroll) zooms the slide, not the whole
  // page, around the pointer. A mouse-wheel notch is ~100px of delta and a pinch
  // a few px, so each event's delta is capped: about 15% per notch at most. No
  // easing here: it would lag behind the fingers.
  main.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return
    event.preventDefault()
    const delta = Math.max(-40, Math.min(40, event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY))
    zoomAround(scale * Math.exp(-delta * 0.004), event.clientX, event.clientY, false)
  }, { passive: false })

  // Pinch on a touch screen does the same, around the fingers, and moving
  // both fingers pans; one finger is left to the browser's own scrolling.
  // Resizing the full-size slide on every move is too slow for a phone, so
  // while the fingers are down the slide only follows them with a transform,
  // and it's resized once, where they let go. Listening on the whole document
  // catches pinches that start on the top bar too.
  let pinch = null
  const midpoint = (touches) => [(touches[0].clientX + touches[1].clientX) / 2, (touches[0].clientY + touches[1].clientY) / 2]
  const spread = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
  document.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 2 || document.body.classList.contains('is-nav-open')) return
    const slide = slides[current]
    slide.getAnimations().forEach((animation) => animation.finish())
    const box = slide.getBoundingClientRect()
    const at = midpoint(event.touches)
    pinch = { slide, box, scale, spread: spread(event.touches), start: at, at, k: 1 }
    slide.style.transformOrigin = '0 0'
    slide.style.willChange = 'transform'
  }, { passive: true })
  document.addEventListener('touchmove', (event) => {
    if (!pinch || event.touches.length !== 2) return
    event.preventDefault()
    const { slide, box, start } = pinch
    const [x, y] = (pinch.at = midpoint(event.touches))
    // Within the toolbar's range, 10% to 400%.
    pinch.k = Math.min(Math.max(spread(event.touches) / pinch.spread, STEPS[0] / pinch.scale), STEPS.at(-1) / pinch.scale)
    // The point that was under the fingers at the start stays under them.
    const dx = x - start[0] + (start[0] - box.left) * (1 - pinch.k)
    const dy = y - start[1] + (start[1] - box.top) * (1 - pinch.k)
    slide.style.transform = 'translate(' + dx + 'px, ' + dy + 'px) scale(' + pinch.k + ')'
  }, { passive: false })
  const endPinch = (event) => {
    if (!pinch || event.touches.length >= 2) return
    const { slide, box, start, at, k } = pinch
    const next = pinch.scale * k
    pinch = null
    const before = slide.getBoundingClientRect()
    slide.style.transform = slide.style.transformOrigin = slide.style.willChange = ''
    zoomKeeping(next, (start[0] - box.left) / box.width, (start[1] - box.top) / box.height, at[0], at[1], before)
  }
  document.addEventListener('touchend', endPinch)
  document.addEventListener('touchcancel', endPinch)

  // iOS Safari also zooms the page on its own gesture events; the slide's
  // pinch above stands in for it. (A Mac has no touch points, so its trackpad
  // pinch still reaches the wheel handler.)
  if (navigator.maxTouchPoints > 0) {
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, (event) => event.preventDefault(), { passive: false })
  }
</script>
</body>
</html>
`
}

// depth=2 is the pages and their top-level nodes — all we need, and far
// smaller than the whole document tree.
const file = await figma(`/files/${fileKey}?depth=2`)
const groups = groupPages(file.document.children)
const frames = groups.flatMap((group) => group.pages.flatMap((page) => page.frames))
if (frames.length === 0) {
  console.error(`No frames found in sections ${sections.join(', ')}.`)
  process.exit(1)
}

console.log(`Rendering ${frames.length} frames from "${file.name}"…`)
const urls = await renderFrames(frames.map((frame) => frame.id))

const framesDir = join(out, 'frames')
await rm(framesDir, { recursive: true, force: true })
await mkdir(framesDir, { recursive: true })

const taken = new Set()
for (const group of groups) {
  for (const page of group.pages) {
    page.frames = page.frames.filter((frame) => {
      if (urls[frame.id]) return true
      console.warn(`Skipping "${page.title} / ${frame.name}": Figma returned no image.`)
      return false
    })
    for (const frame of page.frames) {
      let name = slugify(isSameName(frame.name, page.title) ? page.title : `${page.title}-${frame.name}`) || 'frame'
      while (taken.has(name)) name += '-1'
      taken.add(name)
      frame.file = `${name}.${format}`
    }
  }
  group.pages = group.pages.filter((page) => page.frames.length > 0)
}

async function download(url, frame) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed for "${frame.name}": ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

// Figma exports what SVG can't express (angular gradients, some blends) as
// HTML in a <foreignObject>, which browsers don't draw when the SVG is shown
// as an image — the covers' arcs vanish. Those frames come down as PNG instead.
const bitmaps = []
await Promise.all(frames.filter((frame) => frame.file).map(async (frame) => {
  const image = await download(urls[frame.id], frame)
  if (format === 'svg' && image.includes('<foreignObject')) bitmaps.push(frame)
  else await writeFile(join(framesDir, frame.file), image)
}))

if (bitmaps.length > 0) {
  console.log(`Using PNG for ${bitmaps.length} frames SVG can't draw faithfully…`)
  const pngUrls = await renderFrames(bitmaps.map((frame) => frame.id), 'png')
  await Promise.all(bitmaps.map(async (frame) => {
    frame.file = frame.file.replace(/\.svg$/, '.png')
    await writeFile(join(framesDir, frame.file), await download(pngUrls[frame.id], frame))
  }))
}

// This package's own tokens, so the presentation chrome matches the app, and
// its version, so the page always names the release it shows.
const tokens = await readFile(join(ROOT, 'tokens.css'), 'utf8')
const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
await writeFile(join(out, 'index.html'), renderHtml(file, groups, tokens, version))
console.log(`Wrote ${join(out, 'index.html')}`)
