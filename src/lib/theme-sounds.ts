import { getSetting } from '@/hooks/useSetting'
import { IS_WEBKIT_GTK } from '@/lib/platform'
import switchOnUrl from '@/assets/sounds/switch-on.mp3'
import switchOffUrl from '@/assets/sounds/switch-off.mp3'

/**
 * The little mechanical click when the theme flips — the same switch-on/off
 * samples joshwcomeau.com uses (light → switch-on, dark → switch-off).
 *
 * Playback is best-effort: audio is unavailable in some webviews, and the
 * first play before any user gesture can be blocked by autoplay policy. Every
 * failure is swallowed so a missing sound can never disturb the theme swap.
 *
 * WebKitGTK is the one engine where "best-effort" isn't enough to keep us safe:
 * it decodes `<audio>` through GStreamer, which the AppImage doesn't bundle, so
 * the failure lands in the media backend rather than as a rejected play()
 * promise we could swallow. We skip the sound there outright — see IS_WEBKIT_GTK.
 */

// Gate playback on the same persisted setting the Settings toggle writes.
const SOUND_SETTING = 'themeSounds'
const VOLUME = 0.35

// One preloaded <audio> per sample, kept purely as a template — we never play it
// directly. Each flip plays a fresh clone instead, so rapid back-and-forth
// toggles each get an independent element that reliably starts from the top.
// Rewinding a single shared element (currentTime = 0 + play) is unreliable: a
// second play() fired while the first is still settling gets dropped by the
// browser, which is why a fast toggle would intermittently go silent.
const templates = new Map<string, HTMLAudioElement>()

function template(url: string): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null
  let audio = templates.get(url)
  if (!audio) {
    audio = new Audio(url)
    // Preload so the first flip doesn't wait on the network/disk to fetch.
    audio.preload = 'auto'
    audio.load()
    templates.set(url, audio)
  }
  return audio
}

// Hold a reference to each in-flight clone so a detached element can't be
// garbage-collected mid-sound; release it once it finishes or errors.
const playing = new Set<HTMLAudioElement>()

/** Play the switch sound for the theme being switched *to*. */
export function playThemeSwitchSound(target: 'light' | 'dark'): void {
  if (IS_WEBKIT_GTK) return
  if (!getSetting(SOUND_SETTING, true)) return
  const base = template(target === 'light' ? switchOnUrl : switchOffUrl)
  if (!base) return
  try {
    // A fresh clone per flip — clones share the already-buffered media resource,
    // so they start immediately and never contend with a still-playing element.
    const node = base.cloneNode(true) as HTMLAudioElement
    node.volume = VOLUME
    const release = (): void => {
      playing.delete(node)
    }
    node.addEventListener('ended', release, { once: true })
    node.addEventListener('error', release, { once: true })
    playing.add(node)
    void node.play().catch(release)
  } catch {
    // Some engines throw synchronously when audio is disallowed — ignore.
  }
}
