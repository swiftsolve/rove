/**
 * Capture a PNG of every screen in the app, at the real window size.
 *
 *   npm run screenshots                    # dark theme -> docs/screenshots
 *   npm run screenshots -- --theme light   # light theme
 *   npm run screenshots -- --out /tmp/shots
 *   npm run screenshots -- --url http://localhost:5173   # reuse a running dev server
 *   CHROME_PATH=/usr/bin/chromium npm run screenshots    # no Google Chrome installed
 *   npm run screenshots -- --stable        # identical pixels run to run, to diff a refactor
 *
 * Runs against the Vite dev server, which installs the browser mock bridge
 * (src/dev/mock-network-api.ts) — so the shots show the mock's network, not
 * yours. That's the point: they're reproducible, and they don't leak the SSID
 * and devices of whoever ran the script.
 *
 * Two things here look odd and aren't:
 *
 *  - We drive a real Chrome via playwright-core rather than a headless shell,
 *    because the app pauses all polling while the page is hidden (see
 *    hooks/usePageVisible.ts) and an automated background tab reads as hidden —
 *    it would sit on the loading screen forever.
 *  - We move between screens by writing history state directly. The app has no
 *    URL per screen: navigation lives on history.state (see
 *    app/hooks/useHistoryNavigation.ts), so pushing an entry and firing popstate is
 *    exactly what the tab bar does.
 */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Kept in sync with src-tauri/tauri.conf.json — the shots are only useful if
// they're the size the window actually is.
const { app } = JSON.parse(await readFile(resolve(ROOT, 'src-tauri/tauri.conf.json'), 'utf8'))
const { width, height } = app.windows[0]

/** Every screen worth a shot: each tab, plus the subpages layered over one. */
const SCREENS = [
  ['01-home', { tab: 'home', speedSub: null }],
  ['02-speed', { tab: 'speed', speedSub: null }],
  ['03-speed-details', { tab: 'speed', speedSub: { view: 'details', target: 'streaming-4k' } }],
  ['04-speed-history', { tab: 'speed', speedSub: { view: 'history' } }],
  ['05-interfaces', { tab: 'interfaces', speedSub: null }],
  ['06-devices', { tab: 'devices', speedSub: null }],
  ['07-events', { tab: 'events', speedSub: null }],
  ['08-usage', { tab: 'usage', speedSub: null }],
  ['09-apps', { tab: 'apps', speedSub: null }],
  ['10-apps-hosts', { tab: 'apps', speedSub: null, appsSub: { view: 'hosts' } }],
  ['11-diagnostics', { tab: 'diagnostics', speedSub: null }],
  ['12-services', { tab: 'services', speedSub: null }],
  ['13-services-timeline', { tab: 'services', speedSub: null, servicesSub: { view: 'timeline' } }],
  ['14-settings', { tab: 'settings', speedSub: null }],
  ['15-about', { tab: 'about', speedSub: null }],
]

/**
 * With --stable, states a still screen never shows: open menus and dialogs,
 * tooltips, a focus ring, then the UI library's gallery. Each is
 * [name, location, what to do once it has settled].
 */
const SCENES = [
  ['16-home-details', { tab: 'home', speedSub: null }, (page) => page.locator('button[aria-expanded]').first().click()],
  ['17-home-share-wifi', { tab: 'home', speedSub: null }, (page) => button(page, 'Share Wi‑Fi').click()],
  ['18-speed-history-menu', { tab: 'speed', speedSub: { view: 'history' } }, (page) => button(page, 'History options').first().click()],
  ['19-services-add-dialog', { tab: 'services', speedSub: null }, (page) => button(page, 'Add service').click()],
  ['20-services-row-menu', { tab: 'services', speedSub: null }, async (page) => {
    // The kebab only shows on row hover or focus: open it from the keyboard.
    await button(page, /^Options for/).first().focus()
    await page.keyboard.press('Enter')
  }],
  ['21-services-timeline-menu', { tab: 'services', speedSub: null, servicesSub: { view: 'timeline' } }, (page) => button(page, 'Timeline options').click()],
  ['22-help-tooltip', { tab: 'services', speedSub: null }, (page) => button(page, 'About service checks').hover()],
  ['23-rail-tooltip', { tab: 'home', speedSub: null }, (page) => button(page, 'Speed').hover()],
  ['24-focus-ring', { tab: 'services', speedSub: null }, (page) => button(page, 'Add service').focus()],
]

