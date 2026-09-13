import { describe, expect, it } from 'vitest'
import {
  buildStChatHeader,
  buildStChatMessages,
  chatJsonlFilename,
  parseChatJsonl,
  serializeChatJsonl,
  toCreateDate,
  toSendDate,
  type ExportableMessage,
} from './chatJsonl'

const AT = Date.UTC(2026, 4, 1, 9, 30, 0)

const user = (over: Partial<ExportableMessage> = {}): ExportableMessage => ({
  id: 'm1',
  role: 'user',
  name: 'Rin',
  text: 'You are early.',
  createdAt: AT,
  ...over,
})

const char = (over: Partial<ExportableMessage> = {}): ExportableMessage => ({
  id: 'm2',
  role: 'char',
  name: 'Sumire',
  text: 'The ovens are not even on yet.',
  createdAt: AT + 60_000,
  ...over,
})

describe('toSendDate', () => {
  it('writes an ISO string from a stored epoch', () => {
    expect(toSendDate(AT)).toBe('2026-05-01T09:30:00.000Z')
  })

  it('falls back to the epoch rather than throwing the export away', () => {
    expect(toSendDate(undefined)).toBe('1970-01-01T00:00:00.000Z')
    expect(toSendDate('not a number')).toBe('1970-01-01T00:00:00.000Z')
    expect(toSendDate(Number.NaN)).toBe('1970-01-01T00:00:00.000Z')
    expect(toSendDate(Number.POSITIVE_INFINITY)).toBe('1970-01-01T00:00:00.000Z')
  })
})

