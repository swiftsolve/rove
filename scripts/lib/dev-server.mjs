/**
 * Helpers the scripts that drive the app in a browser share
 * (screenshots.mjs, a11y-audit.mjs): reading a `--flag`, and starting the Vite
 * dev server on a free port.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEV_SERVER_START_TIMEOUT_MS = 30_000

/** The value after `--<name>` on the command line, or `fallback`. */
export function flag(name, fallback) {
  const at = process.argv.indexOf(`--${name}`)
  return at === -1 ? fallback : process.argv[at + 1]
}

/**
 * An unused port, so we never fight a `tauri:dev` already holding vite's
 * default. The config pins that port with `strictPort`, so a collision is
 * fatal rather than a bump to the next one.
 */
export function freePort() {
  return new Promise((ok) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => ok(port))
    })
  })
}

/** Start `vite` and resolve once it prints the URL it settled on. */
export async function startDevServer() {
  const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    // vite.config.ts reads PORT; see its `server.port`.
    env: { ...process.env, PORT: String(await freePort()) },
  })
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('dev server never printed a URL')), DEV_SERVER_START_TIMEOUT_MS)
    vite.stdout.on('data', (chunk) => {
      const url = /(http:\/\/localhost:\d+)/.exec(String(chunk))?.[1]
      if (!url) return
      clearTimeout(timer)
      ok({ url, stop: () => vite.kill() })
    })
    vite.on('exit', (code) => fail(new Error(`dev server exited (${code})`)))
  })
}
