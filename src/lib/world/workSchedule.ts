/**
 * P2-1 Clock In: turns a character's flat routine slots (`ScheduleEntry[]`) into *shifts* — a
 * continuous run of busy phases on one weekday — so the app can talk about clocking in, clocking
 * out, and being late for work. Derived, never stored: the editor keeps writing plain slots, and
 * there is exactly one source of truth for a character's week.
 *
 * Everything here is pure. Nothing spends energy: a shift occupies phases the day planner already
 * accounts for, so the two never double-charge the same hour (see `calendar.getEnergyRemaining`).
 */
import {
  PHASES,
  getCalendarInfo,
  type DayPhase,
  type ScheduleEntry,
  type Weekday,
} from './calendar'

/** A run of consecutive busy phases on one weekday, merged from `ScheduleEntry` slots. */
export interface WorkShift {
  /** Stable string key: weekday + span + activity + location. */
  key: string
  weekday: Weekday
  /** Index into `PHASES` of the shift's first / last phase. */
  startIndex: number
  endIndex: number
  activity: string
  location?: string
}

/** Where in its own span a phase sits — `first`/`last` are the clock-in / clock-out boundaries. */
export type ShiftPosition = 'first' | 'middle' | 'last'

/** Phases of a shift that must pass before the character counts as late. 0 = lateness starts at the
 *  second phase of the shift; a shift's own first phase is never late. */
export const LATE_GRACE_PHASES = 0

function phaseIndex(phase: DayPhase): number {
  return PHASES.indexOf(phase)
}

/** A slot only feeds a shift when the character is actually on the hook — `available` is not work. */
function isWorkSlot(entry: ScheduleEntry, weekday: Weekday): boolean {
  if (entry.status !== 'busy') return false
  return entry.days?.length ? entry.days.includes(weekday) : true
}

/** Every work shift on the calendar day `day`, ordered by start phase. Merges adjacent slots that
 *  share activity + location, so a three-phase bakery job reads as one shift, not three. */
export function shiftsForDay(schedule: ScheduleEntry[] | undefined, day: number): WorkShift[] {
  if (!schedule?.length) return []
  const weekday = getCalendarInfo(day).weekday
  const slots = schedule
    .filter((e) => isWorkSlot(e, weekday))
    .slice()
    .sort((a, b) => phaseIndex(a.phase) - phaseIndex(b.phase))

  const shifts: WorkShift[] = []
  for (const slot of slots) {
    const start = phaseIndex(slot.phase)
    const prev = shifts[shifts.length - 1]
    const sameRun = prev && start === prev.endIndex + 1 && prev.activity === slot.activity && prev.location === entryLocation(slot)
    if (sameRun) {
      prev.endIndex = start
    } else {
      shifts.push({
        key: `${weekday}:${start}-${start}:${slot.activity}:${entryLocation(slot) ?? ''}`,
        weekday,
        startIndex: start,
        endIndex: start,
        activity: slot.activity,
        location: entryLocation(slot),
      })
    }
  }
  return shifts
}

function entryLocation(entry: ScheduleEntry): string | undefined {
  return entry.location || undefined
}

/** The shift covering `phaseIndex` on `day`, plus where inside its span that phase sits. */
export function shiftAt(
  schedule: ScheduleEntry[] | undefined,
  day: number,
  phaseIndex: number,
): { shift: WorkShift; position: ShiftPosition } | undefined {
  const shift = shiftsForDay(schedule, day).find(
    (s) => phaseIndex >= s.startIndex && phaseIndex <= s.endIndex,
  )
  if (!shift) return undefined
  const position: ShiftPosition =
    phaseIndex === shift.startIndex && shift.startIndex === shift.endIndex
      ? 'first'
      : phaseIndex === shift.startIndex
        ? 'first'
        : phaseIndex === shift.endIndex
          ? 'last'
          : 'middle'
  return { shift, position }
}

/** Human line for a derived shift, e.g. `morning to afternoon at The bakery (Opening up)`. */
export function describeShift(shift: WorkShift): string {
  const from = PHASES[shift.startIndex]
  const to = PHASES[shift.endIndex]
  const span = from === to ? from : `${from} to ${to}`
  return `${span}${shift.location ? ` at ${shift.location}` : ''} (${shift.activity})`
}

/**
 * The clock just moved from one phase to the next: does this crossing clock someone in or out?
 * Returns `''` when nothing about work changed, so callers can toast unconditionally.
 */
export function clockBoundaryNote(
  schedule: ScheduleEntry[] | undefined,
  from: { day: number; phaseIndex: number },
  to: { day: number; phaseIndex: number },
  charName: string,
): string {
  const before = shiftAt(schedule, from.day, from.phaseIndex)
  const after = shiftAt(schedule, to.day, to.phaseIndex)
  if (after && (!before || before.shift.key !== after.shift.key)) {
    return `${charName} clocks in: ${describeShift(after.shift)}.`
  }
  if (before && !after) {
    return `${charName} clocks out of ${before.shift.activity}.`
  }
  return ''
}

/** Why the character is late, if they are: their shift is running but they are somewhere else. */
export interface Lateness {
  shift: WorkShift
  /** Whole phases since the shift started, grace already subtracted. */
  phasesLate: number
  position: ShiftPosition
}

/**
 * Late = inside a running shift, `presentAt` is known, and it is not the shift's location. Passing
 * no `presentAt` (nobody told us where they are) never produces lateness — an unknown is not guilt.
 */
export function latenessFor(
  schedule: ScheduleEntry[] | undefined,
  day: number,
  phaseIndex: number,
  presentAt?: string,
): Lateness | undefined {
  const at = shiftAt(schedule, day, phaseIndex)
  if (!at) return undefined
  if (!presentAt?.trim()) return undefined
  const where = presentAt.trim().toLowerCase()
  const expected = at.shift.location?.trim().toLowerCase()
  if (expected && where === expected) return undefined
  const phasesLate = phaseIndex - at.shift.startIndex - LATE_GRACE_PHASES
  if (phasesLate <= 0) return undefined
  return { shift: at.shift, phasesLate, position: at.position }
}

/** How late, in words — used by the UI chip and by the prompt line below. */
export function describeLateness(late: Lateness): string {
  const unit = late.phasesLate === 1 ? 'phase' : 'phases'
  return `${late.phasesLate} ${unit} late for ${late.shift.activity}`
}

/** Consequence line for the prompt: being late has to land somewhere, not stay a hidden number. */
export function latenessGuidance(charName: string, late: Lateness): string {
  return (
    `${charName} is ${describeLateness(late)}${late.shift.location ? ` at ${late.shift.location}` : ''} — ` +
    `they are supposed to be on shift right now and are not there. Play this as a real, noticed ` +
    `consequence (a boss or coworker commenting, money lost, a reputation dent, having to make it ` +
    `up later), not as flavor that silently costs nothing.`
  )
}

/** One prompt line for the whole of today's work: the shifts, where the clock is inside them, and
 *  any lateness. Returns `''` for a character with no work slots today. */
export function workScheduleGuidance(
  charName: string,
  schedule: ScheduleEntry[] | undefined,
  day: number,
  phaseIndex: number,
  presentAt?: string,
): string {
  const shifts = shiftsForDay(schedule, day)
  if (!shifts.length) return ''
  const list = shifts.map(describeShift).join('; ')
  const late = latenessFor(schedule, day, phaseIndex, presentAt)
  const parts = [`${charName}'s work today: ${list}.`]
  if (late) parts.push(latenessGuidance(charName, late))
  return parts.join(' ')
}
