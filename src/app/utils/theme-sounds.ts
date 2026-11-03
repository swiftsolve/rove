import switchOffUrl from '@/assets/sounds/switch-off.mp3'
import switchOnUrl from '@/assets/sounds/switch-on.mp3'
import { getSetting } from '@/hooks/useSetting'
import { IS_WEBKIT_GTK } from '@/lib/platform'

/**
 * The click when the theme flips (light plays switch-on, dark switch-off).
 *
 * Web Audio rather than `<audio>`: the samples are decoded up front, so a press
 * only schedules a buffer. An `<audio>` element's load and decode compete with
 * the theme swap for the main thread, so the click would lag the press.
 *
 * Best-effort: some webviews have no audio and autoplay policy can block the
 * first play, so every failure is swallowed. WebKitGTK skips the sound outright:
 * it decodes through GStreamer, which the AppImage doesn't bundle, and fails in
 * the media backend where we can't catch it (see IS_WEBKIT_GTK).
 */

// The setting the Settings toggle writes.
const SOUND_SETTING = 'themeSounds'
const VOLUME = 0.35
// Release the output stream once the clicks stop, so an idle app doesn't hold
// one open (it shows in the OS mixer). Long enough to cover a burst of presses.
const IDLE_SUSPEND_MS = 10_000

const isAudioAvailable =
  !IS_WEBKIT_GTK && typeof AudioContext !== 'undefined' && typeof OfflineAudioContext !== 'undefined'

// Decode with an offline context so the samples are ready before the first
// press; a live context created before a gesture starts suspended and warns.
// A buffer plays in any context, resampled if the rates differ.
async function decode(url: string): Promise<AudioBuffer | null> {
  try {
    const bytes = await (await fetch(url)).arrayBuffer()
    return await new OfflineAudioContext(1, 1, 44_100).decodeAudioData(bytes)
  } catch {
    return null
  }
}

const samples = isAudioAvailable ? { light: decode(switchOnUrl), dark: decode(switchOffUrl) } : null

let context: AudioContext | null = null
let idleTimer: ReturnType<typeof setTimeout> | undefined

// Created on the first press, inside its gesture, so autoplay policy lets it run.
function getContext(): AudioContext {
  context ??= new AudioContext()
  if (context.state !== 'running') void context.resume().catch(() => {})
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => void context?.suspend().catch(() => {}), IDLE_SUSPEND_MS)
  return context
}

function playBuffer(audioContext: AudioContext, buffer: AudioBuffer): void {
  const gain = audioContext.createGain()
  gain.gain.value = VOLUME
  gain.connect(audioContext.destination)
  // A fresh source per press, so rapid toggles overlap instead of cutting off.
  const source = audioContext.createBufferSource()
  source.buffer = buffer
  source.connect(gain)
  source.start()
}

/** Play the switch sound for the theme being switched *to*. */
export function playThemeSwitchSound(target: 'light' | 'dark'): void {
  if (!samples) return
  if (!getSetting(SOUND_SETTING, true)) return
  try {
    const audioContext = getContext()
    // Decoded moments after launch, so this runs as a microtask, before the
    // swap renders; a press during decoding plays once it's done.
    void samples[target].then((buffer) => {
      if (buffer) playBuffer(audioContext, buffer)
    })
  } catch {
    // Some engines throw synchronously when audio is disallowed.
  }
}
