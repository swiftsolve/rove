/**
 * The house rules for comments, as an ESLint plugin, so the editor flags them
 * as you type (docs/develop/frontend.md, Where code goes):
 *
 *   - no em dash, as in copy;
 *   - a `/** *\/` that fits on one line is written on one line (`--fix` joins it);
 *   - short: a `//` note says why in at most 6 lines, a `/** *\/` doc in at
 *     most 10, and anything longer belongs in docs/. A file's opening comment,
 *     which documents the whole module, is exempt.
 */

// Lines of text, not counting blank ones or a block's delimiters.
const MAX_NOTE_LINES = 6
const MAX_DOC_LINES = 10
// Prettier's printWidth (.prettierrc.json).
const PRINT_WIDTH = 120
// Comments that are instructions to a tool, not prose.
const DIRECTIVE = /^\s*(eslint|prettier-ignore|@ts-|global\s|istanbul|c8|v8)/

function isDirective(comment) {
  return DIRECTIVE.test(comment.value)
}

function isJsDoc(comment) {
  return comment.type === 'Block' && comment.value.startsWith('*')
}

/** A block comment's text lines, without the `*` gutter. */
function blockLines(comment) {
  return comment.value
    .replace(/^\*/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, '').trimEnd())
}

/** The comments as the reader sees them: a run of `//` lines on consecutive lines, in one column, is one. */
function groupComments(comments) {
  const groups = []
  for (const comment of comments) {
    if (isDirective(comment)) continue
    const last = groups.at(-1)?.at(-1)
    const isContinuation =
      comment.type === 'Line' &&
      last?.type === 'Line' &&
      comment.loc.start.line === last.loc.end.line + 1 &&
      comment.loc.start.column === last.loc.start.column
    if (isContinuation) groups.at(-1).push(comment)
    else groups.push([comment])
  }
  return groups
}

function textLineCount(group) {
  if (group[0].type === 'Line') return group.length
  return blockLines(group[0]).filter((line) => line.trim() !== '').length
}

const noEmDash = {
  meta: { type: 'suggestion', docs: { description: 'No em dash in a comment.' }, schema: [] },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.value.includes('—')) {
            context.report({
              loc: comment.loc,
              message: 'No em dash in a comment: use a colon, a comma or two sentences.',
            })
          }
        }
      },
    }
  },
}

const singleLineJsDoc = {
  meta: {
    type: 'layout',
    fixable: 'code',
    docs: { description: 'A `/** */` comment that fits on one line is written on one line.' },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (!isJsDoc(comment) || comment.loc.start.line === comment.loc.end.line) continue
          const lines = blockLines(comment).filter((line) => line.trim() !== '')
          // Several paragraphs, a list, a code sample or a tag keep their shape.
          const hasStructure =
            blockLines(comment)
              .slice(1, -1)
              .some((line) => line.trim() === '') || lines.some((line) => /^(\s|[-*+] |\d+\. |```|@)/.test(line))
          if (hasStructure || lines.length === 0) continue
          const joined = `/** ${lines.join(' ')} */`
          if (comment.loc.start.column + joined.length > PRINT_WIDTH) continue
          context.report({
            loc: comment.loc,
            message: 'This comment fits on one line: write it as `/** … */`.',
            fix: (fixer) => fixer.replaceTextRange(comment.range, joined),
          })
        }
      },
    }
  },
}

const maxLines = {
  meta: {
    type: 'suggestion',
    docs: {
      description: `A \`//\` note is at most ${MAX_NOTE_LINES} lines of text, a \`/** */\` doc ${MAX_DOC_LINES}.`,
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const { sourceCode } = context
        for (const group of groupComments(sourceCode.getAllComments())) {
          const isFileHeader = sourceCode.getTokenBefore(group[0], { includeComments: true }) === null
          const limit = isJsDoc(group[0]) ? MAX_DOC_LINES : MAX_NOTE_LINES
          if (isFileHeader || textLineCount(group) <= limit) continue
          context.report({
            loc: { start: group[0].loc.start, end: group.at(-1).loc.end },
            message: `Keep this comment to ${limit} lines: say why, briefly. Detail that needs more belongs in docs/.`,
          })
        }
      },
    }
  },
}

export default {
  meta: { name: 'rove-comments' },
  rules: { 'no-em-dash': noEmDash, 'single-line-jsdoc': singleLineJsDoc, 'max-lines': maxLines },
}
