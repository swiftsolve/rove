/**
 * The house rules for comments, as an ESLint plugin, so the editor flags them as
 * you type (apps/rove/src/README.md, Where code goes): short, a `//` note says why in at
 * most 6 lines, a `/** *\/` doc in at most 10, and anything longer belongs in
 * docs/. A file's opening comment, which documents the whole module, is exempt.
 * A comment that describes a declaration is a `/** *\/` doc, so it shows on hover.
 */
import type { ESLint, Rule, SourceCode } from 'eslint'
import type { Comment, SourceLocation } from 'estree'

/** Lines of text, not counting blank ones or a block's delimiters. */
const MAX_NOTE_LINES = 6
const MAX_DOC_LINES = 10
/** Comments that are instructions to a tool, not prose. */
const DIRECTIVE = /^\s*(eslint|prettier-ignore|@ts-|global\s|istanbul|c8|v8)/

/** ESLint's parser places every comment, so `loc` is always there. */
type PlacedComment = Comment & { loc: SourceLocation }
/** A comment as the reader sees it: one block, or a run of `//` lines. */
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

/** Declarations a comment right above documents: module-level ones and the members of a type or class. */
const DOCUMENTED_NODE_TYPES = new Set([
  'FunctionDeclaration',
  'VariableDeclaration',
  'ClassDeclaration',
  'TSInterfaceDeclaration',
  'TSTypeAliasDeclaration',
  'TSEnumDeclaration',
  'TSPropertySignature',
  'TSMethodSignature',
  'PropertyDefinition',
  'MethodDefinition',
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
])

/** Parents whose children above count as declarations, not statements in a body. */
const DECLARATION_PARENT_TYPES = new Set([
  'Program',
  'ExportNamedDeclaration',
  'ExportDefaultDeclaration',
  'TSInterfaceBody',
  'TSTypeLiteral',
  'ClassBody',
])

/** The outermost node that starts at `start`, below the program. */
function nodeStartingAt(sourceCode: SourceCode, start: number): Rule.Node | null {
  let node = sourceCode.getNodeByRangeIndex(start) as Rule.Node | null
  while (node?.parent?.range?.[0] === start && node.parent.type !== 'Program') node = node.parent
  return node
}

/** A `//` group's text as a `/** *\/` doc, indented to `column`. */
function asDocComment(group: CommentGroup, column: number): string {
  const lines = group.map((comment) => comment.value.replace(/^ /, '').trimEnd())
  if (lines.length === 1) return `/** ${lines[0]} */`
  const indent = ' '.repeat(column)
  const body = lines.map((line) => (line === '' ? `${indent} *` : `${indent} * ${line}`)).join('\n')
  return `/**\n${body}\n${indent} */`
}

const docOnDeclarationsRule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: { description: 'A comment right above a declaration is a `/** */` doc, so it shows on hover.' },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        const { sourceCode } = context
        for (const group of groupComments(sourceCode.getAllComments())) {
          const first = group[0]
          const last = group.at(-1) ?? first
          if (first.type !== 'Line') continue
          // A comment after code on its line annotates that line, not what follows.
          const before = sourceCode.getTokenBefore(first, { includeComments: true })
          if (before?.loc?.end.line === first.loc.start.line) continue
          const next = sourceCode.getTokenAfter(last)
          if (next === null) continue
          // Only a comment touching the code below documents it; one set off by
          // a blank line heads a section.
          if (next.loc.start.line !== last.loc.end.line + 1) continue
          const node = nodeStartingAt(sourceCode, next.range[0])
          // A re-export (`export { x }`) declares nothing a hover could show.
          const isReExport = node?.type === 'ExportNamedDeclaration' && node.declaration === null
          const isDeclaration =
            node !== null &&
            !isReExport &&
            DOCUMENTED_NODE_TYPES.has(node.type) &&
            DECLARATION_PARENT_TYPES.has(node.parent?.type ?? '')
          if (!isDeclaration) continue
          const canFix = group.every((comment) => !comment.value.includes('*/'))
          const replacedRange: [number, number] = [
            sourceCode.getIndexFromLoc(first.loc.start),
            sourceCode.getIndexFromLoc(last.loc.end),
          ]
          context.report({
            loc: { start: first.loc.start, end: last.loc.end },
            message: 'This comment describes a declaration: make it a `/** */` doc so it shows on hover.',
            fix: canFix
              ? (fixer) => fixer.replaceTextRange(replacedRange, asDocComment(group, first.loc.start.column))
              : null,
          })
        }
      },
    }
  },
}

const plugin: ESLint.Plugin = {
  meta: { name: 'rove-comments' },
  rules: { 'max-lines': maxLinesRule, 'doc-on-declarations': docOnDeclarationsRule },
}

export default plugin
