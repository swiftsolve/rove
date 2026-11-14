import { CommanderError } from 'commander'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ComponentEntry } from './catalog/catalog.ts'
import { readCatalog, similarComponentNames } from './catalog/catalog.ts'
import type { PickActionId } from './program.ts'
import { createProgram } from './program.ts'

const catalog = readCatalog()

/** What a run printed, did and noted, and the exit code Commander gave a failed one. */
type RunResult = {
  printed: string
  errors: string
  exitCode: number
  notes: string[]
  copiedTexts: string[]
  openedUrls: string[]
}

/**
 * How a run's terminal behaves: whether a person is there, the components
 * they pick and the actions they choose, in order (null cancels), and whether
 * the system has a clipboard.
 */
type TerminalStandIn = {
  isInteractive?: boolean
  pickedNames?: (string | null)[]
  chosenActions?: (PickActionId | null)[]
  hasClipboard?: boolean
  columns?: number
  rows?: number
}

/** Runs rove-ui with these arguments against the real catalog. */
async function runCli(args: string[], terminal: TerminalStandIn = {}): Promise<RunResult> {
  let printed = ''
  let errors = ''
  const notes: string[] = []
  const copiedTexts: string[] = []
  const openedUrls: string[] = []
  const pickedNames = [...(terminal.pickedNames ?? [])]
  const chosenActions = [...(terminal.chosenActions ?? [])]
  const program = createProgram(catalog, {
    write: (text) => (printed += text),
    writeError: (text) => (errors += text),
    columns: terminal.columns ?? 100,
    rows: terminal.rows ?? 40,
    isInteractive: terminal.isInteractive ?? false,
    askForComponentName: () => Promise.resolve(pickedNames.shift() ?? null),
    askForAction: () => Promise.resolve(chosenActions.shift() ?? null),
    copyToClipboard: (text) => {
      if (terminal.hasClipboard) {
        copiedTexts.push(text)
      }
      return Promise.resolve(terminal.hasClipboard === true)
    },
    openInBrowser: (url) => openedUrls.push(url),
    writeNote: (text) => notes.push(text),
  })
  let exitCode = 0
  try {
    await program.parseAsync(args, { from: 'user' })
  } catch (error) {
    if (!(error instanceof CommanderError)) {
      throw error
    }
    exitCode = error.exitCode
  }
  return { printed, errors, exitCode, notes, copiedTexts, openedUrls }
}

describe('rove-ui show', () => {
  it("prints a component's props, usage guide, Figma component and stories", async () => {
    const { printed } = await runCli(['show', 'Button'])
    expect(printed.startsWith('  Button  Actions\n')).toBe(true)
    expect(printed).toMatch(/\n {4}variant +'solid' \| 'soft' {2}default soft\n/)
    expect(printed).toContain('  WHEN NOT TO USE\n    ✗ Opening another view')
    expect(printed).toMatch(/ {2}Figma +Button {2}https:\/\/www\.figma\.com\/design\//)
    expect(printed).toContain('?path=/docs/actions-button--docs')
    expect(printed).toContain('  STORIES (9)\n    solid, solid-negative,')
  })

  it('finds a component whatever its case', async () => {
    const { printed } = await runCli(['show', 'cardheader'])
    expect(printed).toContain('CardHeader  Containers')
    expect(printed).toContain('Part of Card')
  })

  it("lists a family's parts", async () => {
    const { printed } = await runCli(['show', 'Card'])
    expect(printed).toMatch(/PARTS\n {4}- CardBody: /)
  })

  it('says why a component has no Figma component', async () => {
    const { printed } = await runCli(['show', 'StretchedLink'])
    expect(printed).toMatch(/ {2}Figma +none\. Draws nothing/)
  })

  it('keeps every line but a link within the terminal width', async () => {
    const { printed } = await runCli(['show', 'Card'])
    // An address can't break between words, so its line may run on.
    const linesOfWords = printed.split('\n').filter((line) => !line.includes('https://'))
    const longestLine = Math.max(...linesOfWords.map((line) => line.length))
    expect(longestLine).toBeLessThanOrEqual(100)
  })

  it('drops prop descriptions under their names on a narrow terminal', async () => {
    const { printed } = await runCli(['show', 'Toggle'], { columns: 50 })
    expect(printed).toMatch(/\n {4}isDisabled {2}boolean {2}default false\n {6}Drops input/)
  })

  describe('colour', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('colours a terminal that shows colour, and drops it with --no-color', async () => {
      vi.stubEnv('NO_COLOR', undefined)
      vi.stubEnv('FORCE_COLOR', '1')
      const colored = await runCli(['show', 'Button'])
      expect(colored.printed).toContain('\x1b[')
      const plain = await runCli(['--no-color', 'show', 'Button'])
      expect(plain.printed).not.toContain('\x1b[')
    })
  })

  it('prints Markdown with --md, without columns', async () => {
    const { printed } = await runCli(['--md', 'show', 'Button'])
    expect(printed.startsWith('# Button\nActions. A text button.')).toBe(true)
    expect(printed).toContain("- `variant`: 'solid' | 'soft', default soft. `solid` for a page's main action")
    expect(printed).toContain('## When not to use\n- Opening another view or an address: use `Link`.')
    expect(printed).toContain('- Docs: https://nabilr.com/rove/storybook/?path=/docs/actions-button--docs')
  })

  it('refuses --md and --json together', async () => {
    const { errors, exitCode } = await runCli(['--md', '--json', 'show', 'Button'])
    expect(exitCode).toBe(1)
    expect(errors).toContain("option '--md' cannot be used with option '--json'")
  })

  it('prints the catalog entry with --json', async () => {
    const { printed } = await runCli(['--json', 'show', 'Button'])
    const entry = JSON.parse(printed) as ComponentEntry & { name: string }
    expect(entry.name).toBe('Button')
    expect(entry.props).toHaveProperty('variant')
  })

  it('fails on an unknown name and suggests the one meant', async () => {
    const { errors, exitCode } = await runCli(['show', 'Buton'])
    expect(exitCode).toBe(1)
    expect(errors).toContain('Did you mean: Button?')
  })
})

