import { describe, expect, it } from 'vitest'
import {
  applyPromiseOps,
  applyRepair,
  armRepairIfNeeded,
  bondDrift,
  chaosRoll,
  decayNeeds,
  mergeRings,
  nextBondLongTerm,
  needsGuidance,
  applyNeedsDelta,
  openRealismPromises,
  promisesGuidance,
  recapGuidance,
  repairGuidance,
  type OpenPromise,
} from './engine'

describe('promise ledger', () => {
  it('opens, keeps, and scores a user promise', () => {
    const r1 = applyPromiseOps(undefined, { opened: [{ text: '周六九点到', by: 'user' }] }, 1)
    const open = openRealismPromises(r1.state)
    expect(open).toHaveLength(1)
    expect(promisesGuidance(r1.state)).toContain('周六九点到')

    const r2 = applyPromiseOps(r1.state, { kept: [0] }, 2)
    expect(r2.trustDelta).toBe(12)
    expect(r2.affectionDelta).toBe(6)
    expect(openRealismPromises(r2.state)).toHaveLength(0)
  })

  it('breaks harder than it keeps', () => {
    const r1 = applyPromiseOps(undefined, { opened: [{ text: '答应陪她', by: 'user' }] }, 1)
    const r2 = applyPromiseOps(r1.state, { broken: [0] }, 2)
    expect(r2.trustDelta).toBeLessThanOrEqual(-20)
  })

  it('caps the open ledger at three', () => {
    let state
    for (let i = 0; i < 5; i++) state = applyPromiseOps(state, { opened: [{ text: `承诺${i}`, by: 'user' }] }, i + 1).state
    expect(openRealismPromises(state)).toHaveLength(3)
  })

  it('ignores stale kept indices (double-keep is a no-op)', () => {
    const r1 = applyPromiseOps(undefined, { opened: [{ text: 'x', by: 'user' }] }, 1)
    const r2 = applyPromiseOps(r1.state, { kept: [0] }, 2)
    const r3 = applyPromiseOps(r2.state, { kept: [0] }, 3)
    expect(r3.trustDelta).toBe(0)
  })
})

describe('trust repair window', () => {
  it('arms on a ≥20 loss and restores half on a sincere attempt', () => {
    expect(armRepairIfNeeded(undefined, -22)).toEqual({ loss: 22 })
    expect(armRepairIfNeeded(undefined, -5)).toBeNull()
    const r = applyRepair({ repair: { loss: 22 } }, true)
    expect(r.trustDelta).toBe(11)
    expect(r.state).toBeNull()
  })

  it('a glib attempt keeps the window open and restores nothing', () => {
    const state = { repair: { loss: 22 } }
    const r = applyRepair(state, false)
    expect(r.trustDelta).toBe(0)
    expect(r.state).toEqual({ loss: 22 })
    expect(repairGuidance(state)).toContain('修复窗口')
  })
})

describe('two-speed bond', () => {
  it('long-term creeps at ~1/8 speed and clamps', () => {
    expect(nextBondLongTerm(50, 8)).toBe(51)
    expect(nextBondLongTerm(99.5, 8)).toBe(100)
    expect(nextBondLongTerm(0.2, -8)).toBe(0)
  })

  it('drifts affection 1 point toward neutral every 10 replies', () => {
    expect(bondDrift(80, 10)).toBe(79)
    expect(bondDrift(30, 20)).toBe(31)
    expect(bondDrift(50, 10)).toBe(50)
    expect(bondDrift(80, 9)).toBe(80)
  })
})

describe('needs simulation', () => {
  it('decays every need a little each turn and floors at 0', () => {
    const low = decayNeeds({ hunger: 0.5, bladder: 90, energy: 90, social: 90, fun: 90, hygiene: 90, comfort: 90 })
    expect(low.hunger).toBe(0)
    expect(low.energy).toBeLessThan(90)
  })

  it('guidance only speaks when a need is low', () => {
    const ok = decayNeeds(undefined)
    expect(needsGuidance(ok)).toBe('')
    const bad = decayNeeds(undefined)
    bad.hunger = 12
    expect(needsGuidance(bad)).toContain('饱腹')
    expect(needsGuidance(bad)).not.toContain('12.0')
  })

  it('applies judge deltas on top of decay', () => {
    const before = decayNeeds(undefined)
    const after = applyNeedsDelta(before, { hunger: 30 })
    expect(after.hunger).toBeGreaterThan(before.hunger)
  })
})

describe('growth rings', () => {
  it('adds, reinforces through tiers, and fades the unreinforced', () => {
    const a = mergeRings(undefined, [{ action: 'add', text: '敢于拒绝别人' }], 5)
    expect(a.rings).toHaveLength(1)
    expect(a.rings[0].tier).toBe('emerging')

    const b = mergeRings(a.rings, [{ action: 'reinforce', index: 0 }, { action: 'reinforce', index: 0 }], 10)
    expect(b.rings[0].tier).toBe('established')

    // Fade: an emerging ring loses 0.5 per check; two checks retire it.
    const c = mergeRings(a.rings, [], 15)
    expect(c.rings[0].strength).toBeCloseTo(0.5)
    const d = mergeRings(c.rings, [], 20)
    expect(d.rings).toHaveLength(0)
  })

  it('caps at 12 and drops the weakest unpinned', () => {
    let rings: ReturnType<typeof mergeRings>['rings'] = []
    for (let i = 0; i < 14; i++) rings = mergeRings(rings, [{ action: 'add', text: `ring ${i}` }], i + 1).rings
    expect(rings.length).toBeLessThanOrEqual(12)
  })
})

describe('chaos mode', () => {
  it('pressure builds 5 per turn and never exceeds 100', () => {
    let state
    const never = () => 1
    for (let i = 0; i < 30; i++) state = { ...(state ?? {}), chaosPressure: chaosRoll(state, i + 1, never).pressure }
    expect(state!.chaosPressure).toBe(100)
  })

  it('returns an event when the roll fires', () => {
    const r = chaosRoll({ chaosPressure: 100 }, 5, () => 0)
    expect(r.event).toBeTruthy()
    expect(r.pressure).toBe(0)
  })
})

describe('recap', () => {
  it('is silent under 12h and speaks beyond', () => {
    const now = Date.now()
    expect(recapGuidance(now - 3_600_000, now)).toBe('')
    expect(recapGuidance(now - 48 * 3_600_000, now)).toContain('2天')
  })
})
