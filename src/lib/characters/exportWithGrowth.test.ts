import { describe, expect, it } from 'vitest'
import {
  GROWTH_BUDGET_BYTES,
  GROWTH_SNAPSHOT_VERSION,
  buildGrowthSnapshot,
  describeGrowthSnapshot,
  fitBudget,
  growthSnapshotBytes,
  pickLatestChat,
  readGrowth,
  stripGrowth,
  withGrowth,
  type GrowthSnapshot,
} from './exportWithGrowth'
import { normalizeCardJson } from './cardSpec'
import type { CharacterCardData } from './cardSpec'
import { getRelationshipTrack } from '@/lib/dating/stage'
import type { JournalEntry } from '@/lib/realism/engine'
import type { Chat, ChatFact, RelationshipTrack } from '@/lib/types'

function blankCard(overrides: Partial<CharacterCardData> = {}): CharacterCardData {
  return {
    name: '测试角色',
    description: 'd',
    personality: 'p',
    scenario: 's',
    first_mes: 'f',
    mes_example: 'e',
    ...overrides,
  }
}

function fact(overrides: Partial<ChatFact> = {}): ChatFact {
  return {
    id: 'f1',
    chatId: 'c1',
    text: '用户养了一只叫小黑的猫',
    active: true,
    createdAt: 1,
    ...overrides,
  }
}

describe('快照字段映射', () => {
  it('把年轮 / 心结 / 日记 / 关系字段映射进快照', () => {
    const track: RelationshipTrack = {
      affection: 72,
      relationshipStage: 'dating' as RelationshipTrack['relationshipStage'],
      commitmentStatus: 'none' as RelationshipTrack['commitmentStatus'],
      relationshipStats: { trust: 60 },
      beliefsAboutUser: [{ id: 'b1', text: '他很耐心', formedTurn: 3 }],
      expectationsOfUser: [{ id: 'e1', text: '期待周日问候', formedTurn: 4 }],
      realism: {
        bondLongTerm: 41,
        rings: [
          { id: 'r1', text: '一起看的第一场雨', tier: 'established', strength: 3, createdAtReply: 5 },
        ],
        journal: [{ id: 'j1', text: '今天她很开心', heat: 0.8, valence: 1, createdAtReply: 6 }],
        promises: [
          { id: 'p1', text: '周六九点到', by: 'user', status: 'open', createdAtReply: 7 },
          { id: 'p2', text: '去年答应的旅行', by: 'char', status: 'kept', createdAtReply: 8, resolvedReply: 9 },
        ],
      },
    }

    const snap = buildGrowthSnapshot({
      track,
      facts: [fact()],
      summary: '她们在一起很久了。',
      chatId: 'c1',
      chatTitle: '第一段',
      exportedAt: 1234,
    })

    expect(snap.v).toBe(GROWTH_SNAPSHOT_VERSION)
    expect(snap.exportedAt).toBe(1234)
    expect(snap.chatId).toBe('c1')
    expect(snap.chatTitle).toBe('第一段')
    expect(snap.affection).toBe(72)
    expect(snap.stage).toBe('dating')
    expect(snap.bondLongTerm).toBe(41)
    expect(snap.stats).toEqual({ trust: 60 })
    expect(snap.rings).toEqual([{ text: '一起看的第一场雨', tier: 'established', strength: 3 }])
    expect(snap.journal[0]).toMatchObject({ text: '今天她很开心', heat: 0.8, valence: 1 })
    expect(snap.promises).toEqual([
      { text: '周六九点到', by: 'user', status: 'open' },
      { text: '去年答应的旅行', by: 'char', status: 'kept' },
    ])
    expect(snap.beliefs).toEqual(['他很耐心'])
    expect(snap.expectations).toEqual(['期待周日问候'])
    expect(snap.facts).toEqual([{ text: '用户养了一只叫小黑的猫' }])
    expect(snap.summary).toBe('她们在一起很久了。')
  })

  it('空关系轨不炸，产出最小合法快照', () => {
    const snap = buildGrowthSnapshot({ track: {}, chatId: 'c-empty', exportedAt: 1 })
    expect(snap.affection).toBeUndefined()
    expect(snap.stage).toBeUndefined()
    expect(snap.rings).toEqual([])
    expect(snap.journal).toEqual([])
    expect(snap.facts).toEqual([])
    expect(snap.summary).toBeUndefined()
    expect(readGrowth(withGrowth(blankCard(), snap))).toBeDefined()
  })

  it('过滤已失效的事实，并按重要度排序取前十', () => {
    const facts: ChatFact[] = [
      fact({ id: 'dead', text: '已退休的事', active: false, importance: 0.99 }),
      ...Array.from({ length: 12 }, (_, i) =>
        fact({ id: `a${i}`, text: `事实 ${i}`, importance: i / 100 }),
      ),
    ]
    const snap = buildGrowthSnapshot({ track: {}, facts, chatId: 'c', exportedAt: 1 })
    expect(snap.facts).toHaveLength(10)
    expect(snap.facts.map((f) => f.text)).not.toContain('已退休的事')
    expect(snap.facts[0]!.text).toBe('事实 11')
  })

  it('日记取前八，但闪光灯记忆豁免截断优先保留', () => {
    const journal: JournalEntry[] = Array.from({ length: 10 }, (_, i) => ({
      id: `j${i}`,
      text: `普通记忆 ${i}`,
      heat: i / 10,
      valence: 0,
      createdAtReply: i,
    }))
    journal.push({ id: 'flash', text: '闪光灯记忆', heat: 0.12, flashbulb: true, valence: 1, createdAtReply: 99 })

    const snap = buildGrowthSnapshot({
      track: { realism: { journal } },
      chatId: 'c',
      exportedAt: 1,
    })
    expect(snap.journal).toHaveLength(8)
    expect(snap.journal[0]).toMatchObject({ text: '闪光灯记忆', flashbulb: true })
    expect(snap.journal.map((j) => j.text)).toContain('普通记忆 9')
  })

  it('年轮只保留文本层级强度，丢内部编号与回复序号', () => {
    const snap = buildGrowthSnapshot({
      track: {
        realism: {
          rings: [{ id: 'r1', text: '第一个冬天', tier: 'emerging', strength: 1, createdAtReply: 3, pinned: true }],
        },
      },
      chatId: 'c',
      exportedAt: 1,
    })
    expect(Object.keys(snap.rings[0]!).sort()).toEqual(['strength', 'text', 'tier'])
  })
})

