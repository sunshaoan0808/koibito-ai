import { describe, expect, it } from 'vitest'
import {
  applyCompatibilityBonus,
  compatibilityBonus,
  normalizeInterest,
  sharedInterests,
} from './compatibility'

describe('normalizeInterest', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeInterest('  Late-Night   Gaming ')).toBe('late-night gaming')
  })
})

describe('sharedInterests', () => {
  it('matches case-insensitively and returns persona-side labels in order', () => {
    const shared = sharedInterests(
      ['Late-night gaming', 'Quiet mornings', 'Skydiving'],
      ['late-night gaming sessions', 'quiet mornings before the school gates open', 'quiet mornings'],
    )
    expect(shared).toEqual(['Quiet mornings'])
  })

  it('dedupes repeat persona entries and ignores blanks', () => {
    const shared = sharedInterests(['Chess', ' chess ', '', 'Chess'], ['chess'])
    expect(shared).toEqual(['Chess'])
  })

  it('returns empty when either side is missing', () => {
    expect(sharedInterests(undefined, ['chess'])).toEqual([])
    expect(sharedInterests(['chess'], undefined)).toEqual([])
    expect(sharedInterests([], [])).toEqual([])
  })
})

describe('compatibilityBonus', () => {
  it('gives +1 per shared interest, capped at +3', () => {
    expect(compatibilityBonus(['a'], ['a'])).toBe(1)
    expect(compatibilityBonus(['a', 'b'], ['a', 'b'])).toBe(2)
    expect(compatibilityBonus(['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e'])).toBe(3)
  })

  it('is zero with no overlap', () => {
    expect(compatibilityBonus(['chess'], ['surfing'])).toBe(0)
  })
})

describe('applyCompatibilityBonus', () => {
  it('adds the bonus to the starter and clamps to 0-100', () => {
    const r = applyCompatibilityBonus(10, ['a', 'b'], ['a', 'b'])
    expect(r.affection).toBe(12)
    expect(r.matched).toEqual(['a', 'b'])
  })

  it('clamps at 100 and reports zero-match cleanly', () => {
    expect(applyCompatibilityBonus(99, ['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd']).affection).toBe(100)
    const flat = applyCompatibilityBonus(5, ['chess'], ['surfing'])
    expect(flat.affection).toBe(5)
    expect(flat.matched).toEqual([])
    expect(flat.bonus).toBe(0)
  })
})
