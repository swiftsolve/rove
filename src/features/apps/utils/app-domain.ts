// Maps a process name to a domain so the Services favicon lookup can be reused.
// Matched by substring, so most-specific keys come first (chromium before
// chrome). Not exhaustive: the monogram covers the long tail.
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
  ['brave', 'brave.com'],
  ['opera', 'opera.com'],
  ['edge', 'microsoft.com'],
  ['teams', 'microsoft.com'],
  ['outlook', 'microsoft.com'],
  ['onedrive', 'microsoft.com'],
  ['vscode', 'visualstudio.com'],
  ['code', 'visualstudio.com'],
  ['safari', 'apple.com'],
  ['webkit', 'apple.com'],
  ['softwareupdate', 'apple.com'],
  ['apple', 'apple.com'],
  ['git', 'github.com'],
  ['node', 'nodejs.org'],
]

/** Guess a brand domain from a process name, or '' when nothing matches. */
export function appDomain(name: string): string {
  const lower = name.toLowerCase()
  for (const [key, domain] of APP_DOMAINS) {
    if (lower.includes(key)) return domain
  }
  return ''
}