describe('预算保护', () => {
  it('超预算按日记、事实、长记忆顺序截，并标记已截断', () => {
    const huge = 'x'.repeat(4000)
    const snap: GrowthSnapshot = {
      v: GROWTH_SNAPSHOT_VERSION,
      exportedAt: 1,
      chatId: 'c',
      rings: [],
      journal: Array.from({ length: 6 }, (_, i) => ({ text: huge, heat: 1, valence: 0, ...(i ? {} : {}) })),
      promises: [],
      beliefs: [],
      expectations: [],
      facts: Array.from({ length: 6 }, () => ({ text: huge })),
      summary: huge,
    }
    expect(growthSnapshotBytes(snap)).toBeGreaterThan(GROWTH_BUDGET_BYTES)

    const fitted = fitBudget(snap)
    expect(fitted.truncated).toBe(true)
    expect(growthSnapshotBytes(fitted)).toBeLessThanOrEqual(GROWTH_BUDGET_BYTES)
    // 语义完整优先：年轮与承诺不被截
    expect(fitted.rings).toEqual(snap.rings)
    expect(fitted.promises).toEqual(snap.promises)
  })

  it('未超预算时原样返回，不带已截断标记', () => {
    const snap = buildGrowthSnapshot({ track: { affection: 10 }, chatId: 'c', exportedAt: 1 })
    expect(snap.truncated).toBeUndefined()
    expect(growthSnapshotBytes(snap)).toBeLessThanOrEqual(GROWTH_BUDGET_BYTES)
  })
})

