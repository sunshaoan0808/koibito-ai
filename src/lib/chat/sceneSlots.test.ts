import { describe, expect, it } from 'vitest'
import { fillTemplate, slotsFrom } from './sceneSlots'

describe('sceneSlots', () => {
  it('finds slots in order, deduped', () => {
    expect(slotsFrom('{{place}} and {{who}} then {{place}}')).toEqual(['place', 'who'])
  })

  it('keeps unfilled slots literal', () => {
    expect(fillTemplate('{{place}}/{{who}}', { place: 'K' })).toBe('K/{{who}}')
  })
})
