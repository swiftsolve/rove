import { SpokenText } from '@swiftsolve/rove-ui'

import { spokenText } from '@/utils/spoken'

/**
 * Text that a screen reader says without its brackets or slashes
 * (`spokenText`). Text with none renders as it is.
 */
export function SpeakableText({ text }: { text: string }) {
  const spoken = spokenText(text)
  if (spoken === text) return text
  return <SpokenText spoken={spoken}>{text}</SpokenText>
}
