import { describe, expect, it } from 'vitest'
import { getEnergyRemaining, getMaxEnergyForDay, type ScheduleEntry } from './calendar'
import {
  LATE_GRACE_PHASES,
  clockBoundaryNote,
  describeLateness,
  describeShift,
  latenessFor,
  shiftAt,
  shiftsForDay,
  workScheduleGuidance,
} from './workSchedule'

/** day 0 is spring 1, a monday — the calendar realigns every season on a monday, and the year on day 112. */
const MON = 0
const TUE = 1
const NEXT_MON = 7

const slot = (over: Partial<ScheduleEntry>): ScheduleEntry => ({
  id: over.id ?? 's1',
  phase: over.phase ?? 'morning',
  status: over.status ?? 'busy',
  activity: over.activity ?? 'Baking',
  location: over.location ?? 'The bakery',
  ...(over.days ? { days: over.days } : {}),
})

/** A three-phase bakery job every day: morning, afternoon, evening. */
const BAKERY: ScheduleEntry[] = [
  slot({ id: 'a', phase: 'morning' }),
  slot({ id: 'b', phase: 'afternoon' }),
  slot({ id: 'c', phase: 'evening' }),
]

describe('shiftsForDay', () => {
  it('merges consecutive busy slots that share activity and location into one shift', () => {
    const shifts = shiftsForDay(BAKERY, MON)
    expect(shifts).toHaveLength(1)
    expect(shifts[0]).toMatchObject({ startIndex: 0, endIndex: 2, activity: 'Baking', location: 'The bakery' })
  })

  it('keeps two shifts apart when a phase in between is not a work slot', () => {
    const shifts = shiftsForDay([slot({ phase: 'morning' }), slot({ id: 'd', phase: 'evening' })], MON)
    expect(shifts).toHaveLength(2)
    expect(shifts.map((s) => [s.startIndex, s.endIndex])).toEqual([
      [0, 0],
      [2, 2],
    ])
  })

  it('keeps two shifts apart when the activity or the location changes', () => {
    const shifts = shiftsForDay(
      [
        slot({ phase: 'morning' }),
        slot({ id: 'e', phase: 'afternoon', activity: 'Night class', location: 'The college' }),
      ],
      MON,
    )
    expect(shifts).toHaveLength(2)
    expect(shifts[1].activity).toBe('Night class')
  })

  it('ignores slots that are not work, however they are phrased', () => {
    const schedule = [
      slot({ phase: 'morning', status: 'available', activity: 'Free' }),
      slot({ id: 'f', phase: 'afternoon', status: 'sleeping', activity: 'Asleep' }),
      slot({ id: 'g', phase: 'evening', status: 'traveling', activity: 'Commuting' }),
    ]
    expect(shiftsForDay(schedule, MON)).toEqual([])
  })

  it('repeats a weekday-scoped shift next week, and skips the days it does not cover', () => {
    const schedule = [slot({ phase: 'morning', days: ['monday'] })]
    expect(shiftsForDay(schedule, MON)).toHaveLength(1)
    expect(shiftsForDay(schedule, TUE)).toEqual([])
    expect(shiftsForDay(schedule, NEXT_MON)).toHaveLength(1)
  })

  it('keeps running across the year wrap, where the calendar realigns on a monday', () => {
    const schedule = [slot({ phase: 'morning', days: ['monday'] })]
    const lastDayOfYear = 111
    const nextYear = lastDayOfYear + 1
    expect(shiftsForDay(schedule, lastDayOfYear)).toEqual([])
    expect(shiftsForDay(schedule, nextYear)).toHaveLength(1)
  })

  it('treats a day-less slot as every day', () => {
    const schedule = [slot({ phase: 'morning' })]
    for (const day of [MON, TUE, NEXT_MON, 111]) {
      expect(shiftsForDay(schedule, day)).toHaveLength(1)
    }
  })

  it('is empty without a schedule, and does not mutate what it is given', () => {
    expect(shiftsForDay(undefined, MON)).toEqual([])
    const before = JSON.stringify(BAKERY)
    shiftsForDay(BAKERY, MON)
    expect(JSON.stringify(BAKERY)).toBe(before)
  })
})

describe('shiftAt', () => {
  it('marks the first, middle and last phase of a run', () => {
    expect(shiftAt(BAKERY, MON, 0)?.position).toBe('first')
    expect(shiftAt(BAKERY, MON, 1)?.position).toBe('middle')
    expect(shiftAt(BAKERY, MON, 2)?.position).toBe('last')
  })

  it('calls a one-phase shift both boundaries at once', () => {
    expect(shiftAt([slot({ phase: 'night' })], MON, 3)?.position).toBe('first')
  })

  it('is undefined outside the run', () => {
    expect(shiftAt([slot({ phase: 'night' })], MON, 0)).toBeUndefined()
    expect(shiftAt(undefined, MON, 0)).toBeUndefined()
  })
})

