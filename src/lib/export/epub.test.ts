import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MESSAGES_PER_CHAPTER,
  buildChatChapters,
  buildChatEpub,
  buildChatEpubEntries,
  chatEpubBlob,
  chatEpubFilename,
  crc32,
  stableBookId,
  writeZipStored,
} from './epub'
import type { Character } from '@/lib/characters/cardSpec'
import type { Chat, Persona, StoredMessage } from '@/lib/types'

// ---------------------------------------------------------------------------------------------
// Independent zip re-reader: parses the produced bytes back with the spec's own rules (EOCD ->
// central directory -> local headers), so a bug in the writer can't hide behind the writer.
// ---------------------------------------------------------------------------------------------

interface ReadBackEntry {
  name: string
  method: number
  flags: number
  crc: number
  size: number
  content: Uint8Array
  text: string
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text)
const utf8Decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes)

function readZip(bytes: Uint8Array): ReadBackEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('archive has no end-of-central-directory record')

  const count = view.getUint16(eocd + 10, true)
  const centralSize = view.getUint32(eocd + 12, true)
  const centralOffset = view.getUint32(eocd + 16, true)
  if (centralOffset + centralSize !== eocd) {
    throw new Error('central directory does not end where the EOCD record starts')
  }

  const entries: ReadBackEntry[] = []
  let cursor = centralOffset
  for (let index = 0; index < count; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error(`bad central header at ${cursor}`)
    const method = view.getUint16(cursor + 10, true)
    const crc = view.getUint32(cursor + 16, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = utf8Decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))

    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`bad local header for ${name}`)
    const localFlags = view.getUint16(localOffset + 6, true)
    const localMethod = view.getUint16(localOffset + 8, true)
    if (localMethod !== method) throw new Error(`method mismatch for ${name}`)
    if (view.getUint32(localOffset + 14, true) !== crc) throw new Error(`crc mismatch between headers for ${name}`)
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const localName = utf8Decode(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength))
    if (localName !== name) throw new Error(`name mismatch for ${name}`)
    if ((localFlags & 0x08) !== 0) throw new Error(`${name} uses a data descriptor, which EPUB forbids`)

    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const content = bytes.subarray(dataStart, dataStart + size)
    entries.push({ name, method, flags: localFlags, crc, size, content, text: utf8Decode(content) })

    cursor += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

const entryNamed = (entries: ReadBackEntry[], name: string): ReadBackEntry => {
  const found = entries.find((entry) => entry.name === name)
  if (!found) throw new Error(`missing entry ${name}; got ${entries.map((e) => e.name).join(', ')}`)
  return found
}

// ---------------------------------------------------------------------------------------------
// Tiny XHTML well-formedness checker (no DOM in this environment): balanced tags, declared
// entities only, no stray angle brackets.
// ---------------------------------------------------------------------------------------------

function assertWellFormedXml(xml: string): void {
  const stack: string[] = []
  const tokens = xml.match(/<[^>]*>|[^<]+/g) ?? []
  for (const token of tokens) {
    if (token.startsWith('<?') || token.startsWith('<!')) continue
    if (token.startsWith('</')) {
      const closing = token.slice(2, -1).trim()
      const open = stack.pop()
      if (open !== closing) throw new Error(`unbalanced tag: expected </${open ?? 'nothing'}>, saw </${closing}>`)
      continue
    }
    if (token.startsWith('<')) {
      const name = /^<([^/>\s]+)/.exec(token)?.[1]
      if (!name) throw new Error(`unparsable tag: ${token}`)
      if (!token.endsWith('/>')) stack.push(name)
      continue
    }
    const leftovers = token.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, '')
    if (leftovers.includes('&')) throw new Error(`undeclared entity in text: ${token.slice(0, 60)}`)
    if (leftovers.includes('>')) throw new Error(`stray angle bracket in text: ${token.slice(0, 60)}`)
  }
  if (stack.length > 0) throw new Error(`unclosed tags: ${stack.join(', ')}`)
}

