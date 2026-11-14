/**
 * The rove-ui CLI's commands, built with Commander. Each reads the catalog it
 * is given and prints through `write`, so a test can run one and read what it
 * printed.
 */
import { Command } from 'commander'

import type { ComponentListJson } from './catalog.ts'
import { findComponent, namedComponents, searchComponents, similarComponentNames } from './catalog.ts'
import { componentDetailsText, componentListText } from './format.ts'

export type CliOutput = {
  /** Prints the command's answer. */
  write: (text: string) => void
  /** Prints why a command failed. */
  writeError: (text: string) => void
}

/** Commander's options shared by every command. */
type GlobalOptions = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Commander names it after the `--json` flag
  json?: boolean
}

/** A value as indented JSON, for `--json`. */
function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

/** The rove-ui program, ready for `parse` or `parseAsync`. */
export function createProgram(catalog: ComponentListJson, output: CliOutput): Command {
  // Typed, so TypeScript knows `program.error` never returns and narrows after it.
  const program: Command = new Command('rove-ui')
    .description("Look up Rove's UI library components: their props, usage guide, Figma component and stories.")
    .option('--json', 'print the catalog entries as JSON instead of text')
    .configureOutput({ writeOut: output.write, writeErr: output.writeError })
    .showHelpAfterError('Run `rove-ui --help` for the commands.')
    // Throws a CommanderError instead of exiting, so the caller sets the exit code.
    .exitOverride()

  function isJson(): boolean {
    return program.opts<GlobalOptions>().json === true
  }

  program
    .command('list')
    .description('list every component under its group')
    .option('-g, --group <group>', 'only this group, like Actions or "Data display"')
    .action((options: { group?: string }) => {
      const wantedGroup = options.group?.toLowerCase()
      const components = namedComponents(catalog).filter(
        (component) => wantedGroup === undefined || component.libraryGroup.toLowerCase() === wantedGroup,
      )
      if (components.length === 0) {
        const groups = [...new Set(namedComponents(catalog).map((component) => component.libraryGroup))]
        program.error(`No group named "${options.group ?? ''}". Groups: ${groups.join(', ')}`)
      }
      output.write(`${isJson() ? jsonText(components) : componentListText(components)}\n`)
    })

  program
    .command('show')
    .description("one component's description, props, parts, usage guide, Figma component and stories")
    .argument('<name>', 'its name, like Button or CardHeader (any case)')
    .action((name: string) => {
      const component = findComponent(catalog, name)
      if (component === null) {
        const similarNames = similarComponentNames(catalog, name)
        const suggestion = similarNames.length > 0 ? ` Did you mean: ${similarNames.join(', ')}?` : ''
        program.error(`No component named "${name}".${suggestion}`)
      }
      output.write(`${isJson() ? jsonText(component) : componentDetailsText(catalog, component)}\n`)
    })

  program
    .command('search')
    .description('the components whose name, description, props or usage guide hold every word')
    .argument('<words...>', 'words to look for, like "status line" or tooltip')
    .action((words: string[]) => {
      const components = searchComponents(catalog, words)
      if (isJson()) {
        output.write(`${jsonText(components)}\n`)
        return
      }
      if (components.length === 0) {
        output.write(`No component mentions "${words.join(' ')}".\n`)
        return
      }
      output.write(`${componentListText(components)}\n`)
    })

  program
    .command('icons')
    .description('the icon names the library exports, optionally only those holding some text')
    .argument('[text]', 'part of a name, like wifi')
    .action((text: string | undefined) => {
      const wantedText = text?.toLowerCase() ?? ''
      const iconNames = catalog.iconNames.filter((iconName) => iconName.toLowerCase().includes(wantedText))
      output.write(`${isJson() ? jsonText(iconNames) : iconNames.join('\n')}\n`)
    })

  return program
}
