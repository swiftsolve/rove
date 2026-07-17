/**
 * Capture a PNG of every screen in the app, at the real window size.
 *
 *   npm run screenshots                    # dark theme -> docs/screenshots
 *   npm run screenshots -- --theme light   # light theme
 *   npm run screenshots -- --out /tmp/shots
 *   npm run screenshots -- --url http://localhost:5173   # reuse a running dev server
 *
 * Runs against the Vite dev server, which installs the browser mock bridge
 * (src/dev/mockNetworkApi.ts) — so the shots show the mock's network, not
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
 *    navigation/useNavigation.ts), so pushing an entry and firing popstate is
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

function flag(name, fallback) {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : process.argv[at + 1]
}

const out = resolve(ROOT, flag('out', 'docs/screenshots'))
const theme = flag('theme', 'dark')
const existingUrl = flag('url', null)

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
// stays a ~3 MB dependency with no browser download behind it.
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
  })
  await page.addInitScript((mode) => {
    localStorage.setItem('rove.setting.themeMode', mode)
  }, theme)

  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForSelector('.app-shell')
  // The mock answers on a delay and the views fetch on mount; give the first
  // screen room to settle before we start shooting.
  await page.waitForTimeout(3000)

  for (const [name, location] of SCREENS) {
    await page.evaluate((to) => {
      const state = { ...(window.history.state ?? {}), __roveNav: to }
      window.history.pushState(state, '')
      window.dispatchEvent(new PopStateEvent('popstate', { state }))
    }, location)
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${out}/${name}.png` })
    console.log(`  ${name}.png`)
  }
} finally {
  await browser.close()
  server.stop()
}

console.log(`\n${SCREENS.length} screens at ${width}x${height} (@2x) -> ${out}`)
