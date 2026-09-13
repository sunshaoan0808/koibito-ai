/**
 * Chat transcript -> EPUB 3 export.
 *
 * Why a hand-rolled zip instead of a library: this repo has no zip dependency and the export
 * shape we need is tiny (a handful of small text files plus optional images), so the whole
 * container is written with STORED (uncompressed) entries — no deflate, no dependency, and a
 * blob that `unzip -t`, Python's `zipfile` and EPUB readers all accept.
 *
 * Container layout (EPUB 3.0 is picky about the first entry):
 *   mimetype                  -> STORED, first entry, no extra field, exactly `application/epub+zip`
 *   META-INF/container.xml    -> points at OEBPS/content.opf
 *   OEBPS/content.opf         -> EPUB 3 package (manifest + spine)
 *   OEBPS/nav.xhtml           -> EPUB 3 navigation document (the table of contents)
 *   OEBPS/toc.ncx             -> EPUB 2 fallback so older readers/converters still see a TOC
 *   OEBPS/style.css           -> shared stylesheet
 *   OEBPS/chapter-N.xhtml     -> one chapter per `DEFAULT_MESSAGES_PER_CHAPTER` messages
 *   OEBPS/images/img-N.ext    -> message attachments inlined from their data URLs
 *
 * Everything except `chatEpubBlob`/`downloadChatEpub` is a pure function of its arguments: no
 * DOM, no network, no storage, no clock reads unless `exportedAt` is left unset.
 */

import type { Character } from '@/lib/characters/cardSpec'
import type { Chat, Persona, RegexScript, StoredMessage } from '@/lib/types'
import { splitMessageSegments, type SfxConfig } from '@/lib/text/messageSegments'
import { applyRegexScripts } from '@/lib/text/regexScripts'

/** Messages per chapter when the caller doesn't ask for something else. */
export const DEFAULT_MESSAGES_PER_CHAPTER = 50

const EPUB_MIMETYPE = 'application/epub+zip'
const OEBPS = 'OEBPS'
const PACKAGE_PATH = `${OEBPS}/content.opf`

// ---------------------------------------------------------------------------------------------
// Minimal STORED-only zip writer
// ---------------------------------------------------------------------------------------------

export interface ZipEntry {
  /** Forward-slash path. Restricted to printable ASCII — that keeps the UTF-8 name flag (and
   *  therefore the "no extra field" rule for `mimetype`) out of the picture entirely. */
  name: string
  data: Uint8Array
}

/** Fixed DOS timestamp (1980-01-01 00:00) so byte output is deterministic across runs. */
const DOS_TIME = 0
const DOS_DATE = 0x0021

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** Standard CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320) — the value a zip local/central
 *  header stores. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export function utf8Encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

class ByteSink {
  private readonly bytes: number[] = []

  get length(): number {
    return this.bytes.length
  }

  u8(value: number): void {
    this.bytes.push(value & 0xff)
  }

  /** Little-endian, per the zip spec. */
  u16(value: number): void {
    this.u8(value)
    this.u8(value >>> 8)
  }

  u32(value: number): void {
    this.u8(value)
    this.u8(value >>> 8)
    this.u8(value >>> 16)
    this.u8(value >>> 24)
  }

  raw(data: Uint8Array): void {
    for (let i = 0; i < data.length; i++) this.bytes.push(data[i])
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.bytes)
  }
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const CENTRAL_HEADER_SIGNATURE = 0x02014b50
const EOCD_SIGNATURE = 0x06054b50
const VERSION_NEEDED = 20

/**
 * Writes entries as a zip archive with every entry STORED (method 0). Entry order is preserved —
 * EPUB requires `mimetype` first and uncompressed, and callers get that for free by listing it
 * first.
 */
