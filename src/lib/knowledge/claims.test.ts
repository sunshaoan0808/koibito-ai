import { describe, expect, it } from 'vitest'
import {
  claimVisibleTo,
  claimsFromFacts,
  knowledgeLorebookFor,
  pruneClaims,
  sourceFor,
  toldTargets,
  visibleClaims,
  withTold,
  type KnowledgeCharacterLike,
  type KnowledgeClaim,
} from './claims'

describe('claimsFromFacts + knowledgeLorebookFor (phase 2: the prompt gate)', () => {
  const at = { day: 4, phaseIndex: 1 }
  const facts = [
    { id: 'f1', text: 'Mira took the wetlands survey.' },
    { id: 'f2', text: '   ' },
  ]
  const claims = claimsFromFacts({ facts, witnesses: ['mira'], at, scope: { worldId: 'w1', chatId: 'chat-a' } })

  it('turns a fact into a claim carrying the fact id, and drops blank rows', () => {
    expect(claims).toHaveLength(1)
    expect(claims[0]).toMatchObject({
      id: 'claim:f1',
      factId: 'f1',
      text: 'Mira took the wetlands survey.',
      witnessedByIds: ['mira'],
      toldIds: [],
      scope: { worldId: 'w1', chatId: 'chat-a' },
    })
  })

  // The acceptance line from the design doc: C was never there, so C's prompt stays clean.
  it('keeps an unwitnessed character out of the block entirely', () => {
    expect(knowledgeLorebookFor({ claims, characterId: 'daniel' })).toEqual([])
  })

  it('gives the witness the block in the same synthetic-lorebook shape facts use', () => {
    const books = knowledgeLorebookFor({ claims, characterId: 'mira' })
    expect(books).toHaveLength(1)
    expect(books[0].name).toBe('What this character knows')
    expect(books[0].entries.map((e) => e.content)).toEqual(['Mira took the wetlands survey.'])
    expect(books[0].entries[0]).toMatchObject({ constant: true, selective: false, activationMode: 'always' })
  })

  it('only lets it travel along a graph edge, and only once actually told', () => {
    // Tomas is reachable on the graph, but nobody has told him anything yet.
    expect(toldTargets(claims[0], [mira, tomas, daniel])).toContain('tomas')
    expect(knowledgeLorebookFor({ claims, characterId: 'tomas' })).toEqual([])
    const told = withTold(claims[0], ['tomas'])
    expect(knowledgeLorebookFor({ claims: [told], characterId: 'tomas' })[0].entries[0].content).toBe(
      'Mira took the wetlands survey.',
    )
    // …and it stops there: daniel is neither a witness nor on the told list.
    expect(knowledgeLorebookFor({ claims: [told], characterId: 'daniel' })).toEqual([])
  })

  it('caps the block so it cannot eat the prompt', () => {
    const many = claimsFromFacts({
      facts: [1, 2, 3, 4, 5].map((n) => ({ id: `f${n}`, text: `Fact ${n}` })),
      witnesses: ['mira'],
      at,
      scope: {},
    })
    expect(knowledgeLorebookFor({ claims: many, characterId: 'mira', limit: 2 })[0].entries).toHaveLength(2)
  })

  it('says nothing when there are no facts, no witnesses, or no claims yet', () => {
    expect(claimsFromFacts({ facts, witnesses: [], at, scope: {} })).toEqual([])
    expect(knowledgeLorebookFor({ claims: [], characterId: 'mira' })).toEqual([])
    expect(claimsFromFacts({ facts: [], witnesses: ['mira'], at, scope: {} })).toEqual([])
  })
})

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
