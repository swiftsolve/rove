import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

// ── Doc copy ───────────────────────────────────────────────────────────────

// Copy never punctuates with an em dash: two short sentences read better. The
// lookahead leaves a lone dash, a table's empty cell, alone.
const NO_EM_DASH_MESSAGE = 'No em dash in copy: write two short sentences or rephrase.'
const NO_EM_DASH = [
  'Literal[value=/(?=[\\s\\S]*[^\\s—])[\\s\\S]*—/]',
  'TemplateElement[value.raw=/—/]',
  'JSXText[value=/(?=[\\s\\S]*[^\\s—])[\\s\\S]*—/]',
].map((selector) => ({ selector, message: NO_EM_DASH_MESSAGE }))

// ── Names ──────────────────────────────────────────────────────────────────
// As in Rove. `no-restricted-syntax` doesn't merge across blocks, so the doc
// copy block repeats these.

// An event handler is onX as a local too, the name its prop takes.
const NO_HANDLE_PREFIX_MESSAGE = 'Name an event handler onX (onClick), as a local and as a prop, not handleX.'
const NO_HANDLE_PREFIX = [
  'VariableDeclarator[id.name=/^handle[A-Z]/]',
  'FunctionDeclaration[id.name=/^handle[A-Z]/]',
].map((selector) => ({ selector, message: NO_HANDLE_PREFIX_MESSAGE }))
// A boolean reads as a yes/no question. With no types to tell, it's caught by
// its shape: a variable set to a comparison or a `!`.
const BOOLEAN_PREFIXES = [
  'is',
  'are',
  'has',
  'have',
  'can',
  'should',
  'was',
  'were',
  'did',
  'does',
  'will',
  'needs',
  'meets',
  'may',
]
const NOT_A_QUESTION = `:not([id.name=/^(${BOOLEAN_PREFIXES.join('|')})[A-Z0-9]|^(${BOOLEAN_PREFIXES.join('|').toUpperCase()})_/])`
const UNTYPED_BOOLEAN_NAME = [
  `VariableDeclarator[init.type="BinaryExpression"][init.operator=/^(===|!==|==|!=|<|>|<=|>=|in|instanceof)$/]${NOT_A_QUESTION}`,
  `VariableDeclarator[init.type="UnaryExpression"][init.operator="!"]${NOT_A_QUESTION}`,
].map((selector) => ({ selector, message: `Name a boolean as a question: ${BOOLEAN_PREFIXES.join('/')} + a noun.` }))
const NAMES = [...NO_HANDLE_PREFIX, ...UNTYPED_BOOLEAN_NAME]

export default tseslint.config(
  // ── Not ours to lint ─────────────────────────────────────────────────────
  // Build outputs, and .claude's agent worktrees (other checkouts).
  { ignores: ['dist', 'storybook-static', '.claude'] },

  // ── Presets ──────────────────────────────────────────────────────────────
  js.configs.recommended,
  // The scripts and the plugin's test have type information (tsconfig.json),
  // so they get the strict, type-aware sets, as Rove's scripts do.
  ...[...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked].map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),

  // ── Every file ───────────────────────────────────────────────────────────
  {
    // Packages, then relative paths; each group alphabetical. `--fix` sorts them.
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      // Named steps over dense expressions: a third case is an if or a lookup.
      'no-nested-ternary': 'error',
      'no-restricted-syntax': ['error', ...NAMES],
    },
  },

  // ── Node: the build, the checks, the plugin's test, this config ──────────
  {
    files: ['**/*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Node runs them as .ts; tsconfig.json types them.
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },

  {
    // The plugin's test stands in for Figma's Plugin API, so it keeps that
    // API's shape: async getters with nothing to await, an empty loadFontAsync,
    // code syntax deleted by platform, and code.js run through new Function, as
    // Figma runs it. node:test's test() needs no await at the top level.
    files: ['figma-plugin/code.test.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': ['error', { allow: ['arrowFunctions', 'asyncMethods'] }],
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-implied-eval': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-floating-promises': [
        'error',
        { allowForKnownSafeCalls: [{ from: 'package', name: 'test', package: 'node:test' }] },
      ],
    },
  },

  // ── The Storybook: React in the browser ──────────────────────────────────
  {
    files: ['stories/**/*.{js,jsx}', '.storybook/**/*.{js,jsx}'],
    ...reactHooks.configs.flat.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // The pages are doc copy.
    files: ['stories/**/*.{js,jsx}'],
    rules: { 'no-restricted-syntax': ['error', ...NO_EM_DASH, ...NAMES] },
  },

  // ── The Figma plugin: Figma's sandbox ────────────────────────────────────
  {
    files: ['figma-plugin/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { figma: 'readonly', __html__: 'readonly' } },
  },
)
