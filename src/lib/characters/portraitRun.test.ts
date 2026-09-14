import { describe, expect, it } from 'vitest'
import {
  canContinue,
  canRegenerate,
  gateIsOpen,
  isSpendingPack,
  nextStageAfterPortrait,
  nextStageAfterRegenerate,
  nextStageAfterReview,
  packSpend,
  primaryAction,
  type PortraitRunStage,
} from './portraitRun'

const ATTEMPTED = { hasPortrait: true, packWanted: true, packPossible: true, stopped: false }

describe('nextStageAfterPortrait', () => {
  it('stops at the gate when a pack is pending — that is the whole point of the gate', () => {
    expect(nextStageAfterPortrait(ATTEMPTED)).toBe('review')
  })

  it('finishes without a gate when the user asked for no expressions', () => {
    expect(nextStageAfterPortrait({ ...ATTEMPTED, packWanted: false })).toBe('done')
  })

  it('finishes without a gate when the backend cannot run the pack anyway', () => {
    expect(nextStageAfterPortrait({ ...ATTEMPTED, packPossible: false })).toBe('done')
  })

  it('stays on the portrait when nothing was produced, so the button keeps working', () => {
    expect(nextStageAfterPortrait({ ...ATTEMPTED, hasPortrait: false })).toBe('portrait')
  })

  it('a stop before the pack is earned settles the run rather than opening a gate for nothing', () => {
    expect(nextStageAfterPortrait({ ...ATTEMPTED, stopped: true })).toBe('done')
  })
})

describe('nextStageAfterRegenerate', () => {
  it('stays at the gate after a successful regenerate, so a look can be vetoed repeatedly', () => {
    expect(nextStageAfterRegenerate({ ok: true, hasPortrait: true, stopped: false })).toBe('review')
  })

  it('a failed regenerate keeps the portrait on screen and stays at the gate', () => {
    expect(nextStageAfterRegenerate({ ok: false, hasPortrait: true, stopped: false })).toBe('review')
  })

  it('with no portrait to fall back on, retrying returns to the generating stage', () => {
    expect(nextStageAfterRegenerate({ ok: false, hasPortrait: false, stopped: false })).toBe('portrait')
  })

  it('stopping mid-regenerate settles the run', () => {
    expect(nextStageAfterRegenerate({ ok: true, hasPortrait: true, stopped: true })).toBe('done')
  })
})

describe('nextStageAfterReview', () => {
  it('only the explicit answer opens the pack stage', () => {
    expect(nextStageAfterReview({ withPack: true, packPossible: true })).toBe('pack')
  })

  it('taking the portrait alone finishes the run', () => {
    expect(nextStageAfterReview({ withPack: false, packPossible: true })).toBe('done')
  })

  it('a yes still cannot reach the pack when the backend cannot run it', () => {
    expect(nextStageAfterReview({ withPack: true, packPossible: false })).toBe('done')
  })
})

describe('the gate guarantees, stated as assertions', () => {
  it('no expression generation is ever spent before the gate is passed', () => {
    const before: PortraitRunStage[] = ['idle', 'portrait', 'review', 'done']
    for (const stage of before) expect(packSpend(stage, 6)).toBe(0)
    expect(packSpend('pack', 6)).toBe(6)
  })

  it('a negative selection cannot report a negative spend', () => {
    expect(packSpend('pack', -3)).toBe(0)
  })

  it('gate controls are live only at the gate', () => {
    const stages: PortraitRunStage[] = ['idle', 'portrait', 'review', 'pack', 'done']
    expect(stages.filter(gateIsOpen)).toEqual(['review'])
    expect(stages.filter(canRegenerate)).toEqual(['review'])
    expect(stages.filter(canContinue)).toEqual(['review'])
    expect(stages.filter(isSpendingPack)).toEqual(['pack'])
  })

  it('the primary button stops while spending, continues at the gate, starts otherwise', () => {
    expect(primaryAction('idle')).toBe('start')
    expect(primaryAction('portrait')).toBe('stop')
    expect(primaryAction('review')).toBe('continue')
    expect(primaryAction('pack')).toBe('stop')
    expect(primaryAction('done')).toBe('start')
  })
})
