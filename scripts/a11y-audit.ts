/**
 * Run axe-core on every screen, subpage and dialog, in both themes, and list
 * the accessibility problems it finds.
 *
 *   pnpm a11y                                      # starts its own dev server
 *   pnpm a11y --url http://localhost:5173          # reuse a running dev server
 *   CHROME_PATH=/usr/bin/chromium pnpm a11y        # no Google Chrome installed
 *   pnpm a11y --limit all                          # list every place, not the first 12
 *
 * It saves no images: axe reads the live page, colours included. It reaches
 * each place the way scripts/screenshots.ts does: the Vite dev server and the
 * browser mock bridge, a real Chrome (the app pauses while hidden), and history
 * state to move between screens. Exits non-zero when axe
 * reports any violation, a tab has no scenario, or a scenario's button isn't
 * there to open its dialog or menu, so it can gate a commit or CI.
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type axe from 'axe-core'
import { chromium } from 'playwright-core'

import type { AppLocation } from '@/app/utils/location'

import { flag, readWindowSize, type RunningServer, startDevServer } from './lib/dev-server.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { width, height } = await readWindowSize()
const AXE_SOURCE = await readFile(resolve(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8')

/** WCAG 2.1 A and AA, plus axe's best practices (landmarks, heading order, …). */
const RULE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']

/**
 * Base UI's focus guards: empty spans, hidden from screen readers but
 * focusable, that hand focus straight back into (or out of) an open popup.
 * Hidden-yet-focusable is the technique, so aria-hidden-focus would flag it.
 */
const EXCLUDED = [['[data-base-ui-focus-guard]']]

/** A node axe flagged, marked in the page with whether it sits in a faded preview. */
type FlaggedNode = axe.NodeResult & { isInFadedPreview: boolean }
/** The colours axe measured for a contrast failure. */
type ContrastData = { fgColor: string; bgColor: string; contrastRatio: number; expectedContrastRatio: string }
/** One rule's violations across every place. */
type ViolatedRule = { impact: axe.ImpactValue | undefined; help: string; helpUrl: string; places: Set<string> }

/**
 * An open menu is portalled to the end of <body>, outside the landmarks; it
 * belongs to its trigger, which is inside them. Only `region` is waived for it.
 */
function isPortalledMenu(ruleId: string, node: FlaggedNode): boolean {
  return ruleId === 'region' && node.html.includes('role="menu"')
}

/**
 * Speed's capability rows and its speed test's zeros, before any test, are
 * faded on purpose: they only preview what a test will fill in, and a screen
 * reader still reads them (the zeros as "Not tested yet"). Only
 * `color-contrast` is waived inside `[data-faded-preview]`.
 */
function isFadedPreview(ruleId: string, node: FlaggedNode): boolean {
  return ruleId === 'color-contrast' && node.isInFadedPreview
}

/**
 * Runs in the page: click the first button whose label or text contains `label`
 * (or, with no label, the first disclosure button), and say whether one was
 * found. Page functions can't close over script variables, so the label
 * travels as an argument.
 */
function clickButton(label: string): boolean {
  const buttons = [...document.querySelectorAll<HTMLElement>('button, [role="button"]')]
  const button = label
    ? buttons.find((el) => (el.getAttribute('aria-label') ?? el.textContent).includes(label))
    : buttons.find((el) => el.hasAttribute('aria-expanded'))
  button?.click()
  return button !== undefined
}

/** Runs in the page: every tab id, read from the app's own list through the dev server. */
async function appTabs(): Promise<readonly string[]> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- tsc can't resolve a path only the dev server serves; `as string` stops it trying
  const { APP_TABS } = (await import('/src/app/utils/tabs.ts' as string)) as typeof import('@/app/utils/tabs')
  return APP_TABS
}

/**
 * [name, location, optional label of a button to click once it has settled
 * ('' clicks the first disclosure button)]. Every tab needs one, which the
 * audit checks against the app's tab list; add a subpage, dialog or menu here
 * by hand.
 */
const SCENARIOS: [name: string, location: AppLocation, buttonLabel?: string][] = [
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
  ['connection', { tab: 'connection' }],
  ['services', { tab: 'services' }],
  ['services: add dialog', { tab: 'services' }, 'Add service'],
  ['services: row menu', { tab: 'services' }, 'Options for'],
  ['services: timeline', { tab: 'services', servicesSub: { view: 'timeline' } }],
  ['settings', { tab: 'settings' }],
  ['about', { tab: 'about' }],
]

