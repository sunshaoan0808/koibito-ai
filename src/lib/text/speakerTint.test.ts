import { describe, expect, it } from 'vitest'
import { speakerSeed, speakerTint } from './speakerTint'

describe('speakerTint', () => {
  it('gives the same name the same colour every time', () => {
    expect(speakerTint('Aoi')).toBe(speakerTint('Aoi'))
    expect(speakerTint('  Aoi  ')).toBe(speakerTint('Aoi'))
  })

  it('ignores case, so "aoi" and "Aoi" are one person', () => {
    expect(speakerTint('aoi')).toBe(speakerTint('Aoi'))
  })

  it('separates the speakers of a scene instead of colliding them', () => {
    const names = ['Aoi', 'Ren', 'Mika', 'Yuki', 'Haru', 'Sora', 'Kaito', 'Nao']
    const tints = new Set(names.map((n) => speakerTint(n)))
    // A hash can collide in principle; with ten hues and eight names, at least half must be distinct
    // or the palette is not doing its job.
    expect(tints.size).toBeGreaterThanOrEqual(names.length / 2)
  })

  it('stays inside the curated hue set and honours alpha', () => {
    for (const name of ['Aoi', 'Ren', 'narrator', 'you', '長い名前の登場人物']) {
      const m = /^hsl\((\d+) 70% 62% \/ ([\d.]+)\)$/.exec(speakerTint(name))
      expect(m, `unexpected tint for ${name}`).not.toBeNull()
      expect(Number(m![1])).toBeGreaterThanOrEqual(0)
      expect(Number(m![1])).toBeLessThan(360)
      expect(Number(m![2])).toBeCloseTo(0.85, 5)
    }
    expect(speakerTint('Aoi', 0.25)).toContain('/ 0.25)')
  })

  it('clamps alpha rather than emitting invalid CSS', () => {
    expect(speakerTint('Aoi', 5)).toContain('/ 1)')
    expect(speakerTint('Aoi', -1)).toContain('/ 0)')
  })

  it('still colours an unnamed speaker instead of returning nothing', () => {
    expect(speakerTint('')).toMatch(/^hsl\(/)
    expect(speakerTint('   ')).toBe(speakerTint(''))
  })
})

describe('speakerSeed', () => {
  it('keys characters off their name, and the user off "you"', () => {
    expect(speakerSeed({ role: 'char', speakerName: 'Aoi' })).toBe('Aoi')
    expect(speakerSeed({ role: 'user', speakerName: 'Aoi' })).toBe('you')
  })

  it('falls back to the primary character, then to the narrator', () => {
    expect(speakerSeed({ role: 'char', fallbackName: 'Ren' })).toBe('Ren')
    expect(speakerSeed({ role: 'char' })).toBe('narrator')
    expect(speakerSeed({ role: 'char', speakerName: '  ' })).toBe('narrator')
  })

  it('does not set a solo chat against itself: one character, one colour', () => {
    // In a solo chat the speaker id is absent every time, so the fallback is what keeps the
    // narration one consistent colour rather than flickering between seeds.
    const first = speakerSeed({ role: 'char', fallbackName: 'Aoi' })
    const second = speakerSeed({ role: 'char', fallbackName: 'Aoi' })
    expect(speakerTint(first)).toBe(speakerTint(second))
  })
})