function button(page, name) {
  return page.getByRole('button', { name, exact: typeof name === 'string' })
}

function flag(name, fallback) {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : process.argv[at + 1]
}

const out = resolve(ROOT, flag('out', 'docs/screenshots'))
const theme = flag('theme', 'dark')
const existingUrl = flag('url', null)
// A fake clock, seeded randomness and paused CSS animations, so two runs of the
// same code give the same pixels: live charts, relative times and pulses all
// hold still. The shots then show a fixed moment, not a live app.
const isStable = process.argv.includes('--stable')
const STABLE_TIME = new Date('2026-06-15T10:30:00Z')

/** An unused port, so we never fight a `tauri:dev` already holding vite's
 *  default — the config pins that port with `strictPort`, so a collision is
 *  fatal rather than a bump to the next one. */
function freePort() {
  return new Promise((ok) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => ok(port))
    })
  })
}

/** Moves the app to `location` the way the tab bar does. */
function navigateTo(page, location) {
  return page.evaluate((to) => {
    const state = { ...(window.history.state ?? {}), __roveNav: to }
    window.history.pushState(state, '')
    window.dispatchEvent(new PopStateEvent('popstate', { state }))
  }, location)
}

/** Start `vite` and resolve once it prints the URL it settled on. */
async function startDevServer() {
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    // vite.config.ts reads PORT — see its `server.port`.
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

const server = existingUrl ? { url: existingUrl, stop: () => {} } : await startDevServer()
console.log(`${existingUrl ? 'using' : 'started'} ${server.url}`)

await mkdir(out, { recursive: true })

// `channel: 'chrome'` uses the Chrome that's already installed, so playwright-core
// stays a ~3 MB dependency with no browser download behind it. CHROME_PATH
// points it at another Chromium, as in a11y-audit.mjs.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
)
try {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
    ...(isStable && { timezoneId: 'UTC', locale: 'en-US' }),
  })
  await page.addInitScript((mode) => {
    localStorage.setItem('rove.setting.themeMode', mode)
  }, theme)
  if (isStable) {
    // Paused, so time moves only through `settle`, never with the wall clock
    // while the page loads.
    await page.clock.install({ time: STABLE_TIME })
    await page.clock.pauseAt(STABLE_TIME.getTime() + 1000)
    await page.addInitScript(() => {
      // mulberry32: a small seeded generator in place of Math.random.
      let seed = 0x5eed
      Math.random = () => {
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    })
  }
  /** Lets the app run for `ms`: on the fake clock when stable, else in real time. */
  const settle = (ms) => (isStable ? page.clock.runFor(ms) : page.waitForTimeout(ms))

  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-app-shell]')
  // The mock answers on a delay and the views fetch on mount; give the first
  // screen room to settle before we start shooting.
  await settle(3000)

  for (const [name, location] of SCREENS) {
    await navigateTo(page, location)
    await settle(2500)
    // Favicons and app icons load over the network, in real time.
    if (isStable) await page.waitForFunction(() => [...document.images].every((image) => image.complete))
    await page.screenshot({ path: `${out}/${name}.png`, ...(isStable && { animations: 'disabled' }) })
    console.log(`  ${name}.png`)
  }

  if (isStable) {
    for (const [name, location, act] of SCENES) {
      await navigateTo(page, location)
      await settle(2500)
      await act(page)
      await settle(600)
      await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' })
      console.log(`  ${name}.png`)
      // Close whatever opened and move the pointer off it, for the next scene.
      await page.keyboard.press('Escape')
      await page.mouse.move(0, 0)
      await settle(600)
    }

    await page.goto(`${server.url}/?gallery&theme=${theme}`, { waitUntil: 'networkidle' })
    await settle(1000)
    await page.screenshot({ path: `${out}/25-gallery.png`, fullPage: true, animations: 'disabled' })
    console.log('  25-gallery.png')
  }
} finally {
  await browser.close()
  server.stop()
}

console.log(`\n${SCREENS.length + (isStable ? SCENES.length + 1 : 0)} screens at ${width}x${height} (@2x) -> ${out}`)
