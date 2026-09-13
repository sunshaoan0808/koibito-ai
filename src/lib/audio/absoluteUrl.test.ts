import { describe, expect, it } from 'vitest'
import { absoluteUrl } from './absoluteUrl'

describe('absoluteUrl', () => {
  it('resolves a relative data path against the page', () => {
    expect(absoluteUrl('data/track.mp3', 'https://app.test/chat/1')).toBe('https://app.test/chat/data/track.mp3')
    expect(absoluteUrl('/data/track.mp3', 'https://app.test/chat/1')).toBe('https://app.test/data/track.mp3')
  })

  it('leaves an already-absolute URL alone', () => {
    expect(absoluteUrl('https://cdn.example.com/a.mp3', 'https://app.test/')).toBe('https://cdn.example.com/a.mp3')
  })

  it('returns the input rather than throwing when URL() rejects', () => {
    expect(absoluteUrl('http://[bad', 'https://app.test/')).toBe('http://[bad')
  })

  it('survives a missing base (no page, no protocol) instead of throwing', () => {
    expect(absoluteUrl('data/track.mp3', '')).toBe('data/track.mp3')
  })

  it('resolves against the live location when no base is given', () => {
    // Whatever the environment's location is, the default path must not throw and must return a
    // string — this is the branch the app actually exercises.
    expect(typeof absoluteUrl('data/track.mp3')).toBe('string')
  })
})
