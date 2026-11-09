/**
 * Capture a PNG of every screen in the app, at the real window size.
 *
 *   npm run screenshots                    # dark theme -> docs/screenshots
 *   npm run screenshots -- --theme light   # light theme
 *   npm run screenshots -- --out /tmp/shots
 *   npm run screenshots -- --url http://localhost:5173   # reuse a running dev server
 *   CHROME_PATH=/usr/bin/chromium npm run screenshots    # no Google Chrome installed
 *   npm run screenshots -- --stable        # identical pixels run to run, to diff a refactor
 *   npm run screenshots -- --stable --storybook-url http://127.0.0.1:6006   # reuse a running Storybook
 *   npm run screenshots -- --jobs 4        # pages shot at once (default: half the cores, up to 8)
 *
 * Each shot loads the app in a fresh page, so it doesn't depend on which shots
 * ran before it, and several run at once.
 *
 * Runs against the Vite dev server, which installs the browser mock bridge
 * (src/bridge/mock-network-api.ts), so the shots show the mock's network, not
 * yours. That's the point: they're reproducible, and they don't leak the SSID
 * and devices of whoever ran the script.
 *
 * Two things here look odd and aren't:
 *
 *  - We drive a real Chrome via playwright-core rather than a headless shell,
 *    because the app pauses all polling while the page is hidden (see
 *    hooks/usePageVisible.ts) and an automated background tab reads as hidden:
 *    it would sit on the loading screen forever.
 *  - We move between screens by writing history state directly. The app has no
 *    URL per screen: navigation lives on history.state (see
 *    app/hooks/useHistoryNavigation.ts), so pushing an entry and firing popstate is
 *    exactly what the tab bar does.
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { availableParallelism } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium, type Locator, type Page } from 'playwright-core'
import type { IndexEntry, StoryIndex } from 'storybook/internal/types'

import type { AppLocation } from '@/app/utils/location'

import { flag, freePort, readWindowSize, type RunningServer, startDevServer } from './lib/dev-server.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The shots are only useful at the size the window actually is.
const { width, height } = await readWindowSize()

/** One shot of the app: where it goes, and for a scene, what to do once the screen has settled. */
type Shot = { name: string; location: AppLocation; act?: (page: Page) => Promise<void> }

/** Every screen worth a shot: each tab, plus the subpages layered over one. */
const SCREENS: Shot[] = [
  { name: '01-home', location: { tab: 'home' } },
  { name: '02-speed', location: { tab: 'speed' } },
  { name: '03-speed-details', location: { tab: 'speed', speedSub: { view: 'details', target: 'streaming-4k' } } },
  { name: '04-speed-history', location: { tab: 'speed', speedSub: { view: 'history' } } },
  { name: '05-interfaces', location: { tab: 'interfaces' } },
  { name: '06-devices', location: { tab: 'devices' } },
  { name: '07-events', location: { tab: 'events' } },
  { name: '08-usage', location: { tab: 'usage' } },
  { name: '09-apps', location: { tab: 'apps' } },
  { name: '10-apps-hosts', location: { tab: 'apps', appsSub: { view: 'hosts' } } },
  { name: '11-connection', location: { tab: 'connection' } },
  { name: '12-services', location: { tab: 'services' } },
  { name: '13-services-timeline', location: { tab: 'services', servicesSub: { view: 'timeline' } } },
  { name: '14-settings', location: { tab: 'settings' } },
  { name: '15-about', location: { tab: 'about' } },
]