export function writeZipStored(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length === 0) throw new Error('zip archive needs at least one entry')
  const seen = new Set<string>()
  const central: { nameBytes: Uint8Array; crc: number; size: number; offset: number }[] = []
  const sink = new ByteSink()

  for (const entry of entries) {
    if (!entry.name || entry.name.includes('\\') || !/^[\x20-\x7e]+$/.test(entry.name)) {
      throw new Error(`zip entry name must be printable ASCII: ${JSON.stringify(entry.name)}`)
    }
    if (seen.has(entry.name)) throw new Error(`duplicate zip entry: ${entry.name}`)
    seen.add(entry.name)

    const nameBytes = utf8Encode(entry.name)
    const crc = crc32(entry.data)
    const offset = sink.length

    sink.u32(LOCAL_HEADER_SIGNATURE)
    sink.u16(VERSION_NEEDED)
    sink.u16(0) // general purpose flags: no encryption, no data descriptor, ASCII names
    sink.u16(0) // compression method: STORED
    sink.u16(DOS_TIME)
    sink.u16(DOS_DATE)
    sink.u32(crc)
    sink.u32(entry.data.length)
    sink.u32(entry.data.length)
    sink.u16(nameBytes.length)
    sink.u16(0) // extra field length — EPUB forbids one on `mimetype`
    sink.raw(nameBytes)
    sink.raw(entry.data)

    central.push({ nameBytes, crc, size: entry.data.length, offset })
  }

  const centralOffset = sink.length
  for (const item of central) {
    sink.u32(CENTRAL_HEADER_SIGNATURE)
    sink.u16(VERSION_NEEDED) // version made by
    sink.u16(VERSION_NEEDED) // version needed to extract
    sink.u16(0) // flags
    sink.u16(0) // method
    sink.u16(DOS_TIME)
    sink.u16(DOS_DATE)
    sink.u32(item.crc)
    sink.u32(item.size)
    sink.u32(item.size)
    sink.u16(item.nameBytes.length)
    sink.u16(0) // extra
    sink.u16(0) // comment
    sink.u16(0) // disk number start
    sink.u16(0) // internal attributes
    sink.u32(0) // external attributes
    sink.u32(item.offset)
    sink.raw(item.nameBytes)
  }
  const centralSize = sink.length - centralOffset

  sink.u32(EOCD_SIGNATURE)
  sink.u16(0) // this disk
  sink.u16(0) // disk with the central directory
  sink.u16(central.length)
  sink.u16(central.length)
  sink.u32(centralSize)
  sink.u32(centralOffset)
  sink.u16(0) // comment length

  return sink.toBytes()
}

// ---------------------------------------------------------------------------------------------
// XHTML / XML helpers
// ---------------------------------------------------------------------------------------------

/**
 * Drops code points XML 1.0 can't carry (C0 controls other than tab/LF/CR, unpaired surrogates,
 * U+FFFE/U+FFFF) so a message can never make the whole book unparseable.
 */
export function sanitizeXmlText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1')
    .replace(/[\uFFFE\uFFFF]/g, '')
}

