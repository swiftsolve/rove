/**
 * DTCG text styles -> text-styles.css: one class per Figma text style, so a
 * style is applied whole (`class="type-heading-large"`) instead of as its four
 * --type-* variables. Each class reads those variables, so a theme or token
 * change flows through, and sets no colour, as a Figma text style doesn't.
 *
 * The classes sit in `@layer components`: under Tailwind's utilities, so an
 * element's own utilities still win, and over its base reset, in a project
 * that declares Tailwind's layer order first. Without Tailwind, the layer is
 * simply under unlayered CSS.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { EXTENSION } from './figma-to-dtcg.mjs'

const CASES = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' }

export async function buildTextStylesCss({ dir, header }) {
  const tokens = JSON.parse(await readFile(resolve(dir, 'text-styles.tokens.json'), 'utf8')).type
  const rules = Object.entries(tokens).map(([slug, token]) => {
    const prefix = `--type-${slug}`
    // {font-family.sans} is --font-family-sans.
    const family = `--${token.$value.fontFamily.slice(1, -1).replace(/\./g, '-')}`
    const textCase = CASES[token.$extensions?.[EXTENSION]?.textCase]
    const use = token.$description?.replace(/ Code:.*$/, '')
    return [
      ...(use ? [`  /* ${use} */`] : []),
      `  .type-${slug} {`,
      `    font-family: var(${family});`,
      `    font-size: var(${prefix}-size);`,
      `    font-weight: var(${prefix}-weight);`,
      `    line-height: var(${prefix}-line-height);`,
      `    letter-spacing: var(${prefix}-letter-spacing);`,
      ...(textCase ? [`    text-transform: ${textCase};`] : []),
      '  }',
    ].join('\n')
  })
  const css = `${header}\n\n@layer components {\n${rules.join('\n\n')}\n}\n`
  return { css, count: rules.length }
}
