import { describe, expect, it } from 'vitest'
import { PHASES, type DayPhase, type ScheduleEntry } from './calendar'
import { generateTownFeed, mergeFeedEntries, planSettlement, type FeedCharacterLike, type TownFeedInput } from './townFeed'

/** A work slot. Only `busy` counts as a shift — `available` is not work (`workSchedule.isWorkSlot`). */
const shift = (phase: DayPhase, activity: string, location?: string): ScheduleEntry => ({
  id: `slot-${phase}-${activity}`,
  phase,
  status: 'busy',
  activity,
  location,
})

const mira: FeedCharacterLike = {
  id: 'mira',
  name: 'Mira',
  schedule: [shift('morning', 'baking', 'the bakery'), shift('afternoon', 'baking', 'the bakery')],
  connections: [{ name: 'Tomas', relation: 'friend' }],
}

const tomas: FeedCharacterLike = {
  id: 'tomas',
  name: 'Tomas',
  schedule: [shift('evening', 'bartending', 'the tavern')],
  connections: [{ name: 'Mira', relation: 'friend' }],
}

const base = (over: Partial<TownFeedInput> = {}): TownFeedInput => ({
  worldId: 'world-1',
  from: { day: 3, phaseIndex: 0 },
  to: { day: 9, phaseIndex: PHASES.length - 1 },
  characters: [mira, tomas],
  ...over,
})

describe('planSettlement', () => {
  const now = { day: 6, phaseIndex: 2 }

  it('catches an unsettled chat up from the start of the current day', () => {
    const [plan] = planSettlement({ worldId: 'world-1', characters: [mira, tomas], now, chats: [{ id: 'c1' }] })
    expect(plan.chatId).toBe('c1')
    expect(plan.settledAt).toEqual(now)
    expect(plan.entries.length).toBeGreaterThan(0)
    expect(plan.entries.every((e) => e.at.day === now.day)).toBe(true)
  })

  it('does nothing for a chat that is already current', () => {
    const plans = planSettlement({
      worldId: 'world-1',
      characters: [mira, tomas],
      now,
      chats: [{ id: 'c1', townFeedSettledAt: now }],
    })
    expect(plans).toEqual([])
  })

  it('resumes after the settled cell and never regenerates it', () => {
    const settled = { day: 6, phaseIndex: 0 }
    const [plan] = planSettlement({
      worldId: 'world-1',
      characters: [mira, tomas],
      now,
      chats: [{ id: 'c1', townFeedSettledAt: settled }],
    })
    expect(plan.entries.every((e) => e.at.day * PHASES.length + e.at.phaseIndex > 6 * PHASES.length)).toBe(true)
    expect(plan.settledAt).toEqual(now)
  })

  it('resettles without inventing news when the clock was rewound', () => {
    const [plan] = planSettlement({
      worldId: 'world-1',
      characters: [mira, tomas],
      now,
      chats: [{ id: 'c1', townFeedSettledAt: { day: 9, phaseIndex: 3 } }],
    })
    expect(plan.entries).toEqual([])
    expect(plan.settledAt).toEqual(now)
  })

  it('plans per chat, skipping the ones that are current', () => {
    const plans = planSettlement({
      worldId: 'world-1',
      characters: [mira, tomas],
      now,
      chats: [{ id: 'c1' }, { id: 'c2', townFeedSettledAt: now }],
    })
    expect(plans.map((p) => p.chatId)).toEqual(['c1'])
  })
})

describe('mergeFeedEntries', () => {
  it('does not double up when the same stretch is merged twice', () => {
    const all = generateTownFeed(base({ maxEntries: 999 }))
    const first = mergeFeedEntries([], all.slice(0, 3))
    expect(mergeFeedEntries(first, all.slice(0, 3))).toEqual(first)
  })

  it('keeps world-clock order and drops the oldest when the cap bites', () => {
    const all = generateTownFeed(base({ maxEntries: 999 }))
    const merged = mergeFeedEntries(all.slice(0, 3), all.slice(3, 5), 4)
    expect(merged).toHaveLength(4)
    expect(merged).toEqual(all.slice(1, 5))
  })
})

describe('generateTownFeed', () => {
  it('is deterministic: the same input yields the same entries field for field', () => {
    expect(generateTownFeed(base())).toEqual(generateTownFeed(base()))
  })

  it('does not depend on the order the characters were passed in', () => {
    const forward = generateTownFeed(base({ characters: [mira, tomas] }))
    const backward = generateTownFeed(base({ characters: [tomas, mira] }))
    expect(forward).toEqual(backward)
  })

  it('yields at most one entry per world-clock cell', () => {
    const entries = generateTownFeed(base())
    const cells = entries.map((e) => `${e.at.day}:${e.at.phaseIndex}`)
    expect(new Set(cells).size).toBe(cells.length)
  })

  it('walks the range in world-clock order', () => {
    const cells = generateTownFeed(base({ maxEntries: 999 })).map((e) => e.at.day * 4 + e.at.phaseIndex)
    expect([...cells].sort((a, b) => a - b)).toEqual(cells)
  })

  it('always names who it is about and who was there', () => {
    for (const entry of generateTownFeed(base({ maxEntries: 999 }))) {
      expect(entry.aboutIds.length).toBeGreaterThan(0)
      expect(entry.witnessedByIds.length).toBeGreaterThan(0)
      expect(entry.headline.trim()).not.toBe('')
      expect(entry.detail.trim()).not.toBe('')
    }
  })

  it('gives a day one shift line at most, on its first cell', () => {
    const work = generateTownFeed(base({ maxEntries: 999 })).filter((e) => e.kind === 'work')
    expect(work.length).toBeGreaterThan(0)
    for (const entry of work) expect(entry.at.phaseIndex).toBe(0)
    const days = work.map((e) => e.at.day)
    expect(new Set(days).size).toBe(days.length)
  })

  it('never invents a kind it does not yet produce', () => {
    // 'rumor' and 'cast' are reserved: they need the cast detector wired to the off-screen pass.
    const kinds = new Set(generateTownFeed(base({ maxEntries: 999 })).map((e) => e.kind))
    expect(kinds.has('rumor')).toBe(false)
    expect(kinds.has('cast')).toBe(false)
  })

  it('produces nothing for a backwards range, no characters, or a zero cap', () => {
    expect(generateTownFeed(base({ from: { day: 9, phaseIndex: 0 }, to: { day: 3, phaseIndex: 0 } }))).toEqual([])
    expect(generateTownFeed(base({ characters: [] }))).toEqual([])
    expect(generateTownFeed(base({ maxEntries: 0 }))).toEqual([])
  })

  it('keeps the newest entries when the cap bites', () => {
    const all = generateTownFeed(base({ maxEntries: 999 }))
    const capped = generateTownFeed(base({ maxEntries: 3 }))
    expect(capped).toHaveLength(3)
    expect(capped).toEqual(all.slice(all.length - 3))
  })

  it('says nothing about people with no shifts and no neighbours', () => {
    // No schedule means no shift line; no connections means no social line. Weather only speaks
    // through the people who were out in it, so with nobody on shift there is nothing to report.
    const loner: FeedCharacterLike = { id: 'loner', name: 'Loner' }
    const feed = generateTownFeed(base({ characters: [loner], maxEntries: 999 }))
    expect(feed).toEqual([])
  })
})
