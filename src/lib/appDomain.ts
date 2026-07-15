// Best-effort brand icon: map a process name to a registered domain so the
// Services favicon lookup can be reused, falling back (in the caller) to a
// letter monogram for anything unrecognised. Ordered most-specific first (e.g.
// chromium before chrome, webkit/safari before the generic apple). Not
// exhaustive — the monogram covers the long tail (daemons, CLIs) cleanly.
const APP_DOMAINS: readonly (readonly [string, string])[] = [
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