/** Plain text of an XHTML fragment, line breaks preserved, entities decoded. */
function textOf(xml: string): string {
  return xml
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const PNG_PAYLOAD =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII='
const PNG_DATA_URL = `data:image/png;base64,${PNG_PAYLOAD}`

/** Multi-byte fixture: its byte length is deliberately larger than its character count. */
const CJK_TEXT = '你好，世界'
const CHAT_TITLE = '雨天的午后'
const CHARACTER_NAME = '爱丽丝'
const AUTHOR_NAME = '无名'

function message(overrides: Partial<StoredMessage> = {}): StoredMessage {
  return {
    id: 'm1',
    chatId: 'c1',
    role: 'char',
    name: '爱丽丝',
    text: '第一句台词',
    createdAt: Date.UTC(2026, 8, 13, 10, 0, 0),
    ...overrides,
  }
}

function chat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: 'chat-1',
    characterId: 'char-1',
    personaId: 'persona-1',
    title: CHAT_TITLE,
    createdAt: Date.UTC(2026, 8, 13, 9, 0, 0),
    updatedAt: Date.UTC(2026, 8, 13, 10, 0, 0),
    ...overrides,
  }
}

const character = { card: { name: CHARACTER_NAME } } as unknown as Character
const persona = { id: 'persona-1', name: '我', description: '', createdAt: 0 } as Persona

/** A transcript long enough to force several chapters, with one HTML-hostile line in the middle. */
function transcript(count: number): StoredMessage[] {
  return Array.from({ length: count }, (_, index) =>
    message({
      id: `m${index}`,
      role: index % 2 === 0 ? 'char' : 'user',
      text: index === 0 ? '她把伞递过来，笑着说 "拿去用"。' : `第 ${index + 1} 条消息`,
      createdAt: Date.UTC(2026, 8, 13, 10, 0, 0) + index * 60_000,
    }),
  )
}

