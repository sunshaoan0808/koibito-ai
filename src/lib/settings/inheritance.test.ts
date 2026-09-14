import { describe, expect, it } from 'vitest'
import { inheritedFrom } from './inheritance'

describe('inheritedFrom', () => {
  it('reports the global fallback when the layer never set a value', () => {
    expect(inheritedFrom(undefined, 'chat')).toBe('global')
    expect(inheritedFrom(undefined, 'world', { nullIsUnset: true })).toBe('global')
    expect(inheritedFrom(undefined, 'character')).toBe('global')
  })

  it('reports null when the layer set the value itself', () => {
    expect(inheritedFrom(true, 'chat')).toBeNull()
    expect(inheritedFrom('explicit', 'world', { nullIsUnset: true })).toBeNull()
    expect(inheritedFrom('chatml', 'character')).toBeNull()
  })

  // The whole reason this isn't a truthiness check: `false` and `'off'`-style values are real
  // overrides, and a badge that called them "inherited" would be lying about the layer in force.
  it('counts falsy-but-present values as set', () => {
    expect(inheritedFrom(false, 'chat')).toBeNull()
    expect(inheritedFrom(0, 'chat')).toBeNull()
    expect(inheritedFrom('', 'character')).toBeNull()
  })

  it('treats null as unset only where the chain says so', () => {
    // `WorldCard.intimacyLevel` uses null for "inherit"; the assist flags never store null.
    expect(inheritedFrom(null, 'world', { nullIsUnset: true })).toBe('global')
    expect(inheritedFrom(null, 'chat')).toBeNull()
  })

  it('carries the tri-state through unchanged', () => {
    // `visualNovelMode` is boolean | 'auto'; 'auto' is a decision made at the layer, not a fallthrough.
    expect(inheritedFrom('auto', 'chat')).toBeNull()
  })
})