/** With --stable, states a still screen never shows: open menus and dialogs, tooltips, a focus ring. */
const SCENES: Shot[] = [
  {
    name: '16-home-details',
    location: { tab: 'home' },
    act: (page) => page.locator('button[aria-expanded]').first().click(),
  },
  { name: '17-home-share-wifi', location: { tab: 'home' }, act: (page) => button(page, 'Share Wi‑Fi').click() },
  {
    name: '18-speed-history-menu',
    location: { tab: 'speed', speedSub: { view: 'history' } },
    act: (page) => button(page, 'History options').first().click(),
  },
  { name: '19-services-add-dialog', location: { tab: 'services' }, act: (page) => button(page, 'Add service').click() },
  {
    name: '20-services-row-menu',
    location: { tab: 'services' },
    act: async (page) => {
      // The kebab only shows on row hover or focus: open it from the keyboard.
      await button(page, /^Options for/)
        .first()
        .focus()
      await page.keyboard.press('Enter')
    },
  },
  {
    name: '21-services-timeline-menu',
    location: { tab: 'services', servicesSub: { view: 'timeline' } },
    act: (page) => button(page, 'Timeline options').click(),
  },
  {
    name: '22-help-tooltip',
    location: { tab: 'services' },
    act: (page) => button(page, 'About service checks').hover(),
  },
  { name: '23-rail-tooltip', location: { tab: 'home' }, act: (page) => button(page, 'Speed').hover() },
  { name: '24-focus-ring', location: { tab: 'services' }, act: (page) => button(page, 'Add service').focus() },
]

function button(page: Page, name: string | RegExp): Locator {
  return page.getByRole('button', { name, exact: typeof name === 'string' })
}

const out = resolve(ROOT, flag('out') ?? 'docs/screenshots')
const theme = flag('theme') ?? 'dark'
const existingUrl = flag('url')
const existingStorybookUrl = flag('storybook-url')
// A fake clock, seeded randomness, paused CSS animations and reduced motion, so
// two runs of the same code give the same pixels: live charts, relative times
// and pulses all hold still, and what moves on timers or animation frames (the
// live chart's glide, the Introduction's looping specimens) rests instead. The
// shots then show a fixed moment, not a live app.
const isStable = process.argv.includes('--stable')
const STABLE_TIME = new Date('2026-06-15T10:30:00Z')
// Half the cores, up to 8: each page is a Chrome renderer, and one Vite server
// and one Storybook serve them all, so more pages stop helping well before
// every core is busy.
const jobs = Number(flag('jobs') ?? Math.min(8, Math.max(1, Math.floor(availableParallelism() / 2))))

/** Runs `work` on every item, `jobs` at a time. */
async function runInParallel<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items]
  async function runQueue() {
    let item = queue.shift()
    while (item !== undefined) {
      await work(item)
      item = queue.shift()
    }
  }
  const runnerCount = Math.min(jobs, items.length)
  await Promise.all(Array.from({ length: runnerCount }, runQueue))
}

/** Moves the app to `location` the way the tab bar does. */
function navigateTo(page: Page, location: AppLocation): Promise<void> {
  return page.evaluate((to) => {
    const state = { ...(window.history.state as Record<string, unknown> | null), __roveNav: to }
    window.history.pushState(state, '')
    window.dispatchEvent(new PopStateEvent('popstate', { state }))
  }, location)
}

/** Start Storybook and resolve once its story index answers. */
async function startStorybook(): Promise<RunningServer> {
  const port = await freePort()
  const storybook = spawn(
    process.execPath,
    ['node_modules/storybook/dist/bin/dispatcher.js', 'dev', '--ci', '--no-open', '--port', String(port)],
    { cwd: ROOT, stdio: 'ignore' },
  )
  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (storybook.exitCode != null) throw new Error(`storybook exited (${storybook.exitCode})`)
    try {
      if ((await fetch(`${url}/index.json`)).ok) return { url, stop: () => storybook.kill() }
    } catch {
      // Not listening yet.
    }
    await new Promise((ok) => setTimeout(ok, 500))
  }
  storybook.kill()
  throw new Error('storybook never answered')
}

/** The part of Storybook's preview this script reads: how far the story's render has got. */
type StorybookPreview = { currentRender?: { phase: string } }

/**
 * The UI library's stories to shoot: each component's All States, or every
 * story of a component that has none. Single states would repeat what the
 * overview shows.
 */
async function libraryStories(storybookUrl: string): Promise<IndexEntry[]> {
  const index = (await (await fetch(`${storybookUrl}/index.json`)).json()) as StoryIndex
  const stories = Object.values(index.entries).filter((entry) => entry.type === 'story')
  const withOverview = new Set(stories.filter((story) => story.name === 'All States').map((story) => story.title))
  return stories.filter((story) => !withOverview.has(story.title) || story.name === 'All States')
}

