import { describe, expect, it } from 'vitest'
import type { SaveSlot } from '@/lib/types'
import { groupSlotsByChat, hasStoryState, slotCounts } from './saveSlotDisplay'

function slot(over: Partial<SaveSlot> & { id: string; createdAt: number }): SaveSlot {
  return {
    chatId: 'c1',
    name: 'slot',
    schemaVersion: 1,
    counts: { messages: 0, objectives: 0, relationshipEvents: 0, facts: 0 },
    ...over,
  }
}

describe('groupSlotsByChat', () => {
  it('groups by source chat with the newest slot first in each group', () => {
    const groups = groupSlotsByChat([
      slot({ id: 'old', createdAt: 100, chatId: 'c1', chatTitle: 'Sumire' }),
      slot({ id: 'new', createdAt: 300, chatId: 'c1', chatTitle: 'Sumire' }),
      slot({ id: 'mid', createdAt: 200, chatId: 'c1', chatTitle: 'Sumire' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].slots.map((s) => s.id)).toEqual(['new', 'mid', 'old'])
  })

  it('orders groups by their most recent save, not by insertion or chat id', () => {
    const groups = groupSlotsByChat([
      slot({ id: 'a1', createdAt: 100, chatId: 'a', chatTitle: 'A' }),
      slot({ id: 'b1', createdAt: 500, chatId: 'b', chatTitle: 'B' }),
      slot({ id: 'a2', createdAt: 900, chatId: 'a' }),
    ])
    expect(groups.map((g) => g.chatId)).toEqual(['a', 'b'])
    expect(groups[0].slots.map((s) => s.id)).toEqual(['a2', 'a1'])
  })

  it('keeps a group whose chat was deleted, falling back to the snapshotted title', () => {
    const groups = groupSlotsByChat([slot({ id: 'gone', createdAt: 10, chatId: 'deleted', chatTitle: 'Yuki' })])
    expect(groups).toHaveLength(1)
    expect(groups[0].title).toBe('Yuki')
  })

  it('does not let a title-less newer slot erase the group title of an older one', () => {
    const groups = groupSlotsByChat([
      slot({ id: 'newer', createdAt: 20, chatId: 'c1' }),
      slot({ id: 'older', createdAt: 10, chatId: 'c1', chatTitle: 'Sumire' }),
    ])
    expect(groups[0].title).toBe('Sumire')
  })

  it('leaves the title empty rather than inventing one when no slot has it', () => {
    const groups = groupSlotsByChat([slot({ id: 'x', createdAt: 1, chatId: 'c9' })])
    expect(groups[0].title).toBe('')
  })

  it('breaks createdAt ties deterministically so rows cannot swap between renders', () => {
    const first = groupSlotsByChat([
      slot({ id: 'zzz', createdAt: 5 }),
      slot({ id: 'aaa', createdAt: 5 }),
    ])
    const second = groupSlotsByChat([
      slot({ id: 'aaa', createdAt: 5 }),
      slot({ id: 'zzz', createdAt: 5 }),
    ])
    expect(first[0].slots.map((s) => s.id)).toEqual(['aaa', 'zzz'])
    expect(second[0].slots.map((s) => s.id)).toEqual(first[0].slots.map((s) => s.id))
  })

  it('returns nothing for no slots', () => {
    expect(groupSlotsByChat([])).toEqual([])
  })
})

describe('slotCounts', () => {
  it('reads the server counts and totals them', () => {
    const counts = slotCounts(
      slot({ id: 's', createdAt: 1, counts: { messages: 12, objectives: 2, relationshipEvents: 3, facts: 5 } }),
    )
    expect(counts).toEqual({ messages: 12, objectives: 2, relationshipEvents: 3, facts: 5, total: 22 })
  })

  it('treats a slot with no counts field as empty rather than crashing', () => {
    expect(slotCounts(slot({ id: 's', createdAt: 1, counts: undefined }))).toEqual({
      messages: 0,
      objectives: 0,
      relationshipEvents: 0,
      facts: 0,
      total: 0,
    })
  })
})

describe('hasStoryState', () => {
  it('is true when the snapshot carries more than the transcript', () => {
    expect(hasStoryState(slot({ id: 's', createdAt: 1, counts: { messages: 3, objectives: 1, relationshipEvents: 0, facts: 0 } }))).toBe(true)
    expect(hasStoryState(slot({ id: 's', createdAt: 1, counts: { messages: 3, objectives: 0, relationshipEvents: 0, facts: 2 } }))).toBe(true)
  })

  it('is false for a transcript-only slot, which the view states instead of overselling', () => {
    expect(hasStoryState(slot({ id: 's', createdAt: 1, counts: { messages: 40, objectives: 0, relationshipEvents: 0, facts: 0 } }))).toBe(false)
  })
})
