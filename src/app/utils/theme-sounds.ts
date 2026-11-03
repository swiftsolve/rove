import switchOffUrl from '@/assets/sounds/switch-off.mp3'
import switchOnUrl from '@/assets/sounds/switch-on.mp3'
import { getSetting } from '@/hooks/useSetting'
import { IS_WEBKIT_GTK } from '@/lib/platform'

/**
 * The little mechanical click when the theme flips — the same switch-on/off
 * samples joshwcomeau.com uses (light → switch-on, dark → switch-off).
 *
 * It plays through Web Audio rather than `<audio>`: the samples are decoded once
 * up front, so a press only schedules an already-decoded buffer. An `<audio>`
 * element has to load, decode and open an output stream before it makes a
 * sound, and that setup competes with the theme swap for the main thread, so
 * the click would land a variable beat after the press.
 *
 * Playback is best-effort: audio is unavailable in some webviews, and the
 * first play before any user gesture can be blocked by autoplay policy. Every
 * failure is swallowed so a missing sound can never disturb the theme swap.
 *
 * WebKitGTK is the one engine where "best-effort" isn't enough to keep us safe:
 * it decodes audio through GStreamer, which the AppImage doesn't bundle, so
 * the failure lands in the media backend rather than as a rejected promise we
 * could swallow. We skip the sound there outright — see IS_WEBKIT_GTK.
 */

// Gate playback on the same persisted setting the Settings toggle writes.
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
    // Some engines throw synchronously when audio is disallowed — ignore.
  }
}
