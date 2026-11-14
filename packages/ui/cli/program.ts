/**
 * The rove-ui CLI's commands, built with Commander. Each reads the catalog it
 * is given, prints through `write` and asks through `askForComponentName`, so a
 * test can run one with stand-ins and read what it printed.
 */
import { Command } from 'commander'

import type { ComponentListJson, NamedComponent } from './catalog.ts'
import { findComponent, namedComponents, searchComponents, similarComponentNames } from './catalog.ts'
import { componentDetailsText, componentListText } from './format.ts'
import { figmaComponentUrl, importLine, storybookDocsUrl } from './links.ts'

/** Where the CLI prints its answers and asks its questions. */
export type CliTerminal = {
  /** Prints the command's answer. */
  write: (text: string) => void
  /** Prints why a command failed. */
  writeError: (text: string) => void
  /** Whether a person is at a terminal to answer a prompt: stdin and stdout are both one. */
  isInteractive: boolean
  /** Asks which component to pick, with the banner the first time; null when the person cancels. */
  askForComponentName: (components: NamedComponent[], isFirstPick: boolean) => Promise<string | null>
  /** Asks what to do with the picked component; null when the person is done. */
  askForAction: (componentName: string, actions: PickAction[]) => Promise<PickActionId | null>
  /** Puts text on the clipboard; false when the system has no clipboard tool. */
  copyToClipboard: (text: string) => Promise<boolean>
  /** Opens an address in the default browser. */
  openInBrowser: (url: string) => void
  /** Says what an action did, in line with the prompts. */
  writeNote: (text: string) => void
}

/** What `pick` can do with the component picked. */
export type PickActionId = 'show' | 'copyImport' | 'openDocs' | 'openFigma' | 'pickAnother'

/** One choice in the menu after a pick, with a hint beside it when it helps. */
export type PickAction = { id: PickActionId; label: string; hint?: string }

/** The menu after picking a component: what it offers depends on where the component lives. */
export function pickActions(catalog: ComponentListJson, component: NamedComponent): PickAction[] {
  const actions: PickAction[] = [
    { id: 'show', label: 'Show its props and usage guide', hint: `rove-ui show ${component.name}` },
    { id: 'copyImport', label: 'Copy its import', hint: importLine(component) },
  ]
  if (storybookDocsUrl(component) !== null) {
    actions.push({ id: 'openDocs', label: 'Open its Docs page in Storybook' })
  }
  if (figmaComponentUrl(catalog, component) !== null) {
    actions.push({ id: 'openFigma', label: 'Open it in Figma' })
  }
  actions.push({ id: 'pickAnother', label: 'Pick another component' })
  return actions
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
export function createProgram(catalog: ComponentListJson, terminal: CliTerminal): Command {
  // Typed, so TypeScript knows `program.error` never returns and narrows after it.
  const program: Command = new Command('rove-ui')
    .description("Look up Rove's UI library components: their props, usage guide, Figma component and stories.")
    .option('--json', 'print the catalog entries as JSON instead of text')
    .configureOutput({ writeOut: terminal.write, writeErr: terminal.writeError })
    .showHelpAfterError('Run `rove-ui --help` for the commands.')
    // Throws a CommanderError instead of exiting, so the caller sets the exit code.
    .exitOverride()

  function isJson(): boolean {
    return program.opts<GlobalOptions>().json === true
  }

  /** Prints one component in full, or its catalog entry with `--json`. */
  function writeComponent(component: NamedComponent): void {
    terminal.write(`${isJson() ? jsonText(component) : componentDetailsText(catalog, component)}\n`)
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
      terminal.write(`${isJson() ? jsonText(components) : componentListText(components)}\n`)
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
      writeComponent(component)
    })

  /** Opens an address and says so, or says the component has none. */
  function openAndSay(url: string | null): void {
    if (url === null) {
      return
    }
    terminal.openInBrowser(url)
    terminal.writeNote(`Opening ${url}`)
  }

  /** Does what the person chose; true when they want to pick another component. */
  async function runPickAction(actionId: PickActionId, component: NamedComponent): Promise<boolean> {
    if (actionId === 'show') {
      writeComponent(component)
    } else if (actionId === 'copyImport') {
      const line = importLine(component)
      const isCopied = await terminal.copyToClipboard(line)
      const note = isCopied ? `Copied: ${line}` : `No clipboard tool found (wl-copy, xclip). Copy it from here: ${line}`
      terminal.writeNote(note)
    } else if (actionId === 'openDocs') {
      openAndSay(storybookDocsUrl(component))
    } else if (actionId === 'openFigma') {
      openAndSay(figmaComponentUrl(catalog, component))
    }
    return actionId === 'pickAnother'
  }

  program
    .command('pick')
    .description('type to narrow a list of components, pick one, then show, copy or open it (needs a terminal)')
    .action(async () => {
      if (!terminal.isInteractive) {
        program.error('`rove-ui pick` needs a terminal to type in. Use `rove-ui list`, then `rove-ui show <name>`.')
      }
      let isFirstPick = true
      // Each pass picks a component, then offers actions on it until the person picks another or is done.
      for (;;) {
        const name = await terminal.askForComponentName(namedComponents(catalog), isFirstPick)
        isFirstPick = false
        if (name === null) {
          return
        }
        const component = findComponent(catalog, name)
        if (component === null) {
          program.error(`No component named "${name}".`)
        }
        let shouldPickAnother = false
        while (!shouldPickAnother) {
          const actionId = await terminal.askForAction(component.name, pickActions(catalog, component))
          if (actionId === null) {
            return
          }
          shouldPickAnother = await runPickAction(actionId, component)
        }
      }
    })

  program
    .command('search')
    .description('the components whose name, description, props or usage guide hold every word')
    .argument('<words...>', 'words to look for, like "status line" or tooltip')
    .action((words: string[]) => {
      const components = searchComponents(catalog, words)
      if (isJson()) {
        terminal.write(`${jsonText(components)}\n`)
        return
      }
      if (components.length === 0) {
        terminal.write(`No component mentions "${words.join(' ')}".\n`)
        return
      }
      terminal.write(`${componentListText(components)}\n`)
    })

  program
    .command('icons')
    .description('the icon names the library exports, optionally only those holding some text')
    .argument('[text]', 'part of a name, like wifi')
    .action((text: string | undefined) => {
      const wantedText = text?.toLowerCase() ?? ''
      const iconNames = catalog.iconNames.filter((iconName) => iconName.toLowerCase().includes(wantedText))
      terminal.write(`${isJson() ? jsonText(iconNames) : iconNames.join('\n')}\n`)
    })

  return program
}
