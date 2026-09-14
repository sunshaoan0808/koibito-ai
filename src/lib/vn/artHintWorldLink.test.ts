import { describe, expect, it } from 'vitest'
import { vnArtHint, vnHintIsWorldArt } from './artHint'
import type { Character } from '@/lib/characters/cardSpec'
import type { WorldCard } from '@/lib/types'

const char = (over: Partial<Character> = {}): Character =>
  ({
    id: 'c1',
    card: { name: 'Mira', description: '', personality: '', scenario: '', first_mes: '', mes_example: '' },
    sprites: { happy: 'x' },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as Character

const world = (over: Partial<WorldCard> = {}): WorldCard =>
  ({
    id: 'w1',
    name: 'Sakura Hill',
    description: '',
    lorebook: { entries: [] },
    createdAt: 0,
    updatedAt: 0,
    ...over,
  }) as WorldCard

// `VNStage` hangs its "Add scene art in the World editor" deep-link off this predicate rather than
// matching the hint prose — so the two must never disagree about which variant is on screen. This
// is the invariant that keeps the link from pointing at the world editor while the hint is really
// talking about the character's sprites.
describe('vnHintIsWorldArt', () => {
  it('agrees with vnArtHint about when the missing art is the world\'s', () => {
    const cases: [string, Character, WorldCard | undefined][] = [
      ['no sprites, untouched world', char({ sprites: {} }), world()],
      ['sprites, unbound world', char(), undefined],
      ['sprites, world without backgrounds', char(), world()],
      ['sprites, world with an empty backgrounds map', char(), world({ backgrounds: {} })],
      ['sprites, world with backgrounds', char(), world({ backgrounds: { park: 'x' } })],
    ]
    for (const [label, c, w] of cases) {
      const hint = vnArtHint(c, w, [])
      const isWorldArt = vnHintIsWorldArt(c, w)
      expect(isWorldArt, label).toBe(!!hint && /no scene backgrounds/.test(hint))
    }
  })

  it('is false whenever sprites are the gap, or there is no world to link to', () => {
    expect(vnHintIsWorldArt(char(), world())).toBe(true)
    expect(vnHintIsWorldArt(char({ sprites: {} }), world())).toBe(false)
    expect(vnHintIsWorldArt(char(), undefined)).toBe(false)
    expect(vnHintIsWorldArt(char(), world({ backgrounds: { park: 'x' } }))).toBe(false)
    expect(vnHintIsWorldArt(undefined, world())).toBe(false)
  })
})
