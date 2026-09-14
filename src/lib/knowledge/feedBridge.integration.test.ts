import { describe, expect, it } from 'vitest'
import type { FeedEntry } from '@/lib/world/townFeed'
import { knowledgeLorebookFor, propagateClaims } from './claims'
import { claimsFromFeed } from './feedBridge'

/**
 * `docs/design/town-feed.md` 三期的两条验收，合成在一个链路里跑：
 * 旁线事件 → claim → 沿社交图传播 → 某个角色的 knowledge 门 → 他能不能看到。
 *
 * 这是**组合**测试（不是端到端），因为它要证明的正是每个纯函数各司其职：
 * `claimsFromFeed` 只说"谁在场"，`propagateClaims` 只说"图上谁听得到"，`knowledgeLorebookFor`
 * 只说"这个角色该不该看到"。三者混起来正是这类特性最容易出错的地方。
 */
const feed: FeedEntry[] = [
  {
    id: 'w1:3:2',
    worldId: 'w1',
    at: { day: 3, phaseIndex: 2 },
    kind: 'rumor',
    headline: 'A rumour about the harbour',
    detail: 'Kaito was seen arguing with the dockmaster.',
    aboutIds: ['kaito'],
    witnessedByIds: ['kaito'],
  },
]

const kaito = { id: 'kaito', name: 'Kaito', connections: [{ name: 'Mira', relation: 'friend' }] }
const mira = { id: 'mira', name: 'Mira', connections: [{ name: 'Kaito', relation: 'friend' }] }
const stranger = { id: 'stranger', name: 'Stranger', connections: [] }

const at = { day: 3, phaseIndex: 2 }

/** What this character's prompt would actually carry about the event, as text. */
function seenBy(characterId: string): string {
  const claims = propagateClaims({
    claims: claimsFromFeed(feed),
    characters: [kaito, mira, stranger],
    at,
  })
  const books = knowledgeLorebookFor({ claims, characterId, excludeFactIds: [] })
  return JSON.stringify(books)
}

describe('town feed × knowledge fog (phase 3 acceptance)', () => {
  // 验收①：不在场的旁线事件不进（这个角色的）提示词。
  it('① 图上无通路的角色完全看不到这件事——连标题都不该出现', () => {
    expect(seenBy('stranger')).not.toContain('dockmaster')
    expect(seenBy('stranger')).not.toContain('harbour')
  })

  // 验收②：只有图上有通路的角色能"听说"。
  it('② 图上有通路的角色能听说', () => {
    expect(seenBy('mira')).toContain('dockmaster')
  })

  it('在场者自己当然知道，不需要听说', () => {
    expect(seenBy('kaito')).toContain('dockmaster')
  })

  it('传播是单调的：跑两次不会多也不会少', () => {
    const once = propagateClaims({ claims: claimsFromFeed(feed), characters: [kaito, mira], at })
    const twice = propagateClaims({ claims: once, characters: [kaito, mira], at })
    expect(twice).toEqual(once)
  })

  // `propagateClaims` 的硬条件：只有同一世界时钟格才有机会说上话。
  it('换了时钟格就传不动：上一阶段的事不会突然传遍全镇', () => {
    const later = propagateClaims({
      claims: claimsFromFeed(feed),
      characters: [kaito, mira],
      at: { day: 3, phaseIndex: 3 },
    })
    expect(later[0].toldIds).toEqual([])
  })
})
