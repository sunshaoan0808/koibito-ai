import { describe, expect, it } from 'vitest'
import { extractInlineAssets, hasInlineAssets, resolveInlineAsset, splitInlineAssets } from './inlineAssets'

describe('splitInlineAssets', () => {
  it('keeps the text around an embed, and reports the name', () => {
    expect(splitInlineAssets('look {{image::park.png}} here')).toEqual([
      { kind: 'text', text: 'look ', name: '' },
      { kind: 'asset', text: '', name: 'park.png' },
      { kind: 'text', text: ' here', name: '' },
    ])
  })

  it('tolerates spaces and casing inside the marker', () => {
    expect(extractInlineAssets('{{  Image  ::  Selfie.JPG  }}')).toEqual(['Selfie.JPG'])
  })

  it('leaves a malformed marker as plain text', () => {
    const text = 'not an embed {{image:park.png}} ok'
    expect(splitInlineAssets(text)).toEqual([{ kind: 'text', text, name: '' }])
    expect(hasInlineAssets(text)).toBe(false)
  })

  it('handles several embeds without losing the runs between them', () => {
    expect(splitInlineAssets('a{{image::one}}b{{image::two}}').map((s) => s.kind)).toEqual([
      'text',
      'asset',
      'text',
      'asset',
    ])
  })

  it('does not treat an unmatched ref as text — the renderer decides how to show a miss', () => {
    expect(splitInlineAssets('{{image::missing.png}}')).toEqual([{ kind: 'asset', text: '', name: 'missing.png' }])
  })
})

describe('extractInlineAssets', () => {
  it('de-dupes case-insensitively and keeps the first spelling', () => {
    expect(extractInlineAssets('{{image::A.png}} {{image::a.PNG}} {{image::b.png}}')).toEqual(['A.png', 'b.png'])
  })
})

describe('resolveInlineAsset', () => {
  it('matches case-insensitively and ignores surrounding spaces in the key', () => {
    expect(resolveInlineAsset('Park', { ' park ': 'data/park.png' })).toBe('data/park.png')
  })

  it('returns null for a miss or a blank asset, never an empty string', () => {
    expect(resolveInlineAsset('nope', { park: 'data/park.png' })).toBeNull()
    expect(resolveInlineAsset('', { park: 'data/park.png' })).toBeNull()
    expect(resolveInlineAsset('park', undefined)).toBeNull()
    expect(resolveInlineAsset('park', { park: '' })).toBeNull()
  })
})
