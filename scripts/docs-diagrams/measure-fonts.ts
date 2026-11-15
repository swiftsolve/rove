/**
 * Measure the doc diagrams' fonts into font-metrics.json: each printable
 * ASCII character's advance, and each font's ascent and descent, per em. The
 * layout wraps and places text from these numbers, so a line never runs past
 * its card and the check needs no browser. Run it again when a font changes.
 *
 *   node scripts/docs-diagrams/measure-fonts.ts
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const FONTS = join(resolve(HERE, '../..'), 'packages/ui/src/fonts')
const OUTPUT = join(HERE, 'font-metrics.json')

/** Each style the diagrams set text in, as a CSS font shorthand at 100px. */
const STYLES = {
  body: '400 100px "Hanken Grotesk"',
  stage: '500 100px "Hanken Grotesk"',
  name: '700 100px Urbanist',
  title: '700 100px Urbanist',
  chip: '700 100px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

/** A wide system monospace, so a chip sized on it fits on every reader's machine. */
const MONOSPACE_MIN_ADVANCE = 0.62

const CHARACTERS = [...Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)), '…', '’']

async function fontUrl(file: string): Promise<string> {
  const data = (await readFile(join(FONTS, file))).toString('base64')
  return `data:font/woff2;base64,${data}`
}

const browser = await chromium.launch()
const page = await browser.newPage()
const fonts = {
  urbanist: await fontUrl('Urbanist-latin.woff2'),
  hanken: await fontUrl('HankenGrotesk-latin.woff2'),
}
const metrics = await page.evaluate(
  async ({ styles, characters, fontUrls }) => {
    for (const [family, url] of [
      ['Urbanist', fontUrls.urbanist],
      ['Hanken Grotesk', fontUrls.hanken],
    ] as const) {
      const face = new FontFace(family, `url(${url})`, { weight: '100 900' })
      document.fonts.add(await face.load())
    }
    const context = document.createElement('canvas').getContext('2d')
    if (!context) throw new Error('no 2D canvas')
    const result: Record<string, { ascent: number; descent: number; advances: Record<string, number> }> = {}
    for (const [style, font] of Object.entries(styles)) {
      context.font = font
      const box = context.measureText('Hg')
      const advances: Record<string, number> = {}
      for (const character of characters) advances[character] = context.measureText(character).width / 100
      result[style] = {
        ascent: box.fontBoundingBoxAscent / 100,
        descent: box.fontBoundingBoxDescent / 100,
        advances,
      }
    }
    return result
  },
  { styles: STYLES, characters: CHARACTERS, fontUrls: fonts },
)
await browser.close()

const chip = metrics.chip
if (chip) {
  for (const character of Object.keys(chip.advances)) {
    chip.advances[character] = Math.max(chip.advances[character] ?? 0, MONOSPACE_MIN_ADVANCE)
  }
}
await writeFile(OUTPUT, `${JSON.stringify(metrics, null, 2)}\n`)
console.log(`wrote ${OUTPUT}`)