describe('比特校验与压缩包写入', () => {
  it('校验值与标准测试向量一致', () => {
    expect(crc32(utf8('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('条目按写入顺序回读，且为原样存储', () => {
    const mimetype = utf8('application/epub+zip')
    const bytes = writeZipStored([
      { name: 'mimetype', data: mimetype },
      { name: 'OEBPS/a.txt', data: utf8(CJK_TEXT) },
    ])
    const entries = readZip(bytes)

    expect(entries.map((entry) => entry.name)).toEqual(['mimetype', 'OEBPS/a.txt'])
    expect(entries[0].method).toBe(0)
    expect(entries[0].flags & 0x08).toBe(0)
    expect(entries[0].text).toBe('application/epub+zip')
    expect(entries[0].crc).toBe(crc32(mimetype))
    // Byte length, not string length: the second entry's text is multi-byte UTF-8.
    expect(entries[1].size).toBe(utf8(CJK_TEXT).length)
    expect(entries[1].size).toBeGreaterThan(CJK_TEXT.length)
    expect(entries[1].text).toBe(CJK_TEXT)
  })

  it('二进制内容原样往返', () => {
    const payload = Uint8Array.from({ length: 512 }, (_, index) => index % 256)
    const bytes = writeZipStored([{ name: 'blob.bin', data: payload }])
    const entries = readZip(bytes)
    expect(Array.from(entries[0].content)).toEqual(Array.from(payload))
    expect(entries[0].crc).toBe(crc32(payload))
  })

  it('空档案、重复条目名、非 ASCII 条目名都拒绝', () => {
    expect(() => writeZipStored([])).toThrow()
    expect(() =>
      writeZipStored([
        { name: 'a', data: utf8('1') },
        { name: 'a', data: utf8('2') },
      ]),
    ).toThrow()
    expect(() => writeZipStored([{ name: '章节.xhtml', data: utf8('x') }])).toThrow()
    expect(() => writeZipStored([{ name: '', data: utf8('x') }])).toThrow()
  })
})

describe('分章', () => {
  it('按每章条数切分，章节号连续且消息不漏', () => {
    const messages = transcript(120)
    const chapters = buildChatChapters(messages)

    expect(DEFAULT_MESSAGES_PER_CHAPTER).toBe(50)
    expect(chapters.map((chapter) => chapter.messages.length)).toEqual([50, 50, 20])
    expect(chapters.map((chapter) => chapter.number)).toEqual([1, 2, 3])
    expect(chapters.map((chapter) => chapter.title)).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3'])
    expect(chapters.flatMap((chapter) => chapter.messages)).toEqual(messages)
  })

  it('空记录也给出一章，免得书没有可读项', () => {
    const chapters = buildChatChapters([])
    expect(chapters).toHaveLength(1)
    expect(chapters[0].messages).toEqual([])
  })

  it('每章条数可调，非法值回落到默认', () => {
    expect(buildChatChapters(transcript(7), { perChapter: 3 }).map((c) => c.messages.length)).toEqual([3, 3, 1])
    expect(buildChatChapters(transcript(7), { perChapter: 0 })).toHaveLength(1)
    expect(buildChatChapters(transcript(7), { perChapter: Number.NaN })).toHaveLength(1)
  })
})

const basicEpubOptions = {
  chat: chat(),
  character,
  persona,
  messages: transcript(60),
  exportedAt: Date.UTC(2026, 8, 13, 12, 0, 0),
}

describe('电子书组装与回读', () => {
  it('第一个条目是未压缩的压缩包类型，内容恰好为约定值', () => {
    const bytes = buildChatEpub(basicEpubOptions)
    const entries = readZip(bytes)

    expect(entries[0].name).toBe('mimetype')
    expect(entries[0].method).toBe(0)
    expect(entries[0].size).toBe(20)
    expect(entries[0].text).toBe('application/epub+zip')
    expect(entries[0].text.endsWith('\n')).toBe(false)
  })

  it('容器文件指向包文件，包文件带清单与书脊', () => {
    const entries = readZip(buildChatEpub({ ...basicEpubOptions, messages: transcript(120) }))
    const container = entryNamed(entries, 'META-INF/container.xml').text

    assertWellFormedXml(container)
    expect(container).toContain('full-path="OEBPS/content.opf"')
    expect(container).toContain('media-type="application/oebps-package+xml"')

    const opf = entryNamed(entries, 'OEBPS/content.opf').text
    assertWellFormedXml(opf)
    expect(opf).toContain('version="3.0"')
    expect(opf).toContain('<dc:identifier id="bookid">')
    expect(opf).toContain(`<dc:title>${CHAT_TITLE}</dc:title>`)
    expect(opf).toContain(`<dc:creator>${CHARACTER_NAME}</dc:creator>`)
    expect(opf).toContain('<dc:language>en</dc:language>')
    expect(opf).toContain('<meta property="dcterms:modified">2026-09-13T12:00:00Z</meta>')
    expect(opf).toContain('id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"')
    expect(opf).toContain('id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"')

    // One manifest item and one spine itemref per chapter, in order, TOC first.
    const manifestChapters = opf.match(/<item id="chapter-\d+"/g) ?? []
    const spineRefs = opf.match(/<itemref idref="[^"]+"\/>/g) ?? []
    expect(manifestChapters).toHaveLength(3)
    expect(spineRefs).toEqual(['<itemref idref="nav"/>', '<itemref idref="chapter-1"/>', '<itemref idref="chapter-2"/>', '<itemref idref="chapter-3"/>'])
  })

  it('每章都是合法文档，正文含预期文本且危险字符被转义', () => {
    const risky = '键盘上 5 < 6 且 7 > 4 & 结束'
    const messages: StoredMessage[] = [
      message({ id: 'risky', text: risky }),
      message({
        id: 'action',
        text: '*她轻轻一笑*\n第二行 "她说的话" BOOM',
        createdAt: Date.UTC(2026, 8, 13, 11, 0, 0),
      }),
    ]
    const entries = readZip(buildChatEpub({ ...basicEpubOptions, messages }))
    const chapter = entryNamed(entries, 'OEBPS/chapter-1.xhtml')

    assertWellFormedXml(chapter.text)
    expect(chapter.text.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true)
    expect(chapter.text).toContain('<link rel="stylesheet" type="text/css" href="style.css"/>')

    // Escaped on the way out, unchanged when a reader renders it.
    expect(chapter.text).toContain('&amp;')
    expect(chapter.text).toContain('&lt;')
    expect(chapter.text).toContain('&gt;')
    expect(textOf(chapter.text)).toContain(risky)
    // Action narration and SFX keep their own inline markup, line breaks survive.
    expect(chapter.text).toContain('<em>她轻轻一笑</em>')
    expect(chapter.text).toContain('<span class="sfx">BOOM</span>')
    expect(chapter.text).toContain('<br/>第二行')
    expect(textOf(chapter.text)).toContain('她说的话')
  })

  it('标签形状的输入在归一化阶段就被清掉，不会原样进书', () => {
    const messages = [message({ text: '<script>alert(1)</script>' })]
    const chapter = entryNamed(readZip(buildChatEpub({ ...basicEpubOptions, messages })), 'OEBPS/chapter-1.xhtml')
    assertWellFormedXml(chapter.text)
    expect(chapter.text).not.toContain('<script>')
    expect(chapter.text).not.toContain('&lt;script&gt;')
    expect(textOf(chapter.text)).toContain('alert(1)')
  })

  it('目录与各章一一对应，章号即文件名', () => {
    const entries = readZip(buildChatEpub({ ...basicEpubOptions, messages: transcript(120) }))
    const nav = entryNamed(entries, 'OEBPS/nav.xhtml').text
    const ncx = entryNamed(entries, 'OEBPS/toc.ncx').text

    assertWellFormedXml(nav)
    assertWellFormedXml(ncx)
    const hrefs = [...nav.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map((match) => [match[1], match[2]])
    expect(hrefs).toContainEqual(['chapter-1.xhtml', 'Chapter 1'])
    expect(hrefs).toContainEqual(['chapter-3.xhtml', 'Chapter 3'])
    expect((nav.match(/epub:type="toc"/g) ?? [])).toHaveLength(1)

    const titleTexts = [...ncx.matchAll(/<navLabel><text>([^<]+)<\/text><\/navLabel>/g)].map((m) => m[1])
    expect(titleTexts).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3'])
    expect((ncx.match(/<content src="chapter-\d+\.xhtml"\/>/g) ?? [])).toHaveLength(3)

    for (const chapter of [1, 2, 3]) {
      const xhtml = entryNamed(entries, `OEBPS/chapter-${chapter}.xhtml`).text
      assertWellFormedXml(xhtml)
      expect(xhtml).toContain(`<h1>Chapter ${chapter}</h1>`)
    }
    expect(textOf(entryNamed(entries, 'OEBPS/chapter-2.xhtml').text)).toContain('第 51 条消息')
  })

  it('样式表与二进制块都在档案里', () => {
    const entries = readZip(buildChatEpub(basicEpubOptions))
    const css = entryNamed(entries, 'OEBPS/style.css')
    expect(css.text).toContain('.msg')
    expect(css.text).toContain('.sfx')
  })

  it('XML 不接受的字符被剔除，正文其余部分保留', () => {
    const messages = [message({ text: `前缀\u0000\u0008中间\u001F收尾` })]
    const chapter = entryNamed(readZip(buildChatEpub({ ...basicEpubOptions, messages })), 'OEBPS/chapter-1.xhtml')
    assertWellFormedXml(chapter.text)
    const text = textOf(chapter.text)
    expect(text).toContain('前缀中间收尾')
    expect(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)).toBe(false)
  })

  it('附件图片另存条目并在正文里引用，相同图片只存一份', () => {
    const messages = [
      message({ id: 'i1', text: '看这张', images: [PNG_DATA_URL] }),
      message({ id: 'i2', text: '还有这张', images: [PNG_DATA_URL], createdAt: Date.UTC(2026, 8, 13, 11, 30, 0) }),
    ]
    const entries = readZip(buildChatEpub({ ...basicEpubOptions, messages }))
    const names = entries.map((entry) => entry.name)
    expect(names.filter((name) => name.startsWith('OEBPS/images/'))).toEqual(['OEBPS/images/img-1.png'])

    const image = entryNamed(entries, 'OEBPS/images/img-1.png')
    expect(entryNamed(entries, 'OEBPS/content.opf').text).toContain(
      '<item id="img-1" href="images/img-1.png" media-type="image/png"/>',
    )
    // Real PNG signature, decoded from the data URL rather than copied through as text.
    expect(Array.from(image.content.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    const chapter = entryNamed(entries, 'OEBPS/chapter-1.xhtml').text
    assertWellFormedXml(chapter)
    expect((chapter.match(/src="images\/img-1\.png"/g) ?? [])).toHaveLength(2)
  })

  it('链接形式的附图与坏数据的附图被跳过而不是报错', () => {
    const messages = [
      message({ id: 'remote', images: ['https://example.test/a.png'] }),
      message({ id: 'broken', images: ['data:image/png;base64,@@not-base64@@'], text: '正文还在' }),
    ]
    const entries = readZip(buildChatEpub({ ...basicEpubOptions, messages }))
    expect(entries.map((entry) => entry.name).some((name) => name.includes('images/'))).toBe(false)
    expect(textOf(entryNamed(entries, 'OEBPS/chapter-1.xhtml').text)).toContain('正文还在')
  })

  it('同样的输入产出同样的字节，书号也稳定', () => {
    const first = buildChatEpub(basicEpubOptions)
    const second = buildChatEpub(basicEpubOptions)
    expect(Array.from(first)).toEqual(Array.from(second))
    expect(stableBookId('chat-1')).toBe(stableBookId('chat-1'))
    expect(stableBookId('chat-1')).not.toBe(stableBookId('chat-2'))
    expect(stableBookId('chat-1')).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('条目清单与打包结果一致，且压缩包类型永远排第一', () => {
    const listed = buildChatEpubEntries({ ...basicEpubOptions, messages: transcript(51) })
    const entries = readZip(buildChatEpub({ ...basicEpubOptions, messages: transcript(51) }))
    expect(entries.map((entry) => entry.name)).toEqual(listed.map((entry) => entry.name))
    expect(listed[0].name).toBe('mimetype')
    expect(entries.map((entry) => entry.name)).toContain('OEBPS/chapter-2.xhtml')
  })

  it('语言与作者可覆盖，配角姓名按清单显示', () => {
    const group: StoredMessage[] = [
      message({ id: 'g1', text: '主角色说话' }),
      message({ id: 'g2', text: '配角说话', speakerId: 'char-2', createdAt: Date.UTC(2026, 8, 13, 10, 5, 0) }),
    ]
    const entries = readZip(
      buildChatEpub({
        ...basicEpubOptions,
        chat: chat({ participants: ['char-2'] }),
        messages: group,
        author: AUTHOR_NAME,
        language: 'zh-CN',
        participantNames: { 'char-2': '小葵' },
      }),
    )
    const opf = entryNamed(entries, 'OEBPS/content.opf').text
    expect(opf).toContain(`<dc:creator>${AUTHOR_NAME}</dc:creator>`)
    expect(opf).toContain('<dc:language>zh-CN</dc:language>')
    const text = textOf(entryNamed(entries, 'OEBPS/chapter-1.xhtml').text)
    expect(text).toContain('小葵')
    expect(text).toContain('主角色说话')
  })

  it('空记录也能组装出一本可读的书', () => {
    const entries = readZip(buildChatEpub({ ...basicEpubOptions, messages: [] }))
    expect(entries.map((entry) => entry.name)).toContain('OEBPS/chapter-1.xhtml')
    const chapter = entryNamed(entries, 'OEBPS/chapter-1.xhtml').text
    assertWellFormedXml(chapter)
    expect(textOf(chapter)).toContain('No messages yet')
  })
})

describe('文件名与二进制块', () => {
  it('文件名保留中文，去掉符号，兜底用回退名', () => {
    expect(chatEpubFilename('雨天的午后')).toBe('雨天的午后.epub')
    expect(chatEpubFilename('雨 天 / 午后!!')).toBe('雨 天 午后.epub')
    expect(chatEpubFilename('')).toBe('chat.epub')
    expect(chatEpubFilename('...')).toBe('chat.epub')
  })

  it('二进制块的媒体类型与长度都对得上', () => {
    const bytes = buildChatEpub(basicEpubOptions)
    const blob = chatEpubBlob(bytes)
    expect(blob.type).toBe('application/epub+zip')
    expect(blob.size).toBe(bytes.length)
  })
})
