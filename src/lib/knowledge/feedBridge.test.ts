import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '@/lib/world/townFeed'
import { claimsFromFeed } from './feedBridge'

const entry = (over: Partial<FeedEntry> = {}): FeedEntry => ({
  id: 'w1:3:2',
  worldId: 'w1',
  at: { day: 3, phaseIndex: 2 },
  kind: 'rumor',
  headline: 'A rumour about the harbour',
  detail: 'Kaito was seen arguing with the dockmaster.',
  aboutIds: ['kaito'],
  witnessedByIds: ['kaito', 'mira'],
  ...over,
})

describe('claimsFromFeed (town-feed phase 3: the "heard it" channel)', () => {
  it('turns an off-screen event into a world-scoped claim quoted by its detail', () => {
    const [claim] = claimsFromFeed([entry()])
    expect(claim.text).toBe('Kaito was seen arguing with the dockmaster.')
    expect(claim.scope).toEqual({ worldId: 'w1' })
    expect(claim.witnessedByIds).toEqual(['kaito', 'mira'])
    expect(claim.at).toEqual({ day: 3, phaseIndex: 2 })
    expect(claim.id).toBe('feed:w1:3:2')
  })

  // `FeedEntry` says it outright: no witness means nobody knows, whatever the headline says.
  it('produces nothing for an event nobody witnessed', () => {
    expect(claimsFromFeed([entry({ witnessedByIds: [] })])).toEqual([])
  })

  it('never lets the headline through — the feed is not narration', () => {
    const [claim] = claimsFromFeed([entry()])
    expect(claim.text).not.toContain('A rumour about the harbour')
  })

  it('starts with nobody told: who hears it is the graph’s business, not this module’s', () => {
    expect(claimsFromFeed([entry()]).every((c) => c.toldIds.length === 0)).toBe(true)
  })

  it('does not mutate the entries it was handed', () => {
    const given = entry()
    claimsFromFeed([given]).forEach((claim) => claim.witnessedByIds.push('intruder'))
    expect(given.witnessedByIds).toEqual(['kaito', 'mira'])
  })
})
