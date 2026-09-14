import { describe, expect, it } from 'vitest'
import { PHASES, type DayPhase, type ScheduleEntry } from './calendar'
import { generateTownFeed, type FeedCharacterLike, type TownFeedInput } from './townFeed'

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
