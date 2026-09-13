import { describe, expect, it } from 'vitest'
import {
  clampSegment,
  concatAudioClips,
  MAX_SEGMENT_CHARS,
  narrateChapters,
  narrationSegments,
  splitSentences,
  stripId3v1,
  stripId3v2,
} from './audiobook'

/** A fake clip: an ID3v2 header, the MPEG `body`, and a trailing ID3v1 tag — like real providers send. */
function taggedClip(body: string): Uint8Array {
  const payload = new TextEncoder().encode(body)
  const header = new Uint8Array(10)
  header.set([0x49, 0x44, 0x33, 3, 0, 0]) // "ID3" v2.3, no flags, empty tag body
  const trailer = new Uint8Array(128)
  trailer.set([0x54, 0x41, 0x47]) // "TAG"
  const out = new Uint8Array(10 + payload.length + 128)
  out.set(header, 0)
  out.set(payload, 10)
  out.set(trailer, 10 + payload.length)
  return out
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

describe('splitSentences', () => {
  it('splits CJK sentence ends and keeps the unterminated tail', () => {
    expect(splitSentences('第一句。第二句！第三句')).toEqual(['第一句。', '第二句！', '第三句'])
  })

  it('splits Latin sentences on the period', () => {
    expect(splitSentences('Hello world. Next sentence. tail')).toEqual(['Hello world.', 'Next sentence.', 'tail'])
  })

  it('treats a line break as a boundary and ignores blank text', () => {
    expect(splitSentences('多行\n第二行')).toEqual(['多行', '第二行'])
    expect(splitSentences('   ')).toEqual([])
  })

  it('keeps a comma-only paragraph in one piece', () => {
    expect(splitSentences('逗号，没结束')).toEqual(['逗号，没结束'])
  })
})

describe('clampSegment', () => {
  it('leaves short text alone', () => {
    expect(clampSegment('短句。')).toEqual(['短句。'])
    expect(clampSegment('   ')).toEqual([])
  })

  it('splits long text instead of truncating it — no character may be lost', () => {
    const text = '一'.repeat(MAX_SEGMENT_CHARS + 25)
    const parts = clampSegment(text)
    expect(parts).toHaveLength(2)
    expect(parts.every((part) => part.length <= MAX_SEGMENT_CHARS)).toBe(true)
    expect(parts.join('')).toBe(text)
  })

  it('prefers to break after a comma near the limit', () => {
    const parts = clampSegment('一二三四五六七八，九十十一十二', 10)
    expect(parts[0]).toBe('一二三四五六七八，')
    expect(parts[0].length).toBeLessThanOrEqual(10)
    expect(parts.join('')).toBe('一二三四五六七八，九十十一十二')
  })
})

describe('audio tag handling', () => {
  it('strips a leading ID3v2 tag and leaves untagged bytes alone', () => {
    const clip = taggedClip('abc')
    expect(decode(stripId3v2(clip))).toBe('abcTAG' + '\u0000'.repeat(125))
    const plain = new Uint8Array([1, 2, 3])
    expect(stripId3v2(plain)).toEqual(plain)
    expect(stripId3v2(new Uint8Array([]))).toEqual(new Uint8Array([]))
  })

  it('strips a trailing ID3v1 tag', () => {
    const bytes = new Uint8Array(130)
    bytes.set([0x41, 0x42], 0)
    bytes.set([0x54, 0x41, 0x47], 2) // "TAG" at length-128
    expect(decode(stripId3v1(bytes))).toBe('AB')
    const noTag = new Uint8Array(130).fill(0x41)
    expect(stripId3v1(noTag)).toEqual(noTag)
  })

  it('joins clips in order with no mid-file tags left behind', () => {
    const joined = concatAudioClips([taggedClip('one'), taggedClip('two'), new Uint8Array()])
    const text = decode(joined)
    expect(text).toBe('onetwo')
    expect(text).not.toContain('ID3')
    expect(text).not.toContain('TAG')
  })
})

describe('narrationSegments', () => {
  it('speaks chapter titles and keeps reading order', () => {
    const segments = narrationSegments([
      { title: '第一章', paragraphs: ['雨夜。天台。'] },
      { title: '第二章', paragraphs: ['她来了！'] },
    ])
    expect(segments).toEqual(['第一章', '雨夜。', '天台。', '第二章', '她来了！'])
  })

  it('never drops text, even when a paragraph is far over the limit', () => {
    const long = '她'.repeat(70) + '。' + '他'.repeat(20)
    const segments = narrationSegments([{ title: '第 1 章', paragraphs: [long] }])
    expect(segments.join('')).toBe('第 1 章' + long)
  })
})

describe('narrateChapters', () => {
  const chapters = [{ title: '第一章', paragraphs: ['第一句。第二句。'] }]

  it('reports progress in order and joins every clip', async () => {
    const progress: number[] = []
    const calls: string[] = []
    const result = await narrateChapters({
      chapters,
      synth: async (text) => {
        calls.push(text)
        return taggedClip(text)
      },
      onProgress: (p) => progress.push(p.done),
    })
    expect(calls).toEqual(['第一章', '第一句。', '第二句。'])
    expect(progress).toEqual([1, 2, 3])
    expect(decode(result.bytes)).toBe('第一章第一句。第二句。')
    expect(result.clips).toBe(3)
    expect(result.skipped).toEqual([])
  })

  it('skips a sentence the provider refuses and says why, instead of aborting the book', async () => {
    const result = await narrateChapters({
      chapters,
      synth: async (text) => {
        if (text.startsWith('第二')) throw new Error('上游 429')
        return taggedClip(text)
      },
    })
    expect(result.clips).toBe(2)
    expect(result.skipped).toEqual([{ text: '第二句。', reason: '上游 429' }])
    expect(decode(result.bytes)).toBe('第一章第一句。')
  })

  it('treats an empty clip as a failure, not as success', async () => {
    const result = await narrateChapters({
      chapters,
      synth: async (text) => (text.startsWith('第一章') ? new Uint8Array() : taggedClip(text)),
    })
    expect(result.clips).toBe(2)
    expect(result.skipped[0].reason).toContain('空音频')
  })

  it('throws (with the first reason) when every segment fails', async () => {
    await expect(
      narrateChapters({ chapters, synth: async () => { throw new Error('上游 500') } }),
    ).rejects.toThrow(/全部 3 段都合成失败.*上游 500/)
  })

  it('throws for an empty transcript instead of writing an empty file', async () => {
    await expect(
      narrateChapters({ chapters: [{ title: '', paragraphs: ['  '] }], synth: async () => taggedClip('x') }),
    ).rejects.toThrow('没有可朗读的内容')
  })

  it('throws an AbortError and stops when cancelled mid-way', async () => {
    const controller = new AbortController()
    const started: string[] = []
    await expect(
      narrateChapters({
        chapters,
        signal: controller.signal,
        synth: async (text) => {
          started.push(text)
          if (started.length === 2) controller.abort()
          return taggedClip(text)
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(started).toEqual(['第一章', '第一句。'])
  })
})
