/**
 * Helpers the scripts that drive the app in a browser share
 * (screenshots.ts, a11y-audit.ts): reading a `--flag` and the window's size, and
 * starting the Vite dev server on a free port.
 */
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { type AddressInfo, createServer } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEV_SERVER_START_TIMEOUT_MS = 30_000

/** A server a script drives, and how to stop it (a no-op for one it didn't start). */
export type RunningServer = { url: string; stop: () => void }

/** The part of apps/rove/src-tauri/tauri.conf.json the scripts read: the app window's size. */
type WindowSize = { width: number; height: number }
type TauriConfig = { app: { windows: WindowSize[] } }

/** The app window's size, from the Tauri config, so a page opens the size the window is. */
export async function readWindowSize(): Promise<WindowSize> {
  const { app } = JSON.parse(
    await readFile(resolve(ROOT, 'apps/rove/src-tauri/tauri.conf.json'), 'utf8'),
  ) as TauriConfig
  // Rove has one window; its config lists it first.
  const [appWindow] = app.windows
  if (!appWindow) throw new Error('apps/rove/src-tauri/tauri.conf.json lists no window')
  return { width: appWindow.width, height: appWindow.height }
}

/** The value after `--<name>` on the command line, or null when it isn't there. */
export function flag(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? null : (process.argv[at + 1] ?? null)
}

/**
 * An unused port, so we never fight a `tauri:dev` already holding vite's
 * default. The config pins that port with `strictPort`, so a collision is
 * fatal rather than a bump to the next one.
 */
export function freePort(): Promise<number> {
  return new Promise((ok) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      // Listening on a TCP port, so the address is an AddressInfo, never a pipe's path.
      const { port } = probe.address() as AddressInfo
      probe.close(() => ok(port))
    })
  })
}

/** Start `vite` and resolve once it prints the URL it settled on. */
export async function startDevServer(): Promise<RunningServer> {
  const vite = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js')], {
    cwd: join(ROOT, 'apps/rove'),
    stdio: ['ignore', 'pipe', 'inherit'],
    // apps/rove/vite.config.ts reads PORT; see its `server.port`.
    env: { ...process.env, PORT: String(await freePort()) },
  })
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('dev server never printed a URL')), DEV_SERVER_START_TIMEOUT_MS)
    vite.stdout.on('data', (chunk: Buffer) => {
      const url = /(http:\/\/localhost:\d+)/.exec(chunk.toString())?.[1]
      if (!url) return
      clearTimeout(timer)
      ok({ url, stop: () => vite.kill() })
    })
    vite.on('exit', (code) => {
      fail(new Error(`dev server exited (${String(code)})`))
    })
  })
}
