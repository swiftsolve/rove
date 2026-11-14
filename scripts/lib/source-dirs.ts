/** Where the UI's source lives: the app's and the library's. */
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const APP_SRC = join(ROOT, 'apps/rove/src')
export const UI_SRC = join(ROOT, 'packages/ui/src')
/** The folders the source checks walk, the app's and the library's. */
export const SOURCE_DIRS = [APP_SRC, UI_SRC]