const server: RunningServer = existingUrl ? { url: existingUrl, stop: () => {} } : await startDevServer()
let libraryCount = 0
console.log(`${existingUrl ? 'using' : 'started'} ${server.url}`)

await mkdir(out, { recursive: true })

// `channel: 'chrome'` uses the Chrome that's already installed, so playwright-core
// stays a ~3 MB dependency with no browser download behind it. CHROME_PATH
// points it at another Chromium, as in a11y-audit.ts.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' },
)

/** The app in a fresh page, settled on its first screen, and how to let it run on. */
type AppPage = { page: Page; settle: (ms: number) => Promise<void> }

async function openApp(): Promise<AppPage> {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
    ...(isStable && { timezoneId: 'UTC', locale: 'en-US', reducedMotion: 'reduce' }),
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
  const settle = (ms: number) => (isStable ? page.clock.runFor(ms) : page.waitForTimeout(ms))

  await page.goto(server.url, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-app-shell]')
  // The mock answers on a delay and the views fetch on mount; give the first
  // screen room to settle before moving on.
  await settle(3000)
  return { page, settle }
}

async function shootApp(shot: Shot): Promise<void> {
  const { page, settle } = await openApp()
  try {
    await navigateTo(page, shot.location)
    await settle(2500)
    if (shot.act) {
      await shot.act(page)
      await settle(600)
    }
    // Favicons and app icons load over the network, in real time.
    if (isStable) await page.waitForFunction(() => [...document.images].every((image) => image.complete))
    await page.screenshot({ path: `${out}/${shot.name}.png`, ...(isStable && { animations: 'disabled' }) })
    console.log(`  ${shot.name}.png`)
  } finally {
    await page.context().close()
  }
}

// The UI library, from Storybook: the states no screen shows. Without the fake
// clock, which would stall Storybook's startup; paused animations and reduced
// motion hold it still.
async function shootStory(storybookUrl: string, story: IndexEntry): Promise<void> {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  try {
    await page.goto(`${storybookUrl}/iframe.html?id=${story.id}&viewMode=story&globals=theme:${theme}`)
    await page.waitForSelector('body.sb-show-main')
    // Fonts, and a play function (a Tooltip story hovers its trigger): the
    // story's render reaches 'finished' once its play function has run, then a
    // moment for what it opened to place itself.
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() => {
      const { __STORYBOOK_PREVIEW__: preview } = window as { __STORYBOOK_PREVIEW__?: StorybookPreview }
      return preview?.currentRender?.phase === 'finished'
    })
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${out}/25-library/${story.id}.png`, fullPage: true, animations: 'disabled' })
  } finally {
    await page.context().close()
  }
}

try {
  // A first visit can make Vite pre-bundle a newly imported dependency and
  // reload the page: let that happen once, before pages load the app side by side.
  const warmUp = await browser.newPage()
  await warmUp.goto(server.url, { waitUntil: 'networkidle' })
  await warmUp.waitForTimeout(2000)
  await warmUp.waitForSelector('[data-app-shell]')
  await warmUp.context().close()

  await runInParallel(isStable ? [...SCREENS, ...SCENES] : SCREENS, shootApp)

  if (isStable) {
    const storybook: RunningServer = existingStorybookUrl
      ? { url: existingStorybookUrl, stop: () => {} }
      : await startStorybook()
    try {
      const stories = await libraryStories(storybook.url)
      await mkdir(`${out}/25-library`, { recursive: true })
      await runInParallel(stories, (story) => shootStory(storybook.url, story))
      libraryCount = stories.length
      console.log(`  25-library/ (${stories.length} stories)`)
    } finally {
      storybook.stop()
    }
  }
} finally {
  await browser.close()
  server.stop()
}

console.log(
  `\n${SCREENS.length + (isStable ? SCENES.length + libraryCount : 0)} screens at ${width}x${height} (@2x), ${jobs} at a time -> ${out}`,
)
