/**
 * Open presentation/index.html in the default browser.
 *
 *   npm run present:open
 *
 * The page is static (one HTML file and its frames), so it opens straight
 * from disk; no server needed. Run `npm run present` first to export it.
 */
import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const page = resolve(ROOT, 'presentation/index.html')

try {
  await access(page)
} catch {
  console.error('No presentation yet. Run `npm run present` to export it from Figma.')
  process.exit(1)
}

const [command, ...args] = {
  darwin: ['open'],
  win32: ['cmd', '/c', 'start', ''], // the empty title, so start treats the path as the file
}[process.platform] ?? ['xdg-open']

spawn(command, [...args, page], { detached: true, stdio: 'ignore' }).unref()
console.log(`Opened ${page}`)
