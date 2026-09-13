import { describe, expect, it } from 'vitest'
import { BGM_DEFAULT_KEY, SCENE_MOOD_IDS } from '@/lib/vn/moods'
import type { WorldCard } from '@/lib/types'
import { listWorldTracks } from './trackLibrary'

/** Only the fields `listWorldTracks` reads; the rest of a WorldCard is irrelevant here. */
function world(partial: Partial<WorldCard> & { id: string; name: string }): WorldCard {
  return { description: '', lorebook: {}, ...partial } as WorldCard
}

describe('listWorldTracks', () => {
  it('handles no worlds and worlds without music', () => {
    expect(listWorldTracks(undefined)).toEqual([])
    expect(listWorldTracks([])).toEqual([])
    expect(listWorldTracks([world({ id: 'w1', name: 'Empty' })])).toEqual([])
    expect(listWorldTracks([world({ id: 'w1', name: 'Empty', music: {} as Record<string, string> })])).toEqual([])
  })

  it('drops blank entries instead of listing dead tracks', () => {
    const tracks = listWorldTracks([
      world({ id: 'w1', name: 'A', music: { [BGM_DEFAULT_KEY]: 'data/a.mp3', tense: '   ' } }),
    ])
    expect(tracks.map((t) => t.mood)).toEqual([BGM_DEFAULT_KEY])
  })

  it('puts the default and taggable moods first, in the app’s own order, bespoke cues last', () => {
    const tracks = listWorldTracks([
      world({
        id: 'w1',
        name: 'A',
        music: {
          zzz: 'data/z.mp3',
          [SCENE_MOOD_IDS[1]]: 'data/m1.mp3',
          aaa: 'data/a.mp3',
          [BGM_DEFAULT_KEY]: 'data/default.mp3',
          [SCENE_MOOD_IDS[0]]: 'data/m0.mp3',
        },
      }),
    ])
    expect(tracks.map((t) => t.mood)).toEqual([
      BGM_DEFAULT_KEY,
      SCENE_MOOD_IDS[0],
      SCENE_MOOD_IDS[1],
      'aaa',
      'zzz',
    ])
  })

  it('flags what plays by itself and what only plays when picked', () => {
    const tracks = listWorldTracks([
      world({
        id: 'w1',
        name: 'A',
        music: { [BGM_DEFAULT_KEY]: 'data/d.mp3', [SCENE_MOOD_IDS[0]]: 'data/m.mp3', custom: 'data/c.mp3' },
      }),
    ])
    const byMood = new Map(tracks.map((t) => [t.mood, t]))
    expect(byMood.get(BGM_DEFAULT_KEY)?.isDefault).toBe(true)
    expect(byMood.get(BGM_DEFAULT_KEY)?.isAutomatic).toBe(true)
    expect(byMood.get(SCENE_MOOD_IDS[0])?.isAutomatic).toBe(true)
    expect(byMood.get('custom')?.isAutomatic).toBe(false)
  })

  it('groups by world, alphabetically, keeping each world’s own order', () => {
    const tracks = listWorldTracks([
      world({ id: 'w2', name: 'Zeta', music: { tense: 'data/z.mp3' } }),
      world({ id: 'w1', name: 'Alpha', music: { [BGM_DEFAULT_KEY]: 'data/a.mp3', calm: 'data/c.mp3' } }),
    ])
    expect(tracks.map((t) => [t.worldName, t.mood])).toEqual([
      ['Alpha', BGM_DEFAULT_KEY],
      ['Alpha', 'calm'],
      ['Zeta', 'tense'],
    ])
  })

  it('names an unnamed world rather than rendering an empty heading', () => {
    const tracks = listWorldTracks([world({ id: 'w1', name: '', music: { calm: 'data/c.mp3' } })])
    expect(tracks[0].worldName).toBe('Untitled world')
  })
})