describe('rove-ui list', () => {
  it('lists every component under its group', async () => {
    const { printed } = await runCli(['list'])
    for (const name of Object.keys(catalog.components)) {
      expect(printed).toContain(name)
    }
    expect(printed).toMatch(/^Actions\n {2}Button: /)
  })

  it('lists them as Markdown with --md', async () => {
    const { printed } = await runCli(['--md', 'list', '--group', 'actions'])
    expect(printed).toMatch(/^## Actions\n- Button: A text button\./)
  })

  it('keeps to one group, whatever its case', async () => {
    const { printed } = await runCli(['list', '--group', 'data display'])
    expect(printed.startsWith('Data display\n')).toBe(true)
    expect(printed).not.toContain('Button:')
  })

  it('fails on an unknown group and names the real ones', async () => {
    const { errors, exitCode } = await runCli(['list', '--group', 'Nope'])
    expect(exitCode).toBe(1)
    expect(errors).toContain('Groups: Actions')
  })
})

describe('rove-ui search', () => {
  it('finds components whose usage guide holds every word', async () => {
    const { printed } = await runCli(['search', 'disabled', 'tooltip'])
    expect(printed).toContain('Button:')
  })

  it('says when nothing matches', async () => {
    const { printed } = await runCli(['search', 'zzzz'])
    expect(printed).toBe('No component mentions "zzzz".\n')
  })
})

describe('rove-ui pick', () => {
  it('shows the component the person picks', async () => {
    const { printed } = await runCli(['pick'], {
      isInteractive: true,
      pickedNames: ['CardHeader'],
      chosenActions: ['show', null],
    })
    expect(printed).toContain('CardHeader  Containers')
  })

  it('copies the import line, or prints it when there is no clipboard', async () => {
    const terminal = { isInteractive: true, pickedNames: ['Button'], chosenActions: ['copyImport' as const, null] }
    const withClipboard = await runCli(['pick'], { ...terminal, hasClipboard: true })
    expect(withClipboard.copiedTexts).toEqual(["import { Button } from '@swiftsolve/rove-ui'"])
    const withoutClipboard = await runCli(['pick'], { ...terminal, hasClipboard: false })
    expect(withoutClipboard.notes[0]).toContain("Copy it from here: import { Button } from '@swiftsolve/rove-ui'")
  })

  it('opens the Docs page and the Figma component', async () => {
    const { openedUrls } = await runCli(['pick'], {
      isInteractive: true,
      pickedNames: ['Button'],
      chosenActions: ['openDocs', 'openFigma', null],
    })
    expect(openedUrls).toEqual([
      'https://nabilr.com/rove/storybook/?path=/docs/actions-button--docs',
      'https://www.figma.com/design/NoICIoyhWNOya9tOnNfEhH/Rove-Design-System?node-id=42-189',
    ])
  })

  it('goes back to the list to pick another', async () => {
    const { printed } = await runCli(['pick'], {
      isInteractive: true,
      pickedNames: ['Button', 'Link'],
      chosenActions: ['pickAnother', 'show', null],
    })
    expect(printed).toContain('Link  Actions')
    expect(printed).not.toContain('Button  Actions')
  })

  it('prints nothing when the person cancels', async () => {
    const { printed, exitCode } = await runCli(['pick'], { isInteractive: true, pickedNames: [null] })
    expect(printed).toBe('')
    expect(exitCode).toBe(0)
  })

  it('refuses a terminal smaller than it fits, and says how small', async () => {
    const { errors, exitCode } = await runCli(['pick'], { isInteractive: true, columns: 30, rows: 40 })
    expect(exitCode).toBe(1)
    expect(errors).toContain('at least 40x16; this one is 30x40')
  })

  it('refuses without a terminal, and points at list and show', async () => {
    const { errors, exitCode } = await runCli(['pick'], { isInteractive: false })
    expect(exitCode).toBe(1)
    expect(errors).toContain('rove-ui show <name>')
  })
})

describe('rove-ui icons', () => {
  it('lists the icon names holding some text', async () => {
    const { printed } = await runCli(['icons', 'wifi'])
    const iconNames = printed.trim().split('\n')
    expect(iconNames).toContain('WifiIcon')
    expect(iconNames.every((iconName) => iconName.toLowerCase().includes('wifi'))).toBe(true)
  })
})

describe('similarComponentNames', () => {
  it('suggests names a typo away, or holding what was typed', () => {
    expect(similarComponentNames(catalog, 'Buton')).toContain('Button')
    expect(similarComponentNames(catalog, 'cardhead')).toContain('CardHeader')
    expect(similarComponentNames(catalog, 'Qwertyuiop')).toEqual([])
  })
})