describe('clockBoundaryNote', () => {
  it('announces a clock-in when the clock enters a shift', () => {
    expect(clockBoundaryNote(BAKERY, { day: MON, phaseIndex: 3 }, { day: TUE, phaseIndex: 0 }, 'Mia')).toBe(
      'Mia clocks in: morning to evening at The bakery (Baking).',
    )
  })

  it('announces a clock-out when the shift ends', () => {
    expect(clockBoundaryNote(BAKERY, { day: MON, phaseIndex: 2 }, { day: TUE, phaseIndex: 3 }, 'Mia')).toBe(
      'Mia clocks out of Baking.',
    )
  })

  it('stays quiet while the clock moves inside a shift or outside every shift', () => {
    expect(clockBoundaryNote(BAKERY, { day: MON, phaseIndex: 0 }, { day: MON, phaseIndex: 1 }, 'Mia')).toBe('')
    expect(clockBoundaryNote(undefined, { day: MON, phaseIndex: 0 }, { day: MON, phaseIndex: 1 }, 'Mia')).toBe('')
  })

  it('does not announce a boundary between two different shifts', () => {
    const twoJobs = [slot({ phase: 'morning' }), slot({ id: 'h', phase: 'evening', activity: 'Bar shift' })]
    expect(clockBoundaryNote(twoJobs, { day: MON, phaseIndex: 1 }, { day: MON, phaseIndex: 2 }, 'Mia')).toBe(
      'Mia clocks in: evening at The bakery (Bar shift).',
    )
  })
})

describe('latenessFor', () => {
  it('is not late during the first phase of a shift', () => {
    expect(latenessFor(BAKERY, MON, 0, 'The park')).toBeUndefined()
  })

  it('is late once the shift has been running and they are somewhere else', () => {
    const late = latenessFor(BAKERY, MON, 1, 'The park')
    expect(late).toMatchObject({ phasesLate: 1, position: 'middle' })
    expect(late?.shift.activity).toBe('Baking')
  })

  it('is not late when they are exactly where the shift says', () => {
    expect(latenessFor(BAKERY, MON, 2, 'The bakery')).toBeUndefined()
    expect(latenessFor(BAKERY, MON, 2, 'the bakery')).toBeUndefined()
  })

  it('never invents lateness when nobody said where they are', () => {
    expect(latenessFor(BAKERY, MON, 2, undefined)).toBeUndefined()
    expect(latenessFor(BAKERY, MON, 2, '   ')).toBeUndefined()
  })

  it('is not late when no shift is running', () => {
    expect(latenessFor([slot({ phase: 'night' })], MON, 0, 'The park')).toBeUndefined()
  })

  it('counts whole phases and honours the grace constant', () => {
    const late = latenessFor(BAKERY, MON, 2, 'The park')
    expect(late?.phasesLate).toBe(2 - LATE_GRACE_PHASES)
  })

  it('reads as a sentence', () => {
    const late = latenessFor(BAKERY, MON, 1, 'The park')!
    expect(describeLateness(late)).toBe('1 phase late for Baking')
    expect(describeLateness({ ...late, phasesLate: 2 })).toBe('2 phases late for Baking')
  })
})

describe('describeShift', () => {
  it('collapses a one-phase shift to a single time word', () => {
    expect(describeShift(shiftsForDay([slot({ phase: 'night' })], MON)[0])).toBe('night at The bakery (Baking)')
  })

  it('drops the location when the slot has none', () => {
    const noLocation: ScheduleEntry[] = [
      { id: 'no-loc', phase: 'morning', status: 'busy', activity: 'Baking' },
    ]
    const shifts = shiftsForDay(noLocation, MON)
    expect(describeShift(shifts[0])).toBe('morning (Baking)')
  })
})

describe('workScheduleGuidance', () => {
  it('is empty for a character with no work today', () => {
    expect(workScheduleGuidance('Mia', undefined, MON, 0)).toBe('')
    expect(workScheduleGuidance('Mia', [slot({ phase: 'morning', days: ['sunday'] })], MON, 0)).toBe('')
  })

  it('lists the shifts and nothing else on an on-time day', () => {
    const line = workScheduleGuidance('Mia', BAKERY, MON, 0, 'The bakery')
    expect(line).toBe("Mia's work today: morning to evening at The bakery (Baking).")
  })

  it('adds the consequence line when they are late', () => {
    const line = workScheduleGuidance('Mia', BAKERY, MON, 2, 'The park')
    expect(line).toContain('2 phases late for Baking')
    expect(line).toContain('real, noticed consequence')
  })
})

describe('shifts never double-charge the day planner', () => {
  it('leaves the energy budget exactly as it was', () => {
    for (const day of [MON, TUE, NEXT_MON]) {
      for (let phase = 0; phase < 4; phase += 1) {
        const withJob = getEnergyRemaining(day, phase)
        shiftsForDay(BAKERY, day)
        workScheduleGuidance('Mia', BAKERY, day, phase, 'The park')
        expect(getEnergyRemaining(day, phase)).toBe(withJob)
        expect(getMaxEnergyForDay(day)).toBe(getMaxEnergyForDay(day))
      }
    }
  })
})
