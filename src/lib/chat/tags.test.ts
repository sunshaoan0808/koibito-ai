import { describe, expect, it } from 'vitest'
import { MAX_TAG_LENGTH, allTags, filterChatsByTag, normalizeTag, normalizeTags } from './tags'

describe('normalizeTag', () => {
  it('trims, collapses inner whitespace, and caps length', () => {
    expect(normalizeTag('  slow burn  ')).toBe('slow burn')
    expect(normalizeTag('a   b')).toBe('a b')
    expect(normalizeTag('x'.repeat(50))).toHaveLength(MAX_TAG_LENGTH)
  })
})

describe('normalizeTags', () => {
  it('drops empties and de-dupes case-insensitively, keeping the first spelling', () => {
    expect(normalizeTags(['Fluff', '', '  ', 'fluff', 'Slow Burn'])).toEqual(['Fluff', 'Slow Burn'])
  })
})

describe('allTags', () => {
  it('collects unique tags across chats, sorted', () => {
    expect(allTags([{ tags: ['fluff', 'angst'] }, { tags: ['Angst', 'cozy'] }, {}])).toEqual(['angst', 'cozy', 'fluff'])
  })
})

describe('filterChatsByTag', () => {
  const chats = [{ id: 'a', tags: ['Fluff'] }, { id: 'b', tags: ['angst'] }, { id: 'c' }]

  it('matches case-insensitively', () => {
    expect(filterChatsByTag(chats, 'fluff').map((c) => c.id)).toEqual(['a'])
  })

  it('treats an empty tag as "no filter"', () => {
    expect(filterChatsByTag(chats, '   ').map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns nothing for an unused tag', () => {
    expect(filterChatsByTag(chats, 'nope')).toEqual([])
  })
})
