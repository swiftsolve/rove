/**
 * What `rove-ui pick` asks of the computer: copying text and opening an
 * address, through whichever tool the system has.
 */
import { spawn } from 'node:child_process'

/** A command that reads text on stdin and puts it on the clipboard. */
type ClipboardCommand = { command: string; args: string[] }

/** The clipboard tools to try, in order: macOS, Wayland, X11 (two), Windows. */
const CLIPBOARD_COMMANDS: ClipboardCommand[] = [
  { command: 'pbcopy', args: [] },
  { command: 'wl-copy', args: [] },
  { command: 'xclip', args: ['-selection', 'clipboard'] },
  { command: 'xsel', args: ['--clipboard', '--input'] },
  { command: 'clip.exe', args: [] },
]

/** Runs a command with text on its stdin; true when it ran and exited cleanly. */
function runWithInput(clipboardCommand: ClipboardCommand, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(clipboardCommand.command, clipboardCommand.args, { stdio: ['pipe', 'ignore', 'ignore'] })
    child.on('error', () => resolve(false))
    child.on('close', (exitCode) => resolve(exitCode === 0))
    child.stdin.end(text)
  })
}

/** Puts text on the clipboard; false when no clipboard tool is installed. */
export async function copyToClipboard(text: string): Promise<boolean> {
  for (const clipboardCommand of CLIPBOARD_COMMANDS) {
    if (await runWithInput(clipboardCommand, text)) {
      return true
    }
  }
  return false
}

/** The command that opens an address in the default browser, on this system. */
function openCommand(): string {
  if (process.platform === 'darwin') {
    return 'open'
  }
  if (process.platform === 'win32') {
    return 'explorer.exe'
  }
  return 'xdg-open'
}

/** Opens an address in the default browser, without waiting for it. */
export function openInBrowser(url: string): void {
  const child = spawn(openCommand(), [url], { stdio: 'ignore', detached: true })
  child.on('error', () => undefined)
  child.unref()
}