/** Escapes for both text nodes and double-quoted attribute values. */
export function escapeXml(text: string): string {
  return sanitizeXmlText(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** `2026-09-13` — locale-independent so exports (and tests) don't drift with the environment. */
function isoDay(timestamp: number): string {
  const date = new Date(timestamp)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : ''
}

/** `dcterms:modified` shape required by EPUB 3: seconds precision, `Z` suffix. */
function modifiedStamp(timestamp: number): string {
  const date = new Date(timestamp)
  const iso = Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString()
  return iso.replace(/\.\d+Z$/, 'Z')
}

/**
 * Deterministic RFC-4122-looking identifier derived from the chat id, so re-exporting the same
 * chat keeps one identity in a reader's library instead of piling up duplicates.
 */
export function stableBookId(seed: string): string {
  const parts: string[] = []
  for (let round = 0; round < 4; round++) {
    const salted = `${seed}#${round}`
    let hash = 0x811c9dc5 ^ round
    for (let i = 0; i < salted.length; i++) {
      hash ^= salted.charCodeAt(i)
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    parts.push(hash.toString(16).padStart(8, '0'))
  }
  const hex = parts.join('')
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

// ---------------------------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------------------------

export interface ChatEpubChapter {
  /** 1-based; also drives the file name (`chapter-<number>.xhtml`). */
  number: number
  title: string
  messages: StoredMessage[]
}

/**
 * Splits a transcript into fixed-size chapters. A count-based split (rather than day-based) is
 * deliberate: it always yields a usable TOC for long chats and never depends on the reader's
 * timezone. An empty transcript still yields one chapter, because an EPUB needs at least one
 * spine item to be valid.
 */
export function buildChatChapters(
  messages: readonly StoredMessage[],
  opts: { perChapter?: number } = {},
): ChatEpubChapter[] {
  const requested = opts.perChapter ?? DEFAULT_MESSAGES_PER_CHAPTER
  const perChapter = Number.isFinite(requested) && requested >= 1 ? Math.floor(requested) : DEFAULT_MESSAGES_PER_CHAPTER
  if (messages.length === 0) return [{ number: 1, title: 'Chapter 1', messages: [] }]

  const chapters: ChatEpubChapter[] = []
  for (let start = 0; start < messages.length; start += perChapter) {
    const number = chapters.length + 1
    chapters.push({
      number,
      title: `Chapter ${number}`,
      messages: messages.slice(start, start + perChapter),
    })
  }
  return chapters
}

// ---------------------------------------------------------------------------------------------
// Message rendering
// ---------------------------------------------------------------------------------------------

/** Punctuation-insensitive XHTML for one message body, from the same segment parser the live UI
 *  and the HTML transcript use (`splitMessageSegments` + display regex scripts). */
function messageBodyXhtml(text: string, regexScripts?: RegexScript[], sfx?: SfxConfig): string {
  return splitMessageSegments(applyRegexScripts(text, regexScripts, 'display'), sfx)
    .map((segment) => {
      const inner = escapeXml(segment.content).replace(/\r\n|\r|\n/g, '<br/>')
      if (segment.type === 'action') return `<em>${inner}</em>`
      if (segment.type === 'quote') return `<span class="quote">${inner}</span>`
      if (segment.type === 'sfx') return `<span class="sfx">${inner}</span>`
      return inner
    })
    .join('')
}

interface ImageAsset {
  /** Path relative to `OEBPS/`, e.g. `images/img-1.png`. */
  name: string
  mediaType: string
  data: Uint8Array
}

const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml));base64,([A-Za-z0-9+/=\s]+)$/

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

function base64ToBytes(payload: string): Uint8Array | undefined {
  try {
    const binary = atob(payload.replace(/\s+/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return undefined
  }
}

/**
 * Pulls `StoredMessage.images` (already full data URLs) into `OEBPS/images/*`, deduplicating
 * identical payloads. Remote URLs and anything undecodable are skipped rather than failing the
 * export — an unreadable image shouldn't cost the reader the book.
 */
function collectImages(messages: readonly StoredMessage[]): { assets: ImageAsset[]; byPayload: Map<string, string[]> } {
  const assets: ImageAsset[] = []
  const byPayload = new Map<string, string[]>()
  const nameByPayload = new Map<string, string>()

  for (const message of messages) {
    for (const src of message.images ?? []) {
      const match = IMAGE_DATA_URL.exec(src)
      if (!match) continue
      const mediaType = match[1]
      const payload = match[2].replace(/\s+/g, '')
      const extension = IMAGE_EXTENSIONS[mediaType]
      if (!extension) continue

      let name = nameByPayload.get(payload)
      if (!name) {
        const data = base64ToBytes(payload)
        if (!data) continue
        name = `images/img-${assets.length + 1}.${extension}`
        nameByPayload.set(payload, name)
        assets.push({ name, mediaType, data })
      }
      const bucket = byPayload.get(src) ?? []
      if (!bucket.includes(name)) bucket.push(name)
      byPayload.set(src, bucket)
    }
  }

  return { assets, byPayload }
}

// ---------------------------------------------------------------------------------------------
// EPUB assembly
// ---------------------------------------------------------------------------------------------

export interface ChatEpubOptions {
  chat: Chat
  character?: Character
  persona?: Persona
  messages: readonly StoredMessage[]
  regexScripts?: RegexScript[]
  /** Same SFX policy as `buildChatTranscriptHtml`'s. */
  sfx?: SfxConfig
  /** Messages per chapter; defaults to `DEFAULT_MESSAGES_PER_CHAPTER`. */
  messagesPerChapter?: number
  /** Book title author, defaults to the primary character's name. */
  author?: string
  /** `dc:language`; defaults to `en` (the export chrome is English, like the HTML transcript's). */
  language?: string
  /** Display names for non-primary speakers, keyed by character id — group chats otherwise fall
   *  back to the primary character's name. */
  participantNames?: Record<string, string>
  /** Injectable export timestamp so output is deterministic in tests; defaults to `Date.now()`. */
  exportedAt?: number
}

interface RenderContext {
  characterName: string
  personaName: string
  participantNames?: Record<string, string>
  regexScripts?: RegexScript[]
  sfx?: SfxConfig
  imagesByPayload: Map<string, string[]>
}

function speakerName(message: StoredMessage, ctx: RenderContext): string {
  if (message.role === 'user') return ctx.personaName
  if (message.speakerId) return ctx.participantNames?.[message.speakerId] ?? ctx.characterName
  return ctx.characterName
}

const STYLE_CSS = `body { font-family: serif; line-height: 1.6; margin: 0 1em; }
h1 { font-size: 1.35em; margin: 1.2em 0 0.3em; }
.range { color: #77777f; font-size: 0.85em; margin: 0 0 1.4em; }
.msg { margin: 0 0 1.1em; }
.msg .who { margin: 0 0 0.15em; font-size: 0.8em; color: #77777f; }
.msg .who .name { font-weight: 600; color: #4b4b52; }
.msg .who .time { margin-left: 0.5em; }
.msg .say { margin: 0; }
.msg em { font-style: italic; color: #55555c; }
.msg .quote { font-weight: 600; }
.msg .sfx { font-weight: 700; letter-spacing: 0.06em; }
.msg .attachment { max-width: 100%; margin-top: 0.4em; }
nav ol { list-style: none; padding-left: 0; }
nav li { margin: 0.3em 0; }
`

function chapterXhtml(chapter: ChatEpubChapter, ctx: RenderContext): string {
  const first = chapter.messages[0]
  const last = chapter.messages[chapter.messages.length - 1]
  const range = first && last ? `${chapter.messages.length} messages · ${isoDay(first.createdAt)} – ${isoDay(last.createdAt)}` : 'No messages yet'

  const body = chapter.messages
    .map((message) => {
      const attachments = (message.images ?? [])
        .flatMap((src) => ctx.imagesByPayload.get(src) ?? [])
        .map((name) => `\n      <img class="attachment" src="${escapeXml(name)}" alt=""/>`)
        .join('')
      return `    <article class="msg ${message.role === 'user' ? 'user' : 'char'}">
      <p class="who"><span class="name">${escapeXml(speakerName(message, ctx))}</span><span class="time">${escapeXml(isoDay(message.createdAt))}</span></p>
      <p class="say">${messageBodyXhtml(message.text, ctx.regexScripts, ctx.sfx)}</p>${attachments}
    </article>`
    })
    .join('\n')

  return xhtmlDocument({
    title: chapter.title,
    body: `  <section epub:type="chapter">
    <h1>${escapeXml(chapter.title)}</h1>
    <p class="range">${escapeXml(range)}</p>
${body}
  </section>`,
  })
}

function xhtmlDocument(opts: { title: string; body: string }): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(opts.title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${opts.body}
</body>
</html>
`
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${PACKAGE_PATH}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`
}

function navXhtml(chapters: readonly ChatEpubChapter[], title: string): string {
  const items = chapters
    .map((chapter) => `      <li><a href="chapter-${chapter.number}.xhtml">${escapeXml(chapter.title)}</a></li>`)
    .join('\n')
  return xhtmlDocument({
    title: 'Contents',
    body: `  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
${items}
    </ol>
  </nav>
  <nav epub:type="landmarks" hidden="hidden">
    <ol>
      <li><a epub:type="bodymatter" href="chapter-1.xhtml">Start</a></li>
    </ol>
  </nav>
  <p>${escapeXml(title)}</p>`,
  })
}

function tocNcx(chapters: readonly ChatEpubChapter[], title: string, bookId: string): string {
  const points = chapters
    .map(
      (chapter) => `    <navPoint id="navPoint-${chapter.number}" playOrder="${chapter.number}">
      <navLabel><text>${escapeXml(chapter.title)}</text></navLabel>
      <content src="chapter-${chapter.number}.xhtml"/>
    </navPoint>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="en">
  <head>
    <meta name="dtb:uid" content="${escapeXml(bookId)}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${points}
  </navMap>
</ncx>
`
}

function contentOpf(opts: {
  title: string
  author: string
  language: string
  bookId: string
  modified: string
  chapters: readonly ChatEpubChapter[]
  imageAssets: readonly ImageAsset[]
}): string {
  const chapterItems = opts.chapters
    .map((chapter) => `    <item id="chapter-${chapter.number}" href="chapter-${chapter.number}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('\n')
  const imageItems = opts.imageAssets
    .map((asset, index) => `    <item id="img-${index + 1}" href="${asset.name}" media-type="${asset.mediaType}"/>`)
    .join('\n')
  const spine = opts.chapters
    .map((chapter) => `    <itemref idref="chapter-${chapter.number}"/>`)
    .join('\n')

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escapeXml(opts.language)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(opts.bookId)}</dc:identifier>
    <dc:title>${escapeXml(opts.title)}</dc:title>
    <dc:language>${escapeXml(opts.language)}</dc:language>
    <dc:creator>${escapeXml(opts.author)}</dc:creator>
    <meta property="dcterms:modified">${opts.modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
${chapterItems}
${imageItems}
  </manifest>
  <spine toc="ncx">
    <itemref idref="nav"/>
${spine}
  </spine>
</package>
`
}

/** Full entry list of the EPUB, in zip order (`mimetype` first). Pure — handy for inspection. */
export function buildChatEpubEntries(opts: ChatEpubOptions): ZipEntry[] {
  const { chat, character, persona, messages } = opts
  const characterName = character?.card.name ?? 'Character'
  const personaName = persona?.name ?? 'You'
  const title = chat.title || 'Chat'
  const exportedAt = opts.exportedAt ?? Date.now()
  const bookId = stableBookId(chat.id || title)

  const chapters = buildChatChapters(messages, { perChapter: opts.messagesPerChapter })
  const { assets, byPayload } = collectImages(messages)
  const ctx: RenderContext = {
    characterName,
    personaName,
    participantNames: opts.participantNames,
    regexScripts: opts.regexScripts,
    sfx: opts.sfx,
    imagesByPayload: byPayload,
  }

  const entries: ZipEntry[] = [
    { name: 'mimetype', data: utf8Encode(EPUB_MIMETYPE) },
    { name: 'META-INF/container.xml', data: utf8Encode(containerXml()) },
    {
      name: PACKAGE_PATH,
      data: utf8Encode(
        contentOpf({
          title,
          author: opts.author ?? characterName,
          language: opts.language ?? 'en',
          bookId,
          modified: modifiedStamp(exportedAt),
          chapters,
          imageAssets: assets,
        }),
      ),
    },
    { name: `${OEBPS}/nav.xhtml`, data: utf8Encode(navXhtml(chapters, title)) },
    { name: `${OEBPS}/toc.ncx`, data: utf8Encode(tocNcx(chapters, title, bookId)) },
    { name: `${OEBPS}/style.css`, data: utf8Encode(STYLE_CSS) },
  ]

  for (const chapter of chapters) {
    entries.push({ name: `${OEBPS}/chapter-${chapter.number}.xhtml`, data: utf8Encode(chapterXhtml(chapter, ctx)) })
  }
  for (const asset of assets) {
    entries.push({ name: `${OEBPS}/${asset.name}`, data: asset.data })
  }

  return entries
}

/** Assembles the whole EPUB as bytes. Feed to `chatEpubBlob` / `downloadChatEpub`, or hand
 *  straight to a filesystem writer in Node. */
export function buildChatEpub(opts: ChatEpubOptions): Uint8Array {
  return writeZipStored(buildChatEpubEntries(opts))
}

// ---------------------------------------------------------------------------------------------
// Browser-side delivery (the only non-pure helpers here)
// ---------------------------------------------------------------------------------------------

export function chatEpubBlob(epub: Uint8Array): Blob {
  // `.slice()` copies into a plain ArrayBuffer-backed view, which is what `BlobPart` wants under
  // the newer `Uint8Array<ArrayBufferLike>` typings.
  return new Blob([epub.slice()], { type: EPUB_MIMETYPE })
}

/** Unicode-aware sanitizer: `我的 聊天!!`.epub` -> `我的 聊天.epub`, unlike the ASCII-only one the
 *  HTML transcript uses (which would flatten a CJK title to `chat`). */
export function chatEpubFilename(chatTitle: string): string {
  const safe = (chatTitle || 'chat')
    .replace(/[^\p{L}\p{N}_\- ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return `${safe || 'chat'}.epub`
}

export function downloadChatEpub(epub: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(chatEpubBlob(epub))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
