/**
 * Run axe-core on every screen, subpage and dialog, in both themes, and list
 * the accessibility problems it finds.
 *
 *   npm run a11y                                   # starts its own dev server
 *   npm run a11y -- --url http://localhost:5173    # reuse a running dev server
 *   CHROME_PATH=/usr/bin/chromium npm run a11y     # no Google Chrome installed
 *   npm run a11y -- --limit all                    # list every place, not the first 12
 *
 * Like the screenshot script, it runs against the Vite dev server and the
 * browser mock bridge, drives a real Chrome (the app pauses while hidden), and
 * moves between screens by writing history state. Exits non-zero when axe
 * reports any violation, so it can gate a commit or CI.
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

import { flag, startDevServer } from './lib/dev-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { app } = JSON.parse(await readFile(resolve(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'))
const { width, height } = app.windows[0]
const AXE_SOURCE = await readFile(resolve(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8')

// WCAG 2.1 A and AA, plus axe's best practices (landmarks, heading order, …).
const RULE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']

// Base UI's focus guards: empty spans, hidden from screen readers but
// focusable, that hand focus straight back into (or out of) an open popup.
// Hidden-yet-focusable is the technique, so aria-hidden-focus would flag it.
const EXCLUDED = [['[data-base-ui-focus-guard]']]

/**
 * An open menu is portalled to the end of <body>, outside the landmarks; it
 * belongs to its trigger, which is inside them. Only `region` is waived for it.
 */
function isPortalledMenu(ruleId, node) {
  return ruleId === 'region' && node.html.includes('role="menu"')
}

/**
 * Speed's capability rows before any test are faded like disabled controls, on
 * purpose: they only preview what a test will rate, and a screen reader still
 * reads them. Only `color-contrast` is waived inside `[data-faded-preview]`.
 */
function isFadedPreview(ruleId, node) {
  return ruleId === 'color-contrast' && node.isInFadedPreview
}

/**
 * Runs in the page: click the first button whose label or text contains `label`
 * (or, with no label, the first disclosure button). Page functions can't close
 * over script variables, so the label travels as an argument.
 */
function clickButton(label) {
  const buttons = [...document.querySelectorAll('button, [role="button"]')]
  const button = label
    ? buttons.find((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').includes(label))
    : buttons.find((el) => el.hasAttribute('aria-expanded'))
  button?.click()
}

/**
 * [name, location, optional label of a button to click once it has settled
 * ('' clicks the first disclosure button)].
 */
const SCENARIOS = [
  ['home', { tab: 'home' }],
  ['home: details open', { tab: 'home' }, ''],
  ['home: share Wi-Fi', { tab: 'home' }, 'Share Wi‑Fi'],
  ['speed', { tab: 'speed' }],
  ['speed: results', { tab: 'speed', speedSub: { view: 'history' } }],
  ['speed: results menu', { tab: 'speed', speedSub: { view: 'history' } }, 'History options'],
  ['interfaces', { tab: 'interfaces' }],
  ['devices', { tab: 'devices' }],
  ['timeline', { tab: 'events' }],
  ['usage', { tab: 'usage' }],
  ['apps', { tab: 'apps' }],
  ['apps: hosts', { tab: 'apps', appsSub: { view: 'hosts' } }],
  ['apps: traffic', { tab: 'apps', appsSub: { view: 'traffic' } }],
  ['connection', { tab: 'diagnostics' }],
  ['services', { tab: 'services' }],
  ['services: add dialog', { tab: 'services' }, 'Add service'],
  ['services: row menu', { tab: 'services' }, 'Options for'],
  ['services: timeline', { tab: 'services', servicesSub: { view: 'timeline' } }],
  ['settings', { tab: 'settings' }],
  ['about', { tab: 'about' }],
]

const existingUrl = flag('url', null)
// How many places to list per rule; `--limit all` lists every one.
const limitFlag = flag('limit', '12')
const placeLimit = limitFlag === 'all' ? Infinity : Number(limitFlag)
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

    for (const [name, location, buttonLabel] of SCENARIOS) {
      await page.keyboard.press('Escape')
      await page.evaluate((to) => {
        const state = { ...(window.history.state ?? {}), __roveNav: to }
        window.history.pushState(state, '')
        window.dispatchEvent(new PopStateEvent('popstate', { state }))
      }, location)
      await page.waitForTimeout(1500)
      if (buttonLabel !== undefined) {
        await page.evaluate(clickButton, buttonLabel)
        await page.waitForTimeout(800)
      }
      await page.addScriptTag({ content: AXE_SOURCE })
      const result = await page.evaluate(
        async ({ tags, exclude }) => {
          const run = await window.axe.run({ include: [['html']], exclude }, { runOnly: { type: 'tag', values: tags } })
          // Page functions return plain data, so mark each node here, where the DOM is.
          for (const node of run.violations.flatMap((violation) => violation.nodes)) {
            node.isInFadedPreview = Boolean(document.querySelector(node.target[0])?.closest('[data-faded-preview]'))
          }
          return run
        },
        { tags: RULE_TAGS, exclude: EXCLUDED },
      )
      for (const violation of result.violations) {
        const { id, impact, help, helpUrl } = violation
        const entry = violations.get(id) ?? { impact, help, helpUrl, places: new Set() }
        for (const node of violation.nodes) {
          if (isPortalledMenu(id, node) || isFadedPreview(id, node)) continue
          // Contrast failures carry the measured colours; show them so the fix
          // can go to the right design token.
          const contrast = node.any.find((check) => check.data?.contrastRatio)?.data
          const detail = contrast
            ? ` (${contrast.fgColor} on ${contrast.bgColor}: ${contrast.contrastRatio}:1, needs ${contrast.expectedContrastRatio})`
            : ''
          entry.places.add(`${theme} ${name}: ${node.target.join(' ')}${detail}`)
        }
        if (entry.places.size > 0) violations.set(id, entry)
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
for (const [id, rule] of sorted) {
  console.log(`\n[${rule.impact}] ${id}: ${rule.help} (${rule.places.size} places)\n  ${rule.helpUrl}`)
  for (const place of [...rule.places].slice(0, placeLimit)) console.log(`  - ${place}`)
  if (rule.places.size > placeLimit) console.log(`  … and ${rule.places.size - placeLimit} more`)
}
console.log(
  `\n${violations.size} rule${violations.size === 1 ? '' : 's'} violated across ${SCENARIOS.length} scenarios × 2 themes`,
)
process.exit(violations.size > 0 ? 1 : 0)
