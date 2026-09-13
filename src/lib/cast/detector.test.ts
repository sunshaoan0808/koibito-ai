import { describe, expect, it } from 'vitest'
import {
  CAST_MIN_MENTIONS,
  CAST_PROMPT_LIMIT,
  CAST_SCAN_TURNS,
  castPromptLine,
  detectCastCandidates,
  extractNameTokens,
  type DetectCastInput,
} from './detector'

const input = (over: Partial<DetectCastInput> = {}): DetectCastInput => ({
  texts: [],
  knownNames: [],
  ...over,
})

describe('extractNameTokens', () => {
  it('takes the name in front of a Chinese honorific, not the words before it', () => {
    expect(extractNameTokens('隔壁的田中さん说，今天的面包刚出炉。')).toEqual(['田中'])
  })

  it('takes the name in front of an act of speech', () => {
    expect(extractNameTokens('铃木说，明天再来。')).toEqual(['铃木'])
    expect(extractNameTokens('王小明说，他明天再来。')).toEqual(['王小明'])
    expect(extractNameTokens('张伟问你有没有零钱。')).toEqual(['张伟'])
  })

  it('keeps familiar-name prefixes whole and never swallows the verb', () => {
    expect(extractNameTokens('阿婆问道：你吃了吗？')).toEqual(['阿婆'])
    expect(extractNameTokens('小张笑著点了点头。')).toEqual(['小张'])
  })

  it('finds a Latin name and keeps a two-part one together', () => {
    expect(extractNameTokens('Aria Kestrel waited by the door.')).toEqual(['Aria Kestrel'])
    expect(extractNameTokens('Hale said the bread was gone.')).toEqual(['Hale'])
    expect(extractNameTokens('Mr. Hale waited by the door.')).toEqual(['Hale'])
  })

  it('leaves a sentence-initial one-off Latin word for the second mention', () => {
    // "Strangers" and "Hale" are written identically at the head of a sentence — with no title and
    // no speech verb there is no evidence, so the token is skipped rather than guessed at.
    expect(extractNameTokens('Hale counted the change twice.')).toEqual([])
  })

  it('refuses common words that merely start a sentence', () => {
    expect(extractNameTokens('The bakery was closed.')).toEqual([])
    expect(extractNameTokens('Strangers came in out of the rain.')).toEqual([])
    expect(extractNameTokens('Monday again, and nothing had changed.')).toEqual([])
  })

  it('refuses Chinese function words the capture window can pick up', () => {
    expect(extractNameTokens('他的面包很好吃。')).toEqual([])
    expect(extractNameTokens('这里的面包很好吃。')).toEqual([])
  })

  it('dedupes repeated mentions inside one message', () => {
    expect(extractNameTokens('田中さん笑了，田中さん又摇了摇头。')).toEqual(['田中'])
  })

  it('is empty for prose with nobody in it', () => {
    expect(extractNameTokens('The rain kept falling on the empty street.')).toEqual([])
    expect(extractNameTokens('')).toEqual([])
  })
})

describe('detectCastCandidates', () => {
  it('collects a newcomer with a mention count and the sentence they appeared in', () => {
    const candidates = detectCastCandidates(
      input({
        texts: [
          { id: 'm1', text: '隔壁的田中さん说，今天的面包刚出炉。' },
          { id: 'm2', text: '田中さん又探头看了一眼柜台。' },
        ],
      }),
    )
    expect(candidates).toHaveLength(1)
    expect(candidates[0].name).toBe('田中')
    expect(candidates[0].mentions).toBe(2)
    expect(candidates[0].firstSeenMessageId).toBe('m1')
    expect(candidates[0].sample).toContain('面包刚出炉')
  })

  it('never reports someone the chat already has', () => {
    const texts = [{ id: 'm1', text: '田中さん说，今天的面包刚出炉。' }]
    expect(detectCastCandidates(input({ texts, knownNames: ['田中'] }))).toEqual([])
  })

  it('compares known names case-insensitively', () => {
    const texts = [{ id: 'm1', text: 'Aria Kestrel waited by the door.' }]
    expect(detectCastCandidates(input({ texts, knownNames: ['aria kestrel'] }))).toEqual([])
  })

  it('never reports a world-book subject', () => {
    const texts = [{ id: 'm1', text: '田中さん说，今天的面包刚出炉。' }]
    expect(detectCastCandidates(input({ texts, lorebookKeys: ['田中'] }))).toEqual([])
  })

  it('respects the writer’s own dismissals', () => {
    const texts = [{ id: 'm1', text: '田中さん说，今天的面包刚出炉。' }]
    expect(detectCastCandidates(input({ texts, ignore: ['田中'] }))).toEqual([])
  })

  it('ignores a nameless passer-by outside the scan window', () => {
    const texts = [
      { id: 'm0', text: '田中さん说，今天的面包刚出炉。' },
      ...Array.from({ length: CAST_SCAN_TURNS }, (_, index) => ({
        id: `f${index}`,
        text: '雨还在下。',
      })),
    ]
    expect(detectCastCandidates(input({ texts }))).toEqual([])
  })

  it('sorts the strongest first, so a caller can take the top few', () => {
    const candidates = detectCastCandidates(
      input({
        texts: [
          { id: 'm1', text: '阿婆问道：你吃了吗？' },
          { id: 'm2', text: '田中さん说，今天的面包刚出炉。' },
          { id: 'm3', text: '田中さん把纸袋推过来。' },
        ],
      }),
    )
    expect(candidates.map((candidate) => candidate.name)).toEqual(['田中', '阿婆'])
    expect(candidates[0].mentions).toBe(2)
    expect(candidates[1].mentions).toBe(1)
  })

  it('is empty for a scene with no newcomers', () => {
    expect(detectCastCandidates(input({ texts: [{ id: 'm1', text: '雨还在下。' }] }))).toEqual([])
  })
})

describe('castPromptLine', () => {
  it('is empty for a disabled feature or a scene with no candidates', () => {
    expect(castPromptLine([])).toBe('')
  })

  it('leaves out a name that only showed up once', () => {
    const candidates = detectCastCandidates(input({ texts: [{ id: 'm1', text: '阿婆问道：你吃了吗？' }] }))
    expect(candidates[0].mentions).toBeLessThan(CAST_MIN_MENTIONS)
    expect(castPromptLine(candidates)).toBe('')
  })

  it('names the strong candidates and nothing else', () => {
    const candidates = detectCastCandidates(
      input({
        texts: [
          { id: 'm1', text: '田中さん说，今天的面包刚出炉。' },
          { id: 'm2', text: '田中さん把纸袋推过来。' },
        ],
      }),
    )
    const line = castPromptLine(candidates)
    expect(line).toContain('田中')
    expect(line).toContain('passing visitors')
  })

  it('never carries more names than the cap', () => {
    const lines = [
      '田中さん说，面包刚出炉。',
      '阿婆问道：你吃了吗？',
      '铃木说，明天再来。',
      '老李喊了一句。',
    ]
    const texts = Array.from({ length: 4 }, (_, round) =>
      lines.map((text, index) => ({ id: `m${round}-${index}`, text })),
    ).flat()
    const candidates = detectCastCandidates(input({ texts }))
    expect(candidates.length).toBeGreaterThan(CAST_PROMPT_LIMIT)
    const named = castPromptLine(candidates).split('right now: ')[1].split('.')[0].split(', ')
    expect(named).toHaveLength(CAST_PROMPT_LIMIT)
  })
})
