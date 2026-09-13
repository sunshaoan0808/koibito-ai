import { describe, expect, it } from 'vitest'
import {
  addJournalFromTurn,
  coolJournal,
  journalGuidance,
  recallJournal,
  type JournalEntry,
} from './engine'

const entry = (over: Partial<JournalEntry>): JournalEntry => ({
  id: 'j1',
  text: '测试记忆',
  heat: 0.8,
  valence: 0.5,
  createdAtReply: 1,
  ...over,
})

describe('journal cooling', () => {
  it('cools normal entries by 6% per turn toward zero', () => {
    const [e] = coolJournal([entry({ heat: 0.8 })])
    expect(e.heat).toBeCloseTo(0.75)
  })

  it('flashbulb entries cool slower and never below the floor', () => {
    const [e] = coolJournal([entry({ heat: 0.2, flashbulb: true })])
    expect(e.heat).toBeCloseTo(0.194)
    const floors: number[] = []
    let cur: JournalEntry[] = [entry({ heat: 0.2, flashbulb: true })]
    for (let i = 0; i < 30; i++) cur = coolJournal(cur)
    floors.push(cur[0].heat)
    // 四舍五入会让闪光灯记忆稳定在略高于下限的值——"有些事就是忘不掉"，符合设计意图。
    expect(floors[0]).toBeGreaterThanOrEqual(0.12)
    expect(floors[0]).toBeLessThan(0.2)
  })
})

describe('journal capture', () => {
  it('lands important facts as flashbulb entries, skips trivial ones', () => {
    const out = addJournalFromTurn(undefined, {
      replyIndex: 3,
      newFacts: [
        { text: '她的生日在春天', importance: 0.8, valence: 0.4 },
        { text: '随口提到天气', importance: 0.2, valence: 0 },
      ],
      affectionDelta: 0,
    })
    expect(out).toHaveLength(1)
    expect(out[0].flashbulb).toBe(true)
  })

  it('records strong affection swings as its own entry', () => {
    const out = addJournalFromTurn(undefined, { replyIndex: 5, newFacts: [], affectionDelta: -2 })
    expect(out).toHaveLength(1)
    expect(out[0].valence).toBe(-1)
    expect(out[0].flashbulb).toBe(false)
    const big = addJournalFromTurn(undefined, { replyIndex: 6, newFacts: [], affectionDelta: -4 })
    expect(big[0].flashbulb).toBe(true)
  })

  it('caps the ledger at 24, keeping the hottest', () => {
    let cur: JournalEntry[] | undefined
    for (let i = 0; i < 30; i++) {
      cur = addJournalFromTurn(cur, {
        replyIndex: i + 1,
        newFacts: [{ text: 'fact ' + i, importance: 0.5, valence: 0 }],
        affectionDelta: 0,
      })
    }
    expect(cur!.length).toBe(24)
  })
})

describe('journal recall', () => {
  it('scores mood-congruent memories higher', () => {
    const entries = [entry({ id: 'neg', text: '负面', heat: 0.8, valence: -1 }), entry({ id: 'pos', text: '正面', heat: 0.8, valence: 1 })]
    const recalled = recallJournal(entries, { moodValence: -1, replyIndex: 3, max: 1 })
    expect(recalled[0].id).toBe('neg')
  })

  it('drops cold entries and caps count', () => {
    const entries = [entry({ heat: 0.05 }), entry({ heat: 0.9, id: 'hot' })]
    const recalled = recallJournal(entries, { replyIndex: 2, max: 5 })
    expect(recalled).toHaveLength(1)
    expect(recalled[0].id).toBe('hot')
  })

  it('guidance lists recalled entries and is silent when empty', () => {
    expect(journalGuidance(undefined, 1)).toBe('')
    const line = journalGuidance([entry({ heat: 0.8, text: '她记得那本书' })], 2)
    expect(line).toContain('她记得那本书')
    expect(line).toContain('她记忆里还热着的事')
  })
})

describe('journal world-clock stamps', () => {
  it('stamps the world day and phase onto a fact-derived entry', () => {
    const list = addJournalFromTurn([], {
      replyIndex: 4,
      newFacts: [{ text: '她记住了那家店的名字。', importance: 0.8, valence: 0.4 }],
      affectionDelta: 0,
      world: { day: 12, phaseIndex: 2 },
    })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ atDay: 12, atPhase: 'evening', createdAtReply: 4 })
  })

  it('stamps the warmth-move entry too, so both entry kinds agree with the calendar', () => {
    const list = addJournalFromTurn([], { replyIndex: 5, newFacts: [], affectionDelta: 2, world: { day: 3, phaseIndex: 3 } })
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ atDay: 3, atPhase: 'night' })
  })

  it('stamps every entry in the list, not just the newest', () => {
    const list = addJournalFromTurn(
      [entry({ id: 'old', atDay: 1, atPhase: 'morning' })],
      { replyIndex: 6, newFacts: [{ text: '新的记忆', importance: 0.9, valence: 0 }], affectionDelta: 0, world: { day: 2, phaseIndex: 0 } },
    )
    // The older entry keeps the day it was actually written on; only its heat cools.
    expect(list.find((e) => e.id === 'old')).toMatchObject({ atDay: 1, atPhase: 'morning' })
    expect(list.find((e) => e.atDay === 2)?.atPhase).toBe('morning')
  })

  it('leaves entries unstamped when no world clock is passed', () => {
    const list = addJournalFromTurn([], { replyIndex: 7, newFacts: [{ text: '无钟记忆', importance: 0.9 }], affectionDelta: 0 })
    expect(list[0].atDay).toBeUndefined()
    expect(list[0].atPhase).toBeUndefined()
  })

  it('keeps the stamp across cooling so a diary line stays placeable on the calendar', () => {
    const stamped = addJournalFromTurn([], { replyIndex: 1, newFacts: [{ text: '初遇', importance: 0.9 }], affectionDelta: 0, world: { day: 0, phaseIndex: 1 } })
    const cooled = coolJournal(stamped)
    expect(cooled[0]).toMatchObject({ atDay: 0, atPhase: 'afternoon' })
    expect(cooled[0].heat).toBeLessThan(stamped[0].heat)
  })
})
