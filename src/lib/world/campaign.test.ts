import { describe, expect, it } from 'vitest'
import {
  campaignProgress,
  campaignPromptLine,
  evaluateCampaign,
  isCampaignEnabled,
  type CampaignDef,
} from './campaign'

const BASE: CampaignDef = {
  premise: 'Win the summer festival confession.',
  dayCount: 11,
  startDay: 0,
  endings: [
    { id: 'e1', label: 'Fireworks confession', description: 'Sweet ending.', winKind: 'stage', winStage: 'close' },
    { id: 'e2', label: 'First kiss', description: 'Bold ending.', winKind: 'flags', winFlags: ['first_kiss'] },
  ],
}

describe('isCampaignEnabled', () => {
  it('is disabled without a campaign', () => {
    expect(isCampaignEnabled(undefined)).toBe(false)
  })

  it('is disabled with a blank premise or non-positive day count', () => {
    expect(isCampaignEnabled({ ...BASE, premise: '  ' })).toBe(false)
    expect(isCampaignEnabled({ ...BASE, dayCount: 0 })).toBe(false)
  })

  it('is enabled with premise + positive day count', () => {
    expect(isCampaignEnabled(BASE)).toBe(true)
  })
})

describe('evaluateCampaign', () => {
  it('is disabled without a campaign', () => {
    expect(evaluateCampaign(undefined, { currentDay: 3, stage: 'close', flags: [] }).status).toBe('disabled')
  })

  it('is active mid-arc with days left', () => {
    const r = evaluateCampaign(BASE, { currentDay: 3, stage: 'warming_up', flags: [] })
    expect(r.status).toBe('active')
    expect(r.daysLeft).toBe(8)
    expect(r.ending).toBeUndefined()
  })

  it('wins on stage — first satisfied ending in list order', () => {
    const r = evaluateCampaign(BASE, { currentDay: 3, stage: 'sweethearts', flags: ['first_kiss'] })
    expect(r.status).toBe('won')
    expect(r.ending?.id).toBe('e1')
  })

  it('wins on flags when the stage ending is not met', () => {
    const r = evaluateCampaign(BASE, { currentDay: 3, stage: 'warming_up', flags: ['first_kiss'] })
    expect(r.status).toBe('won')
    expect(r.ending?.id).toBe('e2')
  })

  it('expires past the deadline with no ending met', () => {
    const r = evaluateCampaign(BASE, { currentDay: 11, stage: 'warming_up', flags: [] })
    expect(r.status).toBe('expired')
    expect(r.daysLeft).toBe(0)
  })

  it('a win on the deadline day still counts as won, not expired', () => {
    const r = evaluateCampaign(BASE, { currentDay: 11, stage: 'close', flags: [] })
    expect(r.status).toBe('won')
  })

  it('custom flags count toward flag endings', () => {
    const custom: CampaignDef = {
      ...BASE,
      endings: [{ id: 'x', label: 'X', description: '', winKind: 'flags', winFlags: ['my_flag'] }],
    }
    expect(evaluateCampaign(custom, { currentDay: 1, stage: 'near_strangers', flags: ['my_flag'] }).status).toBe('won')
  })

  it('flag endings need ALL listed flags', () => {
    const multi: CampaignDef = {
      ...BASE,
      endings: [{ id: 'x', label: 'X', description: '', winKind: 'flags', winFlags: ['a', 'b'] }],
    }
    expect(evaluateCampaign(multi, { currentDay: 1, stage: 'near_strangers', flags: ['a'] }).status).toBe('active')
  })
})

describe('campaignProgress', () => {
  it('clamps elapsed into [0, total]', () => {
    expect(campaignProgress(BASE, 3)).toEqual({ elapsed: 3, total: 11 })
    expect(campaignProgress(BASE, -5)).toEqual({ elapsed: 0, total: 11 })
    expect(campaignProgress(BASE, 99)).toEqual({ elapsed: 11, total: 11 })
  })
})

describe('campaignPromptLine', () => {
  it('is empty without a campaign', () => {
    expect(campaignPromptLine(undefined, 3)).toBe('')
  })

  it('carries premise, countdown, and endings', () => {
    const line = campaignPromptLine(BASE, 3)
    expect(line).toContain('Win the summer festival confession.')
    expect(line).toContain('8 days left')
    expect(line).toContain('Fireworks confession')
    expect(line).toContain('First kiss')
  })

  it('marks a passed deadline instead of a negative countdown', () => {
    expect(campaignPromptLine(BASE, 20)).toContain('the deadline has passed')
  })
})
