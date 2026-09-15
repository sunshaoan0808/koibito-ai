import { describe, expect, it } from 'vitest'
import { JEALOUSY_TENSION_NUDGE, jealousyTensionNudge } from './jealousy'

describe('jealousyTensionNudge', () => {
  it('adds the nudge when a jealousy beat lands in front of witnesses', () => {
    expect(jealousyTensionNudge({ jealousySetThisTurn: true, witnessNames: ['Aiko'] })).toBe(JEALOUSY_TENSION_NUDGE)
  })

  it('adds the nudge with several witnesses (still just once)', () => {
    expect(jealousyTensionNudge({ jealousySetThisTurn: true, witnessNames: ['Aiko', 'Riku'] })).toBe(
      JEALOUSY_TENSION_NUDGE,
    )
  })

  it('is zero with no witnesses — a private jealousy beat moves no meter', () => {
    expect(jealousyTensionNudge({ jealousySetThisTurn: true, witnessNames: [] })).toBe(0)
  })

  it('ignores blank witness names', () => {
    expect(jealousyTensionNudge({ jealousySetThisTurn: true, witnessNames: ['  ', ''] })).toBe(0)
  })

  it('is zero when no jealousy flag was set this turn, even with witnesses', () => {
    expect(jealousyTensionNudge({ jealousySetThisTurn: false, witnessNames: ['Aiko'] })).toBe(0)
  })

  it('is deterministic — same input, same output', () => {
    const input = { jealousySetThisTurn: true, witnessNames: ['Aiko'] }
    expect(jealousyTensionNudge(input)).toBe(jealousyTensionNudge(input))
  })
})
