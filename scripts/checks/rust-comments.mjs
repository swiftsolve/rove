/**
 * Hold the Rust comments to the house rules the TS ones follow
 * (scripts/eslint/comments.mjs):
 *
 *   - no em dash;
 *   - short: a `//` note in at most 6 lines of text, a `///` doc in at most
 *     10, and anything longer belongs in docs/. A module's `//!` header, which
 *     documents the whole file, is exempt.
 *
 *   node scripts/checks/rust-comments.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MAX_DOC_LINES, MAX_NOTE_LINES } from '../eslint/comments.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Every comment in `source`: its kind, line, column and text, skipping string and char literals. */
function comments(source) {
  const found = []
  let line = 1
  let col = 0
  let i = 0
  const advance = (n) => {
    for (let k = 0; k < n && i < source.length; k += 1, i += 1) {
      if (source[i] === '\n') {
        line += 1
        col = 0
      } else col += 1
    }
  }
  while (i < source.length) {
    const rest = source.slice(i, i + 3)
    if (rest.startsWith('//')) {
      const end = source.indexOf('\n', i)
      const text = source.slice(i, end === -1 ? source.length : end)
      const kind = /^\/\/\/(?!\/)/.test(text) ? '///' : text.startsWith('//!') ? '//!' : '//'
      const isWholeLine = source.slice(source.lastIndexOf('\n', i - 1) + 1, i).trim() === ''
      found.push({ kind, line, col, text: text.slice(kind.length), isWholeLine })
      advance(text.length)
    } else if (rest.startsWith('/*')) {
      // Block comments nest in Rust.
      const start = { line, col }
      const from = i
      let depth = 0
      do {
        if (source.startsWith('/*', i)) {
          depth += 1
          advance(2)
        } else if (source.startsWith('*/', i)) {
          depth -= 1
          advance(2)
        } else advance(1)
      } while (depth > 0 && i < source.length)
      found.push({ kind: '/*', ...start, text: source.slice(from, i), isWholeLine: false })
    } else if (/^r#*"/.test(source.slice(i, i + 8)) && !/\w/.test(source[i - 1] ?? '')) {
      const hashes = source.slice(i + 1).match(/^#*/)[0]
      const close = source.indexOf(`"${hashes}`, i + 2 + hashes.length)
      advance((close === -1 ? source.length : close + 1 + hashes.length) - i)
    } else if (source[i] === '"') {
      advance(1)
      while (i < source.length && source[i] !== '"') advance(source[i] === '\\' ? 2 : 1)
      advance(1)
    } else if (source[i] === "'" && /^'(\\.[^']*|[^\\'])'/.test(source.slice(i, i + 12))) {
      // A char literal (a lone `'` is a lifetime).
      advance(source.slice(i).match(/^'(\\.[^']*|[^\\'])'/)[0].length)
    } else advance(1)
  }
  return found
}

/** Consecutive whole-line comments of one kind in one column read as one comment. */
function group(found) {
  const groups = []
  for (const comment of found) {
    const last = groups.at(-1)?.at(-1)
    const isContinuation =
      comment.isWholeLine &&
      last?.isWholeLine &&
      last.kind === comment.kind &&
      last.col === comment.col &&
      comment.line === last.line + 1
    if (isContinuation) groups.at(-1).push(comment)
    else groups.push([comment])
  }
  return groups
}

const files = execFileSync('git', ['ls-files', '*.rs'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
const problems = []
for (const file of files) {
  const found = comments(readFileSync(resolve(ROOT, file), 'utf8'))
  for (const comment of found) {
    if (comment.text.includes('—')) {
      problems.push(`${file}:${comment.line}: no em dash in a comment: use a colon, a comma or two sentences`)
    }
  }
  for (const comments of group(found)) {
    const { kind, line } = comments[0]
    const limit = kind === '///' ? MAX_DOC_LINES : kind === '//' ? MAX_NOTE_LINES : Infinity
    const textLines = comments.filter((c) => c.text.trim() !== '').length
    if (textLines > limit) {
      problems.push(
        `${file}:${line}: keep this ${kind} comment to ${limit} lines (it has ${textLines}): say why, briefly; detail belongs in docs/`,
      )
    }
  }
}

if (problems.length > 0) {
  console.error(`Rust comments: ${problems.length} problem${problems.length === 1 ? '' : 's'}\n${problems.join('\n')}`)
  process.exit(1)
}
console.log(`Rust comments OK (${files.length} files)`)
