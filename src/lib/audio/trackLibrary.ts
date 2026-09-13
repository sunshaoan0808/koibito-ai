import type { WorldCard } from '@/lib/types'
import { BGM_DEFAULT_KEY, BGM_KEYS } from '@/lib/vn/moods'

/**
 * The music a world carries, flattened into a list the gallery's music room can render.
 *
 * A world's `music` map is keyed by mood (`vn/moods.ts`), and most keys are cues the model can tag
 * on its own — those are the ones that actually play during a scene. Anything else in the map is a
 * bespoke cue that only plays when it is picked deliberately, so it is sorted to the end and flagged
 * rather than silently mixed in with the automatic ones.
 */
export interface WorldTrack {
  worldId: string
  worldName: string
  /** The `music` key this track is filed under. */
  mood: string
  url: string
  isDefault: boolean
  /** True when a scene can select this track by itself (`default` or a taggable mood). */
  isAutomatic: boolean
}

/**
 * Every track attached to any world: worlds sorted by name, and within a world the automatic cues
 * first (`default`, then moods in the order the model picks them), then bespoke cues alphabetically.
 * Blank URLs are dropped — an empty entry is a hole in the map, not a track.
 */
export function listWorldTracks(worlds: readonly WorldCard[] | undefined): WorldTrack[] {
  const out: WorldTrack[] = []

  for (const world of worlds ?? []) {
    const music = world.music
    if (!music) continue

    const moods = Object.keys(music).filter((key) => (music[key] ?? '').trim().length > 0)
    moods.sort((a, b) => {
      const ai = BGM_KEYS.indexOf(a)
      const bi = BGM_KEYS.indexOf(b)
      // Known keys keep the app's own order; unknown keys follow, alphabetically.
      if (ai === -1 && bi === -1) return a.localeCompare(b)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })

    for (const mood of moods) {
      out.push({
        worldId: world.id,
        worldName: world.name || 'Untitled world',
        mood,
        url: music[mood],
        isDefault: mood === BGM_DEFAULT_KEY,
        isAutomatic: BGM_KEYS.includes(mood),
      })
    }
  }

  // Stable sort, so the per-world order above survives: worlds group, tracks inside one keep it.
  return out.sort((a, b) => a.worldName.localeCompare(b.worldName))
}
