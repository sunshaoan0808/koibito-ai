import { describe, expect, it } from 'vitest'
import {
  claimVisibleTo,
  pruneClaims,
  sourceFor,
  toldTargets,
  visibleClaims,
  withTold,
  type KnowledgeCharacterLike,
  type KnowledgeClaim,
} from './claims'

const mira: KnowledgeCharacterLike = { id: 'mira', name: 'Mira', connections: [{ name: 'Tomas', relation: 'friend' }] }
const tomas: KnowledgeCharacterLike = { id: 'tomas', name: 'Tomas', connections: [{ name: 'Mira', relation: 'friend' }] }
const daniel: KnowledgeCharacterLike = { id: 'daniel', name: 'Daniel' }
/** Present in the graph by name only — nobody registered them, so nobody is that character yet. */
const ghost: KnowledgeCharacterLike = { id: 'ghost', name: 'Ghost', connections: [{ name: 'A Stranger', relation: 'rival' }] }

const claim = (over: Partial<KnowledgeClaim> = {}): KnowledgeClaim => ({
  id: 'claim-1',
  text: 'Mira sold the last loaf to a stranger.',
  witnessedByIds: ['mira'],
  toldIds: [],
  at: { day: 5, phaseIndex: 1 },
  scope: { worldId: 'world-1' },
  ...over,
})

describe('knowledge visibility', () => {
  it('shows a witness what they saw', () => {
    expect(sourceFor(claim(), 'mira')).toBe('witnessed')
    expect(claimVisibleTo(claim(), 'mira')).toBe(true)
  })

  it('does not show it to someone who was not there', () => {
    // The whole point: being in the same chat is not the same as having been present.
    expect(sourceFor(claim(), 'tomas')).toBeUndefined()
    expect(claimVisibleTo(claim(), 'daniel')).toBe(false)
  })

  it('shows it to a neighbour once they have actually been told', () => {
    const told = withTold(claim(), ['tomas'])
    expect(sourceFor(told, 'tomas')).toBe('told')
    // And the untold neighbour is unaffected.
    expect(sourceFor(told, 'daniel')).toBeUndefined()
  })

  it('never lets a character reach the claim just by being nearby', () => {
    // Tomas is on the graph from Mira, but nothing travelled along that edge yet.
    expect(toldTargets(claim(), [mira, tomas, daniel])).toEqual(['tomas'])
    expect(claimVisibleTo(claim(), 'tomas')).toBe(false)
  })

  it('proposes nobody already in the loop, and nobody it cannot name', () => {
    expect(toldTargets(withTold(claim(), ['tomas']), [mira, tomas, daniel])).toEqual([])
    // A connection whose name matches no registered character stays a name — no invented ids.
    expect(toldTargets(claim({ witnessedByIds: ['ghost'] }), [ghost, tomas])).toEqual([])
  })

  it('never produces inferred knowledge', () => {
    const sources = [sourceFor(claim(), 'mira'), sourceFor(withTold(claim(), ['tomas']), 'tomas'), sourceFor(claim(), 'daniel')]
    expect(sources).toEqual(['witnessed', 'told', undefined])
  })

  it('lists what a character can be shown, newest first, under a cap', () => {
    const claims = [
      claim({ id: 'c1', at: { day: 4, phaseIndex: 0 } }),
      claim({ id: 'c2', at: { day: 7, phaseIndex: 2 } }),
      claim({ id: 'c3', at: { day: 6, phaseIndex: 3 } }),
      claim({ id: 'other', witnessedByIds: ['tomas'] }),
    ]
    expect(visibleClaims(claims, 'mira').map((c) => c.id)).toEqual(['c2', 'c3', 'c1'])
    expect(visibleClaims(claims, 'mira', { limit: 2 }).map((c) => c.id)).toEqual(['c2', 'c3'])
  })

  it('prunes by world clock, not by wall clock', () => {
    const claims = [
      claim({ id: 'old', at: { day: 2, phaseIndex: 0 } }),
      claim({ id: 'edge', at: { day: 5, phaseIndex: 0 } }),
      claim({ id: 'new', at: { day: 8, phaseIndex: 1 } }),
    ]
    // `before` is inclusive: a claim from that exact cell is still known.
    expect(pruneClaims(claims, { before: { day: 5, phaseIndex: 0 } }).map((c) => c.id)).toEqual(['edge', 'new'])
    expect(pruneClaims(claims, { limit: 2 }).map((c) => c.id)).toEqual(['new', 'edge'])
  })

  it('does not mutate the claim it was given', () => {
    const original = claim()
    const told = withTold(original, ['tomas'])
    expect(original.toldIds).toEqual([])
    expect(told.toldIds).toEqual(['tomas'])
    expect(told).not.toBe(original)
  })
})
