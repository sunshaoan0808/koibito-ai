import { describe, expect, it } from 'vitest'
import type { Chat } from '@/lib/types'
import { buildBranchTree, flattenBranchTree, isDescendantOf } from './branchTree'

/** Only the three fields the tree reads — the rest of `Chat` is irrelevant here. */
const chat = (id: string, parentChatId?: string, updatedAt = 0): Chat =>
  ({ id, parentChatId, updatedAt }) as unknown as Chat

describe('buildBranchTree', () => {
  it('returns nothing for no chats', () => {
    expect(buildBranchTree([])).toEqual({ roots: [], orphaned: [] })
  })

  it('keeps a parentless chat as a lone root', () => {
    const { roots } = buildBranchTree([chat('a', undefined, 5)])
    expect(roots).toHaveLength(1)
    expect(roots[0]).toMatchObject({ depth: 0, descendants: 0 })
    expect(roots[0].children).toEqual([])
  })

  it('nests a fork under its source chat and counts the generations', () => {
    const chats = [chat('root', undefined, 300), chat('fork', 'root', 200), chat('fork-2', 'fork', 100)]
    const { roots } = buildBranchTree(chats)
    expect(roots).toHaveLength(1)
    expect(roots[0].chat.id).toBe('root')
    expect(roots[0].descendants).toBe(2)
    expect(roots[0].children[0].chat.id).toBe('fork')
    expect(roots[0].children[0].depth).toBe(1)
    expect(roots[0].children[0].descendants).toBe(1)
    expect(roots[0].children[0].children[0].chat.id).toBe('fork-2')
    expect(roots[0].children[0].children[0].depth).toBe(2)
  })

  it('orders siblings by most recent activity', () => {
    const chats = [chat('root'), chat('older', 'root', 100), chat('newer', 'root', 900)]
    const { roots } = buildBranchTree(chats)
    expect(roots[0].children.map((n) => n.chat.id)).toEqual(['newer', 'older'])
  })

  it('orders roots by most recent activity', () => {
    const chats = [chat('quiet', undefined, 10), chat('busy', undefined, 500)]
    expect(buildBranchTree(chats).roots.map((n) => n.chat.id)).toEqual(['busy', 'quiet'])
  })

  it('promotes a chat whose parent is gone, and reports the broken link', () => {
    const { roots, orphaned } = buildBranchTree([chat('lost', 'deleted-parent', 50)])
    expect(roots.map((n) => n.chat.id)).toEqual(['lost'])
    expect(roots[0].depth).toBe(0)
    expect(orphaned.map((c) => c.id)).toEqual(['lost'])
  })

  it('treats a chat claiming itself as parent as a root instead of looping', () => {
    const { roots, orphaned } = buildBranchTree([chat('self', 'self', 1)])
    expect(roots.map((n) => n.chat.id)).toEqual(['self'])
    expect(orphaned).toEqual([])
  })

  it('survives a two-chat cycle without hanging or dropping either', () => {
    const { roots } = buildBranchTree([chat('a', 'b', 20), chat('b', 'a', 10)])
    const ids = flattenBranchTree(roots).map((n) => n.chat.id)
    expect(ids.sort()).toEqual(['a', 'b'])
    expect(ids).toHaveLength(2)
  })

  it('lists every chat exactly once across roots and descendants', () => {
    const chats = [
      chat('r1', undefined, 900),
      chat('r1-fork', 'r1', 800),
      chat('r1-fork-fork', 'r1-fork', 700),
      chat('r2', undefined, 600),
      chat('loop-a', 'loop-b', 10),
      chat('loop-b', 'loop-a', 20),
      chat('lost', 'gone', 30),
    ]
    const { roots } = buildBranchTree(chats)
    const ids = flattenBranchTree(roots).map((n) => n.chat.id)
    expect(ids).toHaveLength(chats.length)
    expect(new Set(ids).size).toBe(chats.length)
  })
})

describe('flattenBranchTree', () => {
  it('walks parents before their own children', () => {
    const chats = [chat('root', undefined, 900), chat('kid', 'root', 800), chat('grandkid', 'kid', 700)]
    const rows = flattenBranchTree(buildBranchTree(chats).roots)
    expect(rows.map((n) => n.chat.id)).toEqual(['root', 'kid', 'grandkid'])
    expect(rows.map((n) => n.depth)).toEqual([0, 1, 2])
  })
})

describe('isDescendantOf', () => {
  const chats = [chat('root'), chat('kid', 'root'), chat('grandkid', 'kid'), chat('stranger'), chat('a', 'b'), chat('b', 'a')]

  it('finds a direct and a deeper descendant', () => {
    expect(isDescendantOf(chats, 'kid', 'root')).toBe(true)
    expect(isDescendantOf(chats, 'grandkid', 'root')).toBe(true)
  })

  it('is false for an unrelated chat, the same chat, and a cycle', () => {
    expect(isDescendantOf(chats, 'stranger', 'root')).toBe(false)
    expect(isDescendantOf(chats, 'root', 'root')).toBe(false)
    expect(isDescendantOf(chats, 'a', 'a')).toBe(false)
  })
})