describe('烘焙、回读与剥离', () => {
  it('标准卡往返归一化透传后仍可回读', () => {
    const snap = buildGrowthSnapshot({
      track: { affection: 33, realism: { bondLongTerm: 12, rings: [] } },
      chatId: 'c-round',
      exportedAt: 7,
    })
    const card = withGrowth(blankCard(), snap)
    // 模拟走一遍导出 (wrapCardV2) -> 导入 (normalizeCardJson) 的 JSON 往返
    const roundTripped = normalizeCardJson(JSON.parse(JSON.stringify({ spec: 'chara_card_v2', spec_version: '2.0', data: card })))
    const back = readGrowth(roundTripped)
    expect(back).toBeDefined()
    expect(back!.chatId).toBe('c-round')
    expect(back!.affection).toBe(33)
    expect(back!.bondLongTerm).toBe(12)
  })

  it('烘焙不改原卡，且保留其他扩展键', () => {
    const card = blankCard({ extensions: { other: { keep: true } } })
    const snap = buildGrowthSnapshot({ track: {}, chatId: 'c', exportedAt: 1 })
    const out = withGrowth(card, snap)
    expect(card.extensions).toEqual({ other: { keep: true } })
    expect(out.extensions).toMatchObject({ other: { keep: true }, rp_growth: snap })
  })

  it('版本不符或形状不对时优雅降级，不抛错', () => {
    const badVersion = blankCard({ extensions: { rp_growth: { v: 99, rings: [], journal: [], facts: [] } } })
    expect(readGrowth(badVersion)).toBeUndefined()

    const badShape = blankCard({ extensions: { rp_growth: { v: 1 } } })
    expect(readGrowth(badShape)).toBeUndefined()

    const notObject = blankCard({ extensions: { rp_growth: 'oops' } })
    expect(readGrowth(notObject)).toBeUndefined()

    expect(readGrowth(blankCard())).toBeUndefined()
  })

  it('剥离只摘成长区块，其余扩展键原样', () => {
    const snap = buildGrowthSnapshot({ track: {}, chatId: 'c', exportedAt: 1 })
    const card = withGrowth(blankCard({ extensions: { keep: 1 } }), snap)
    const stripped = stripGrowth(card)
    expect(readGrowth(stripped)).toBeUndefined()
    expect(stripped.extensions).toEqual({ keep: 1 })

    // 无 growth 时原对象返回，不额外造对象
    const plain = blankCard()
    expect(stripGrowth(plain)).toBe(plain)
  })
})

describe('规模描述', () => {
  it('给出一行规模描述，超限时提示已截断', () => {
    const snap = buildGrowthSnapshot({
      track: {
        realism: {
          rings: [{ id: 'r', text: '年轮一', tier: 'emerging', strength: 1, createdAtReply: 1 }],
          journal: [{ id: 'j', text: '日记一', heat: 0.5, valence: 0, createdAtReply: 1 }],
          promises: [{ id: 'p', text: '承诺一', by: 'user', status: 'open', createdAtReply: 1 }],
        },
      },
      facts: [fact()],
      summary: '一段长记忆',
      chatId: 'c',
      exportedAt: 1,
    })
    const line = describeGrowthSnapshot(snap)
    expect(line).toContain('年轮 1')
    expect(line).toContain('日记 1')
    expect(line).toContain('记忆 1')
    expect(line).toContain('心结 1')
    expect(line).toContain('KB')
  })
})

describe('取数编排', () => {
  it('群聊里取配角的关系轨，不拿主角那份', () => {
    const chat = {
      id: 'g1',
      characterId: '主角',
      participants: ['配角'],
      participantRelationships: {
        配角: {
          affection: 41,
          beliefsAboutUser: [{ id: 'b', text: '他记得我怕黑', formedTurn: 2 }],
          realism: {
            bondLongTerm: 9,
            rings: [{ id: 'r', text: '并肩走夜路', tier: 'emerging', strength: 2, createdAtReply: 4 }],
          },
        },
      },
      personaId: 'p',
      title: '三人行',
      createdAt: 1,
      updatedAt: 5,
      affection: 99,
      realism: { bondLongTerm: 88 },
    } as unknown as Chat

    const track = getRelationshipTrack(chat, '配角')
    const snap = buildGrowthSnapshot({ track, chatId: chat.id, exportedAt: 1 })
    expect(snap.affection).toBe(41)
    expect(snap.bondLongTerm).toBe(9)
    expect(snap.rings[0]!.text).toBe('并肩走夜路')
    expect(snap.beliefs).toEqual(['他记得我怕黑'])

    // 取主角时仍拿顶层那份 —— 两袋不串
    const primary = buildGrowthSnapshot({
      track: getRelationshipTrack(chat, '主角'),
      chatId: chat.id,
      exportedAt: 1,
    })
    expect(primary.affection).toBe(99)
    expect(primary.bondLongTerm).toBe(88)
  })

  it('挑最近更新的那段聊天', () => {
    const chats = [
      { id: 'old', characterId: 'A', updatedAt: 10 },
      { id: 'new', characterId: 'A', updatedAt: 30 },
      { id: 'other', characterId: 'B', updatedAt: 50 },
      { id: 'group', characterId: 'C', participants: ['A'], updatedAt: 20 },
    ] as unknown as Chat[]
    expect(pickLatestChat(chats, 'A')!.id).toBe('new')
    expect(pickLatestChat(chats, 'B')!.id).toBe('other')
    expect(pickLatestChat(chats, 'C')!.id).toBe('group')
    expect(pickLatestChat(chats, '不存在')).toBeUndefined()
  })
})
