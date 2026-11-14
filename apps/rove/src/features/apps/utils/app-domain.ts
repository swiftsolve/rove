/**
 * Maps a process name to a domain so the Services favicon lookup can be reused.
 * Matched against the name's whole words, never a substring, so Xcode isn't VS
 * Code and codesign isn't either. Not exhaustive: the monogram covers the long
 * tail.
 */
const APP_DOMAINS: [string, string][] = [
  ['firefox', 'firefox.com'],
  ['chromium', 'google.com'],
  ['chrome', 'google.com'],
  ['spotify', 'spotify.com'],
  ['slack', 'slack.com'],
  ['dropbox', 'dropbox.com'],
  ['discord', 'discord.com'],
  ['zoom', 'zoom.us'],
  ['telegram', 'telegram.org'],
  ['signal', 'signal.org'],
  ['whatsapp', 'whatsapp.com'],
  ['steam', 'steampowered.com'],
  ['steamwebhelper', 'steampowered.com'],
  ['brave', 'brave.com'],
  ['opera', 'opera.com'],
  ['edge', 'microsoft.com'],
  ['msedge', 'microsoft.com'],
  ['teams', 'microsoft.com'],
  ['outlook', 'microsoft.com'],
  ['onedrive', 'microsoft.com'],
  ['vscode', 'visualstudio.com'],
  ['code', 'visualstudio.com'],
  ['safari', 'apple.com'],
  ['webkit', 'apple.com'],
  ['softwareupdated', 'apple.com'],
  ['apple', 'apple.com'],
  ['git', 'github.com'],
  ['node', 'nodejs.org'],
]

/** Guess a brand domain from a process name, or '' when nothing matches. */
export function appDomain(name: string): string {
  const words = new Set(name.toLowerCase().split(/[^a-z0-9]+/))
  return APP_DOMAINS.find(([key]) => words.has(key))?.[1] ?? ''
}