const existingUrl = flag('url')
/** How many places to list per rule; `--limit all` lists every one. */
const limitFlag = flag('limit') ?? '12'
const placeLimit = limitFlag === 'all' ? Infinity : Number(limitFlag)
const server: RunningServer = existingUrl ? { url: existingUrl, stop: () => {} } : await startDevServer()
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
)

/** Each violated rule by its id, with the "scenario: target" places it failed. */
const violations = new Map<string, ViolatedRule>()
/** What the audit couldn't check: a tab with no scenario, a button it couldn't find. */
const gaps = new Set<string>()

try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width, height } })
    await page.addInitScript((mode) => localStorage.setItem('rove.setting.themeMode', mode), theme)
    await page.goto(server.url, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-app-shell]')
    await page.waitForTimeout(3000)

    for (const tab of await page.evaluate(appTabs)) {
      if (!SCENARIOS.some(([, location]) => location.tab === tab)) gaps.add(`no scenario opens the "${tab}" tab`)
    }

    for (const [name, location, buttonLabel] of SCENARIOS) {
      await page.keyboard.press('Escape')
      await page.evaluate((to) => {
        const state = { ...(window.history.state as Record<string, unknown> | null), __roveNav: to }
        window.history.pushState(state, '')
        window.dispatchEvent(new PopStateEvent('popstate', { state }))
      }, location)
      await page.waitForTimeout(1500)
      if (buttonLabel !== undefined) {
        const wasFound = await page.evaluate(clickButton, buttonLabel)
        if (!wasFound) gaps.add(`${name}: no button labelled "${buttonLabel}" to open it`)
        await page.waitForTimeout(800)
      }
      await page.addScriptTag({ content: AXE_SOURCE })
      const axeViolations = await page.evaluate(
        async ({ tags, exclude }) => {
          // The page's window has axe only once its script is added, which no Window type knows.
          const results = await (window as unknown as { axe: typeof axe }).axe.run(
            { include: [['html']], exclude },
            { runOnly: { type: 'tag', values: tags } },
          )
          // Page functions return plain data, so mark each node here, where the DOM is.
          const isInFadedPreview = (node: axe.NodeResult) =>
            Boolean(document.querySelector(String(node.target[0]))?.closest('[data-faded-preview]'))
          return results.violations.map((violation) => ({
            ...violation,
            nodes: violation.nodes.map((node): FlaggedNode => ({ ...node, isInFadedPreview: isInFadedPreview(node) })),
          }))
        },
        { tags: RULE_TAGS, exclude: EXCLUDED },
      )
      for (const violation of axeViolations) {
        const { id, impact, help, helpUrl } = violation
        const entry = violations.get(id) ?? { impact, help, helpUrl, places: new Set() }
        for (const node of violation.nodes) {
          if (isPortalledMenu(id, node) || isFadedPreview(id, node)) continue
          // Contrast failures carry the measured colours; show them so the fix
          // can go to the right design token.
          const contrast = node.any
            .map((check) => check.data as Partial<ContrastData> | null)
            .find((data) => data?.contrastRatio)
          const detail = contrast
            ? ` (${String(contrast.fgColor)} on ${String(contrast.bgColor)}: ${String(contrast.contrastRatio)}:1, needs ${String(contrast.expectedContrastRatio)})`
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

const IMPACT_ORDER: (axe.ImpactValue | undefined)[] = ['critical', 'serious', 'moderate', 'minor']
const violationsByImpact = [...violations].sort(
  ([, a], [, b]) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact),
)
for (const [id, rule] of violationsByImpact) {
  console.log(`\n[${String(rule.impact)}] ${id}: ${rule.help} (${rule.places.size} places)\n  ${rule.helpUrl}`)
  for (const place of [...rule.places].slice(0, placeLimit)) console.log(`  - ${place}`)
  if (rule.places.size > placeLimit) console.log(`  … and ${rule.places.size - placeLimit} more`)
}
for (const gap of gaps) console.log(`\n[not checked] ${gap}`)
console.log(
  `\n${violations.size} rule${violations.size === 1 ? '' : 's'} violated across ${SCENARIOS.length} scenarios × 2 themes`,
)
process.exit(violations.size > 0 || gaps.size > 0 ? 1 : 0)
