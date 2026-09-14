import { describe, expect, it } from 'vitest'
import { SAVE_SLOT_SCHEMA_VERSION, resolveParentChatId, restorePlan, slotIsRestorable, snapshotCounts, type ChatSnapshot } from './saveSlots'

/** Deterministic ids so the assertions can name them. */
function idFactory() {
  let n = 0
  return () => `new-${++n}`
}

/**
 * A snapshot frozen all the way down. In a strict-mode ES module, writing to any of these throws —
 * which is exactly the point: it proves a restore copies, and never mutates, what it was handed.
 */
function frozenSnapshot(): ChatSnapshot {
  const deepFreeze = <T>(value: T): T => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
      Object.freeze(value)
    }
    return value
  }
  return deepFreeze({
    chat: { id: 'chat-1', characterId: 'char-1', title: 'Sumire', affection: 42, sceneFlags: ['met'], timePhase: 'evening' },
    messages: [
      { id: 'm1', chatId: 'chat-1', role: 'user', text: 'hi' },
      { id: 'm2', chatId: 'chat-1', role: 'assistant', text: 'hello' },
    ],
    objectives: [{ id: 'o1', chatId: 'chat-1', status: 'active', text: 'cook dinner' }],
    relationshipEvents: [{ id: 'e1', chatId: 'chat-1', kind: 'promise' }],
    facts: [{ id: 'f1', chatId: 'chat-1', text: 'likes green tea' }],
  })
}

const opts = { chatId: 'chat-2', title: 'Before the rain', slotId: 'slot-1', now: 1_700_000_000_000 }

describe('resolveParentChatId', () => {
  it('takes the first candidate that is still alive', () => {
    expect(resolveParentChatId(['gone', 'alive'], (id) => id === 'alive')).toBe('alive')
  })

  it('prefers the chat the slot came from over the grandparent behind it', () => {
    expect(resolveParentChatId(['source', 'grandparent'], () => true)).toBe('source')
  })

  it('falls back to the grandparent when the immediate source is gone', () => {
    expect(resolveParentChatId(['gone', 'grandparent'], (id) => id === 'grandparent')).toBe('grandparent')
  })

  it('returns nothing when no candidate survives — no lineage beats a dangling one', () => {
    expect(resolveParentChatId(['gone', 'also-gone'], () => false)).toBeUndefined()
    expect(resolveParentChatId([undefined, ''], () => true)).toBeUndefined()
  })
})

describe('restorePlan lineage', () => {
  /**
   * Regression: an integration probe caught the restored chat inheriting the snapshot chat's own
   * `parentChatId`, even when that parent had been purged — which the branch tree then renders as an
   * orphan. The inherited id must be dropped unless the caller resolves a live one.
   */
  it('does not inherit the snapshot chat’s own parentChatId', () => {
    const snapshot: ChatSnapshot = { ...frozenSnapshot(), chat: { ...frozenSnapshot().chat, parentChatId: 'purged-parent' } }
    expect(restorePlan(snapshot, opts, idFactory()).chat.parentChatId).toBeUndefined()
  })

  it('writes the parent the caller resolved against live chats', () => {
    const snapshot: ChatSnapshot = { ...frozenSnapshot(), chat: { ...frozenSnapshot().chat, parentChatId: 'purged-parent' } }
    const plan = restorePlan(snapshot, { ...opts, parentChatId: 'grandparent' }, idFactory())
    expect(plan.chat.parentChatId).toBe('grandparent')
  })
})

describe('snapshotCounts', () => {
  it('counts every satellite table the snapshot covers', () => {
    expect(snapshotCounts(frozenSnapshot())).toEqual({ messages: 2, objectives: 1, relationshipEvents: 1, facts: 1 })
  })

  it('reports zero for an empty history rather than omitting the key', () => {
    const empty = { ...frozenSnapshot(), messages: [], objectives: [], relationshipEvents: [], facts: [] }
    expect(snapshotCounts(empty)).toEqual({ messages: 0, objectives: 0, relationshipEvents: 0, facts: 0 })
  })
})

