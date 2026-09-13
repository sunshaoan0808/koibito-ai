/**
 * The EPUB's other half: turn a chat transcript into one continuous MP3.
 *
 * The TTS endpoint answers one clip per request, so this walks the chapters in order, splits the
 * prose into speakable sentences, synthesizes each one and joins the clips. Failures are collected
 * instead of thrown — losing one line beats losing an hour of narration — but if everything fails
 * the caller gets an error, never a silent empty file.
 */

/** A single TTS request carries one sentence; long texts make providers time out mid-synthesis. */
export const MAX_SEGMENT_CHARS = 320

/**
 * Sentence ends, CJK and Latin in one pass. This is deliberately NOT
 * `voice/sentenceChunker.extractCompleteSentences`: that one is a *streaming* splitter for
 * playback (it returns only terminated sentences and drops the tail until more text arrives),
 * while narration reads a finished transcript and must keep every character.
 */
const SENTENCE_END = /[。！？；…]+[”’"')\]]*|[.!?]+[”’"')\]]*(?=\s|$)|[.!?]+[”’"')\]]*\s+|\n+/g

/** Splits finished prose into sentences, keeping the unterminated tail (it still has to be spoken). */
export function splitSentences(text: string): string[] {
  const parts: string[] = []
  let last = 0
  SENTENCE_END.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = SENTENCE_END.exec(text)) !== null) {
    const end = match.index + match[0].length
    const piece = text.slice(last, end).trim()
    if (piece) parts.push(piece)
    last = end
    if (match[0].length === 0) SENTENCE_END.lastIndex += 1 // zero-length match guard
  }
  const tail = text.slice(last).trim()
  if (tail) parts.push(tail)
  return parts
}

/**
 * Keeps a segment under the provider's comfort limit by *splitting* it (preferring the last comma,
 * then the last space) — never by truncating: dropping the end of a sentence loses story text.
 */
export function clampSegment(text: string, limit = MAX_SEGMENT_CHARS): string[] {
  const trimmed = text.trim()
  if (trimmed.length <= limit) return trimmed ? [trimmed] : []
  const window = trimmed.slice(0, limit)
  const breakAt = Math.max(window.lastIndexOf('，'), window.lastIndexOf(','), window.lastIndexOf(' '))
  const cut = breakAt > limit * 0.5 ? breakAt + 1 : limit
  return [trimmed.slice(0, cut).trim(), ...clampSegment(trimmed.slice(cut), limit)]
}

/**
 * Chapters come from `export/epub.ts`'s `buildChatChapters`, so titles stay in sync with the book.
 */
export interface NarrationChapter {
  title: string
  paragraphs: readonly string[]
}

export interface NarrationProgress {
  done: number
  total: number
}

export interface NarrationSkipped {
  text: string
  reason: string
}

export interface NarrationResult {
  /** MPEG frames of every clip, joined in reading order. */
  bytes: Uint8Array
  /** Clips that made it into the file. */
  clips: number
  /** Sentences the provider refused, with the reason, so the UI can say what is missing. */
  skipped: NarrationSkipped[]
}

export interface NarrationRequest {
  chapters: readonly NarrationChapter[]
  /** One sentence in, one audio clip out. Injected so tests need no network (cloudTts in prod). */
  synth: (text: string, signal?: AbortSignal) => Promise<Uint8Array>
  signal?: AbortSignal
  onProgress?: (progress: NarrationProgress) => void
}

/** A URL-safe ID3v2 tag at the very start of a clip; the size is sync-safe (7 bits per byte). */
function id3v2Length(bytes: Uint8Array): number {
  if (bytes.length < 10) return 0
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0 // "ID3"
  const size =
    ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f)
  const footer = (bytes[5] & 0x10) !== 0 ? 10 : 0
  return Math.min(10 + size + footer, bytes.length)
}

/** Drops a leading ID3v2 tag — joined clips must be pure MPEG frames or players trip on mid-file tags. */
export function stripId3v2(bytes: Uint8Array): Uint8Array {
  const length = id3v2Length(bytes)
  return length ? bytes.subarray(length) : bytes
}

/** Drops a trailing 128-byte ID3v1 tag (`TAG`), which would otherwise land mid-file after joining. */
export function stripId3v1(bytes: Uint8Array): Uint8Array {
  const start = bytes.length - 128
  if (start <= 0) return bytes
  const isTag = bytes[start] === 0x54 && bytes[start + 1] === 0x41 && bytes[start + 2] === 0x47
  return isTag ? bytes.subarray(0, start) : bytes
}

/**
 * Joins clips into one MPEG stream. MPEG frames are self-delimiting, so concatenation is a valid
 * stream; stripping the tags is what keeps it valid (a mid-file ID3v2 tag is not).
 */
export function concatAudioClips(clips: readonly Uint8Array[]): Uint8Array {
  const cleaned = clips.map((clip) => stripId3v1(stripId3v2(clip))).filter((clip) => clip.length > 0)
  const total = cleaned.reduce((sum, clip) => sum + clip.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const clip of cleaned) {
    out.set(clip, offset)
    offset += clip.length
  }
  return out
}

/**
 * Sentence-level segments in reading order. Titles are spoken too: a listener needs to hear where a
 * chapter starts, and a TTS provider has no notion of headings.
 */
export function narrationSegments(chapters: readonly NarrationChapter[]): string[] {
  const segments: string[] = []
  for (const chapter of chapters) {
    const title = chapter.title.trim()
    if (title) segments.push(...clampSegment(title))
    for (const paragraph of chapter.paragraphs) {
      for (const sentence of splitSentences(paragraph)) segments.push(...clampSegment(sentence))
    }
  }
  return segments
}

/**
 * Synthesizes the whole book. Sequential on purpose: parallel requests would reorder the audio and
 * hammer a single-account TTS upstream.
 */
export async function narrateChapters(request: NarrationRequest): Promise<NarrationResult> {
  const segments = narrationSegments(request.chapters)
  if (!segments.length) throw new Error('这本聊天还没有正文，没有可朗读的内容。')
  const clips: Uint8Array[] = []
  const skipped: NarrationSkipped[] = []
  for (let index = 0; index < segments.length; index += 1) {
    if (request.signal?.aborted) throw new DOMException('有声书导出已取消', 'AbortError')
    const text = segments[index]
    try {
      const clip = await request.synth(text, request.signal)
      if (!clip.length) throw new Error('返回了空音频')
      clips.push(clip)
    } catch (error) {
      if (request.signal?.aborted) throw new DOMException('有声书导出已取消', 'AbortError')
      skipped.push({ text, reason: error instanceof Error ? error.message : String(error) })
    }
    request.onProgress?.({ done: index + 1, total: segments.length })
  }
  if (!clips.length) {
    throw new Error(`全部 ${segments.length} 段都合成失败（首条原因：${skipped[0]?.reason ?? '未知'}）。`)
  }
  return { bytes: concatAudioClips(clips), clips: clips.length, skipped }
}

/** Same shape as `epub.ts`'s chat filename, so a chat's book and its narration sit side by side. */
export function audiobookFilename(chatTitle: string): string {
  const safe = (chatTitle || 'chat')
    .replace(/[^\p{L}\p{N}_\- ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${safe || 'chat'}.mp3`
}

export function downloadAudiobook(bytes: Uint8Array, filename: string): void {
  // Copy into a plain ArrayBuffer: a Uint8Array view is not accepted as a BlobPart once its
  // buffer may be shared (TS 5.7 typed-array generics).
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const url = URL.createObjectURL(new Blob([copy], { type: 'audio/mpeg' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
