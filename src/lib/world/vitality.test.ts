import { describe, expect, it } from 'vitest'
import { describeVitality, getCalendarInfo } from './calendar'

// Pick days that are guaranteed weekdays / weekends by consulting the calendar itself.
const weekdayDay = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => !['saturday', 'sunday'].includes(getCalendarInfo(d).weekday))!
const weekendDay = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => ['saturday', 'sunday'].includes(getCalendarInfo(d).weekday))!

describe('describeVitality', () => {
  it('says nothing on a fresh weekday morning with a full tank', () => {
    // Weekday morning: 3/3 actions left, nothing spent — no line, prompts stay lean.
    expect(describeVitality(weekdayDay, 0)).toBe('')
  })

  it('says nothing mid-day with energy to spare', () => {
    // Weekday afternoon: 2/3 left, not winding down yet.
    expect(describeVitality(weekdayDay, 1)).toBe('')
  })

  it('tells the model the day is winding down on a weekday evening', () => {
    // Weekday evening: phaseIndex 2 → 1 action left, spent max - 1.
    const line = describeVitality(weekdayDay, 2)
    expect(line).toContain('evening')
    expect(line).toContain('winding down')
  })

  it('tells the model night means sleepy and shorter replies', () => {
    const line = describeVitality(weekdayDay, 3)
    expect(line).toContain('late')
    expect(line).toContain('winding down for sleep')
    expect(line).toContain('shorter')
    expect(line).toContain('fully spent')
  })

  it('clamps out-of-range phases to night', () => {
    const line = describeVitality(weekdayDay, 9)
    expect(line).toContain('late')
  })
})