describe('toCreateDate', () => {
  it('accepts an epoch, a Date, or an ISO string as-is', () => {
    expect(toCreateDate(AT)).toBe('2026-05-01T09:30:00.000Z')
    expect(toCreateDate(new Date(AT))).toBe('2026-05-01T09:30:00.000Z')
    expect(toCreateDate('2026-05-01T09:30:00.000Z')).toBe('2026-05-01T09:30:00.000Z')
  })

  it('never emits an empty create_date', () => {
    expect(toCreateDate(undefined)).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(toCreateDate('   ')).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(toCreateDate(Number.NaN)).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('buildStChatHeader', () => {
  it('carries both real names and a copy of the metadata', () => {
    const metadata = { world: 'corner bakery' }
    const header = buildStChatHeader({
      userName: 'Rin',
      characterName: 'Sumire',
      createDate: AT,
      chatMetadata: metadata,
    })
    expect(header).toEqual({
      user_name: 'Rin',
      character_name: 'Sumire',
      create_date: '2026-05-01T09:30:00.000Z',
      chat_metadata: { world: 'corner bakery' },
    })
    expect(header.chat_metadata).not.toBe(metadata)
  })

  it('defaults the metadata to an empty object', () => {
    expect(buildStChatHeader({ userName: 'a', characterName: 'b' }).chat_metadata).toEqual({})
  })
})

describe('buildStChatMessages', () => {
  it('maps roles, names, timestamps and bodies onto ST field names', () => {
    const [first, second] = buildStChatMessages({
      messages: [user(), char()],
      userName: 'Rin',
      characterName: 'Sumire',
    })
    expect(first).toEqual({
      name: 'Rin',
      is_user: true,
      is_system: false,
      send_date: '2026-05-01T09:30:00.000Z',
      mes: 'You are early.',
    })
    expect(second.is_user).toBe(false)
    expect(second.name).toBe('Sumire')
  })

  it('falls back to the persona / character name when a message carries none', () => {
    const [first, second] = buildStChatMessages({
      messages: [user({ name: '   ' }), char({ name: '' })],
      userName: 'Rin',
      characterName: 'Sumire',
    })
    expect(first.name).toBe('Rin')
    expect(second.name).toBe('Sumire')
  })

  it('never writes an undefined body', () => {
    const [line] = buildStChatMessages({
      messages: [user({ text: undefined as unknown as string })],
      userName: 'Rin',
      characterName: 'Sumire',
    })
    expect(line.mes).toBe('')
  })

  it('writes swipes only when the turn really has alternates', () => {
    const [single] = buildStChatMessages({
      messages: [char({ swipes: ['one'] })],
      userName: 'Rin',
      characterName: 'Sumire',
    })
    expect(single.swipes).toBeUndefined()
    expect(single.swipe_id).toBeUndefined()

    const [many] = buildStChatMessages({
      messages: [char({ swipes: ['one', 'two', 'three'], activeSwipe: 2 })],
      userName: 'Rin',
      characterName: 'Sumire',
    })
    expect(many.swipes).toEqual(['one', 'two', 'three'])
    expect(many.swipe_id).toBe(2)
  })

  it('clamps an out-of-range active swipe to the first one', () => {
    const [line] = buildStChatMessages({
      messages: [char({ swipes: ['one', 'two'], activeSwipe: 9 })],
      userName: 'Rin',
      characterName: 'Sumire',
    })
    expect(line.swipe_id).toBe(0)
  })

  it('attaches inline images as ST media, adding the data prefix only when missing', () => {
    const [line] = buildStChatMessages({
      messages: [user({ images: ['AAAA', 'data:image/png;base64,BBBB', ''] })],
      userName: 'Rin',
      characterName: 'Sumire',
    })
    expect(line.extra).toEqual({
      media: [
        { type: 'image', url: 'data:image/png;base64,AAAA' },
        { type: 'image', url: 'data:image/png;base64,BBBB' },
      ],
    })
  })

  it('omits extra entirely when no image survives filtering', () => {
    const [line] = buildStChatMessages({
      messages: [user({ images: ['', undefined as unknown as string] })],
      userName: 'Rin',
      characterName: 'Sumire',
    })
    expect(line.extra).toBeUndefined()
  })

  it('is empty for a chat with no messages', () => {
    expect(buildStChatMessages({ messages: [], userName: 'a', characterName: 'b' })).toEqual([])
  })
})

describe('serializeChatJsonl', () => {
  it('writes the header line, one line per message, and no trailing newline', () => {
    const text = serializeChatJsonl({
      messages: [user(), char()],
      userName: 'Rin',
      characterName: 'Sumire',
      createDate: AT,
    })
    const lines = text.split('\n')
    expect(lines).toHaveLength(3)
    expect(text.endsWith('\n')).toBe(false)
    expect(JSON.parse(lines[0]).character_name).toBe('Sumire')
    expect(JSON.parse(lines[1]).is_user).toBe(true)
    expect(JSON.parse(lines[2]).is_user).toBe(false)
  })

  it('keeps a body containing newlines on a single line, as JSONL requires', () => {
    const text = serializeChatJsonl({
      messages: [char({ text: 'first\nsecond' })],
      userName: 'Rin',
      characterName: 'Sumire',
    })
    expect(text.split('\n')).toHaveLength(2)
    expect(JSON.parse(text.split('\n')[1]).mes).toBe('first\nsecond')
  })
})

describe('parseChatJsonl', () => {
  it('round-trips a serialized chat', () => {
    const messages = [user(), char({ text: 'line one\nline two', swipes: ['a', 'b'], activeSwipe: 1 })]
    const text = serializeChatJsonl({
      messages,
      userName: 'Rin',
      characterName: 'Sumire',
      createDate: AT,
      chatMetadata: { world: 'corner bakery' },
    })
    const parsed = parseChatJsonl(text)
    expect(parsed.header?.user_name).toBe('Rin')
    expect(parsed.header?.character_name).toBe('Sumire')
    expect(parsed.header?.create_date).toBe('2026-05-01T09:30:00.000Z')
    expect(parsed.header?.chat_metadata).toEqual({ world: 'corner bakery' })
    expect(parsed.messages).toHaveLength(2)
    expect(parsed.messages[0].mes).toBe('You are early.')
    expect(parsed.messages[0].is_user).toBe(true)
    expect(parsed.messages[0].send_date).toBe('2026-05-01T09:30:00.000Z')
    expect(parsed.messages[1].mes).toBe('line one\nline two')
    expect(parsed.messages[1].swipes).toEqual(['a', 'b'])
    expect(parsed.messages[1].swipe_id).toBe(1)
  })

  it('reads a file SillyTavern itself wrote, where the header names are placeholders', () => {
    const stFile = [
      '{"user_name":"unused","character_name":"unused","create_date":"2026-01-01T00:00:00.000Z","chat_metadata":{"integrity":"x"}}',
      '{"name":"Sumire","is_user":false,"is_system":false,"send_date":"2026-01-01T00:00:05.000Z","mes":"You are early."}',
    ].join('\n')
    const parsed = parseChatJsonl(stFile)
    expect(parsed.header?.create_date).toBe('2026-01-01T00:00:00.000Z')
    expect(parsed.messages[0].name).toBe('Sumire')
    expect(parsed.messages[0].mes).toBe('You are early.')
  })

  it('tolerates CRLF and blank lines', () => {
    const parsed = parseChatJsonl(
      '{"character_name":"Sumire","create_date":"2026-01-01T00:00:00.000Z"}\r\n\r\n{"name":"Sumire","mes":"hi"}\r\n',
    )
    expect(parsed.header?.character_name).toBe('Sumire')
    expect(parsed.messages).toHaveLength(1)
  })

  it('treats a message line as a message even without a header line', () => {
    const parsed = parseChatJsonl('{"name":"Sumire","is_user":false,"mes":"hello"}')
    expect(parsed.header).toBeNull()
    expect(parsed.messages).toHaveLength(1)
  })

  it('normalizes junk fields instead of throwing', () => {
    const parsed = parseChatJsonl('{"name":7,"is_user":"yes","mes":null,"send_date":123,"swipes":"nope"}')
    expect(parsed.messages[0]).toMatchObject({ name: '', is_user: true, mes: '', send_date: '123' })
    expect(parsed.messages[0].swipes).toBeUndefined()
  })

  it('throws on a line that is not JSON, rather than silently dropping messages', () => {
    expect(() => parseChatJsonl('{"character_name":"S"}\nnot json')).toThrow(/line 2 is not valid JSON/)
  })

  it('throws on a JSON line that is not an object', () => {
    expect(() => parseChatJsonl('["nope"]')).toThrow(/line 1 is not an object/)
  })
})

describe('chatJsonlFilename', () => {
  it('strips characters a file system would refuse and collapses the gap they leave', () => {
    expect(chatJsonlFilename('Rin / Sumire: "Saturday"?')).toBe('Rin Sumire Saturday.jsonl')
  })

  it('never returns an empty name', () => {
    expect(chatJsonlFilename('')).toBe('chat.jsonl')
    expect(chatJsonlFilename('///')).toBe('chat.jsonl')
  })
})
