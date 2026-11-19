/** Where the UI's source lives: the app's and the library's. */
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const APP_SRC = join(ROOT, 'apps/rove/src')
export const UI_SRC = join(ROOT, 'packages/ui/src')
/** The folders the source checks walk, the app's and the library's. */
export const SOURCE_DIRS = [APP_SRC, UI_SRC]

const requireFromLibrary = createRequire(join(ROOT, 'packages/ui/package.json'))

/**
 * The path of a package the library depends on (its tokens, its icons), found
 * from the library's folder: pnpm links a package only into the workspace that
 * declares it, so the root can't resolve it.
 */
export function resolveFromLibrary(specifier: string): string {
  return requireFromLibrary.resolve(specifier)
}
