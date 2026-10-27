/**
 * Run axe-core on every screen, subpage and dialog, in both themes, and list
 * the accessibility problems it finds.
 *
 *   npm run a11y                                   # starts its own dev server
 *   npm run a11y -- --url http://localhost:5173    # reuse a running dev server
 *   CHROME_PATH=/usr/bin/chromium npm run a11y     # no Google Chrome installed
 *
 * Like the screenshot script, it runs against the Vite dev server and the
 * browser mock bridge, drives a real Chrome (the app pauses while hidden), and
 * moves between screens by writing history state. Exits non-zero when axe
 * reports any violation, so it can gate a commit or CI.
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { app } = JSON.parse(await readFile(resolve(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'))
const { width, height } = app.windows[0]
const AXE_SOURCE = await readFile(resolve(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8')

// WCAG 2.1 A and AA, plus axe's best practices (landmarks, heading order, …).
const RULE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']

/** Click the first button whose accessible label or text contains `label`. */
const clickButton = (label) => () => {
  const button = [...document.querySelectorAll('button, [role="button"]')].find(
    (el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').includes(label),
  )
  button?.click()
}

/** [name, location, optional action run on the page once it has settled]. */
const SCENARIOS = [
  ['home', { tab: 'home' }],
  ['home: details open', { tab: 'home' }, () => document.querySelector('button[aria-expanded]')?.click()],
  ['home: share Wi-Fi', { tab: 'home' }, clickButton('Share Wi‑Fi')],
  ['speed', { tab: 'speed' }],
  ['speed: results', { tab: 'speed', speedSub: { view: 'history' } }],
  ['speed: results menu', { tab: 'speed', speedSub: { view: 'history' } }, clickButton('History options')],
  ['interfaces', { tab: 'interfaces' }],
  ['devices', { tab: 'devices' }],
  ['timeline', { tab: 'events' }],
  ['usage', { tab: 'usage' }],
  ['apps', { tab: 'apps' }],
  ['apps: hosts', { tab: 'apps', appsSub: { view: 'hosts' } }],
  ['apps: traffic', { tab: 'apps', appsSub: { view: 'traffic' } }],
  ['connection', { tab: 'diagnostics' }],
  ['services', { tab: 'services' }],
  ['services: add dialog', { tab: 'services' }, clickButton('Add service')],
  ['services: row menu', { tab: 'services' }, clickButton('Options for')],
  ['services: timeline', { tab: 'services', servicesSub: { view: 'timeline' } }],
  ['settings', { tab: 'settings' }],
  ['about', { tab: 'about' }],
]

function flag(name, fallback) {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : process.argv[at + 1]
}

function freePort() {
  return new Promise((ok) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => ok(port))
    })
  })
}

async function startDevServer() {
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, PORT: String(await freePort()) },
  })
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('dev server never printed a URL')), 30_000)
    vite.stdout.on('data', (chunk) => {
      const url = /(http:\/\/localhost:\d+)/.exec(String(chunk))?.[1]
      if (!url) return
      clearTimeout(timer)
      ok({ url, stop: () => vite.kill() })
    })
    vite.on('exit', (code) => fail(new Error(`dev server exited (${code})`)))
  })
}

const existingUrl = flag('url', null)
const server = existingUrl ? { url: existingUrl, stop: () => {} } : await startDevServer()
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
)

/** rule id → { impact, help, helpUrl, places: Set of "scenario: target" } */
const violations = new Map()

try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width, height } })
    await page.addInitScript((mode) => localStorage.setItem('rove.setting.themeMode', mode), theme)
    await page.goto(server.url, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-app-shell]')
    await page.waitForTimeout(3000)

    for (const [name, location, action] of SCENARIOS) {
      await page.keyboard.press('Escape')
      await page.evaluate((to) => {
        const state = { ...(window.history.state ?? {}), __roveNav: to }
        window.history.pushState(state, '')
        window.dispatchEvent(new PopStateEvent('popstate', { state }))
      }, location)
      await page.waitForTimeout(1500)
      if (action) {
        await page.evaluate(action)
        await page.waitForTimeout(800)
      }
      await page.addScriptTag({ content: AXE_SOURCE })
      const result = await page.evaluate(
        (tags) => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }),
        RULE_TAGS,
      )
      for (const v of result.violations) {
        const entry = violations.get(v.id) ?? { impact: v.impact, help: v.help, helpUrl: v.helpUrl, places: new Set() }
        for (const node of v.nodes) entry.places.add(`${theme} ${name}: ${node.target.join(' ')}`)
        violations.set(v.id, entry)
      }
    }
    await page.close()
  }
} finally {
  await browser.close()
  server.stop()
}

const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor']
const sorted = [...violations].sort(([, a], [, b]) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact))
for (const [id, v] of sorted) {
  console.log(`\n[${v.impact}] ${id}: ${v.help} (${v.places.size} places)\n  ${v.helpUrl}`)
  for (const place of [...v.places].slice(0, 12)) console.log(`  - ${place}`)
  if (v.places.size > 12) console.log(`  … and ${v.places.size - 12} more`)
}
console.log(`\n${violations.size} rule${violations.size === 1 ? '' : 's'} violated across ${SCENARIOS.length} scenarios × 2 themes`)
process.exit(violations.size > 0 ? 1 : 0)
