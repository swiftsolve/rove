/**
 * The house rule for comments, as an ESLint plugin, so the editor flags it as
 * you type (apps/rove/src/README.md, Where code goes): short, a `//` note says why in at
 * most 6 lines, a `/** *\/` doc in at most 10, and anything longer belongs in
 * docs/. A file's opening comment, which documents the whole module, is exempt.
 */
import type { ESLint, Rule } from 'eslint'
import type { Comment, SourceLocation } from 'estree'

// Lines of text, not counting blank ones or a block's delimiters.
const MAX_NOTE_LINES = 6
const MAX_DOC_LINES = 10
// Comments that are instructions to a tool, not prose.
const DIRECTIVE = /^\s*(eslint|prettier-ignore|@ts-|global\s|istanbul|c8|v8)/

// ESLint's parser places every comment, so `loc` is always there.
type PlacedComment = Comment & { loc: SourceLocation }
// A comment as the reader sees it: one block, or a run of `//` lines.
type CommentGroup = [PlacedComment, ...PlacedComment[]]

function isDirective(comment: Comment): boolean {
  return DIRECTIVE.test(comment.value)
}

function isJsDoc(comment: Comment): boolean {
  return comment.type === 'Block' && comment.value.startsWith('*')
}

/** A block comment's text lines, without the `*` gutter. */
function blockLines(comment: Comment): string[] {
  return comment.value
    .replace(/^\*/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, '').trimEnd())
}

/** The comments as the reader sees them: a run of `//` lines on consecutive lines, in one column, is one. */
function groupComments(comments: Comment[]): CommentGroup[] {
  const groups: CommentGroup[] = []
  for (const comment of comments) {
    if (isDirective(comment) || !isPlaced(comment)) continue
    const lastGroup = groups.at(-1)
    const previousComment = lastGroup?.at(-1)
    const isContinuation =
      comment.type === 'Line' &&
      previousComment?.type === 'Line' &&
      comment.loc.start.line === previousComment.loc.end.line + 1 &&
      comment.loc.start.column === previousComment.loc.start.column
    if (lastGroup && isContinuation) lastGroup.push(comment)
    else groups.push([comment])
  }
  return groups
}

function isPlaced(comment: Comment): comment is PlacedComment {
  return comment.loc != null
}

function textLineCount(group: CommentGroup): number {
  if (group[0].type === 'Line') return group.length
  return blockLines(group[0]).filter((line) => line.trim() !== '').length
}

const maxLinesRule: Rule.RuleModule = {
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
            loc: { start: group[0].loc.start, end: (group.at(-1) ?? group[0]).loc.end },
            message: `Keep this comment to ${limit} lines: say why, briefly. Detail that needs more belongs in docs/.`,
          })
        }
      },
    }
  },
}

const plugin: ESLint.Plugin = {
  meta: { name: 'rove-comments' },
  rules: { 'max-lines': maxLinesRule },
}

export default plugin