describe('slotIsRestorable', () => {
  it('accepts a slot written by this version', () => {
    expect(slotIsRestorable({ schemaVersion: SAVE_SLOT_SCHEMA_VERSION, snapshot: frozenSnapshot() })).toBe(true)
  })

  it('refuses a slot from another schema version instead of half-restoring it', () => {
    expect(slotIsRestorable({ schemaVersion: SAVE_SLOT_SCHEMA_VERSION + 1, snapshot: frozenSnapshot() })).toBe(false)
    expect(slotIsRestorable({ schemaVersion: 0, snapshot: frozenSnapshot() })).toBe(false)
  })

  it('refuses a slot with no snapshot at all', () => {
    expect(slotIsRestorable({ schemaVersion: SAVE_SLOT_SCHEMA_VERSION })).toBe(false)
    expect(slotIsRestorable({ schemaVersion: SAVE_SLOT_SCHEMA_VERSION, snapshot: { chat: { id: 'x' } } })).toBe(false)
  })
})

describe('restorePlan', () => {
  it('materialises a new chat and leaves the frozen snapshot untouched', () => {
    const snapshot = frozenSnapshot()
    const plan = restorePlan(snapshot, opts, idFactory())

    // The whole copy must survive being handed an immutable input: no throw, no rewrite.
    expect(snapshot.chat).toEqual({ id: 'chat-1', characterId: 'char-1', title: 'Sumire', affection: 42, sceneFlags: ['met'], timePhase: 'evening' })
    expect(snapshot.messages.map((m) => m.id)).toEqual(['m1', 'm2'])

    expect(plan.chat.id).toBe('chat-2')
    expect(plan.chat.title).toBe('Before the rain')
    expect(plan.chat.createdAt).toBe(opts.now)
    expect(plan.chat.updatedAt).toBe(opts.now)
    expect(plan.chat.restoredFromSlotId).toBe('slot-1')
  })

  it('carries the story state over verbatim (affection, flags, clock override)', () => {
    const plan = restorePlan(frozenSnapshot(), opts, idFactory())
    expect(plan.chat.affection).toBe(42)
    expect(plan.chat.sceneFlags).toEqual(['met'])
    expect(plan.chat.timePhase).toBe('evening')
    expect(plan.chat.characterId).toBe('char-1')
  })

  it('re-keys every satellite row and stamps it with the new chat id', () => {
    const plan = restorePlan(frozenSnapshot(), opts, idFactory())
    expect(plan.messages.map((m) => m.id)).toEqual(['new-1', 'new-2'])
    expect(plan.messages.every((m) => m.chatId === 'chat-2')).toBe(true)
    expect(plan.objectives[0].chatId).toBe('chat-2')
    expect(plan.relationshipEvents[0].chatId).toBe('chat-2')
    expect(plan.facts[0].chatId).toBe('chat-2')
    // Nothing keeps an old primary key, and the payload survives.
    for (const row of [...plan.messages, ...plan.objectives, ...plan.relationshipEvents, ...plan.facts]) {
      expect(String(row.id)).not.toMatch(/^(m|o|e|f)1$/)
    }
    expect(plan.messages[0].text).toBe('hi')
    expect(plan.facts[0].text).toBe('likes green tea')
  })

  it('links the restored chat to its source only when told the source still exists', () => {
    expect(restorePlan(frozenSnapshot(), { ...opts, parentChatId: 'chat-1' }, idFactory()).chat.parentChatId).toBe('chat-1')
    expect(restorePlan(frozenSnapshot(), opts, idFactory()).chat.parentChatId).toBeUndefined()
    expect('parentChatId' in restorePlan(frozenSnapshot(), opts, idFactory()).chat).toBe(false)
  })

  it('hands out a distinct id per row, never reusing one', () => {
    const plan = restorePlan(frozenSnapshot(), opts, idFactory())
    const ids = [plan.chat.id, ...plan.messages.map((m) => m.id), ...plan.objectives.map((o) => o.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })
})
