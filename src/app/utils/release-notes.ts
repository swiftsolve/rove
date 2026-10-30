/**
 * Split a release's notes into one item per line, for a bulleted list. Drops
 * blank lines and any Markdown bullet the release body already carries.
 */
export function releaseNoteItems(notes: string): string[] {
  return notes
    .split('\n')
    .map((line) => line.trim().replace(/^[-*•]\s+/, ''))
    .filter((line) => line !== '')
}
