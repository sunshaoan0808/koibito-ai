import { describe, expect, it } from 'vitest'
import {
  byafAlternateGreetings,
  byafCardFields,
  byafFlatCard,
  byafLoreItemsToBook,
  exampleDialogueText,
  firstMessageText,
  formatByafExampleMessages,
  imageMimeFromPath,
  isByafFlatCard,
  isByafManifest,
  isZipArchive,
  parseByafArchive,
  readZipEntries,
  replaceByafMacros,
} from './byaf'

/** Builds a stored-only zip: local headers, central directory, EOCD. The reader walks the central
 *  directory and never checks CRCs, so zeroed CRC fields are fine — no dependency needed. */
function zipOf(files: Record<string, string | Uint8Array>): Uint8Array {
  const enc = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const [name, value] of Object.entries(files)) {
    const nameBytes = enc.encode(name)
    const data = typeof value === 'string' ? enc.encode(value) : value
    const local = new Uint8Array(30 + nameBytes.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    local.set(nameBytes, 30)
    local.set(data, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const parts = [...locals, ...centrals, eocd]
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of parts) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}

const BYAF_MANIFEST = JSON.stringify({
  schemaVersion: 1,
  characters: ['characters/sumire.json'],
  scenarios: ['characters/sumire/saturday.json'],
  author: { name: 'Nightjar', backyardURL: 'https://backyard.example/@nightjar' },
})

const BYAF_CHARACTER = JSON.stringify({
  name: 'Sumire',
  displayName: 'Sumire the Baker',
  persona: '{character} runs the bakery on the corner. {user} keeps finding excuses to stop by.',
  isNSFW: true,
  images: [{ path: 'portrait.png' }],
  loreItems: [{ key: 'bakery, the corner', value: 'Opens at dawn, closes when the bread runs out.' }],
})

const BYAF_SCENARIO = JSON.stringify({
  narrative: 'Saturday morning, an hour before opening.',
  firstMessages: [{ text: '#{character}: You are early again. The ovens are not even on.' }],
  exampleMessages: [{ text: '#{character}: You again?\n#{user}: I was passing by.' }],
  formattingInstructions: 'Keep replies short and grounded.',
})

const BYAF_ARCHIVE = () =>
  zipOf({
    'manifest.json': BYAF_MANIFEST,
    'characters/sumire.json': BYAF_CHARACTER,
    'characters/sumire/saturday.json': BYAF_SCENARIO,
    'characters/portrait.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  })

describe('isZipArchive', () => {
  it('recognises a zip by its local file header, not by any file name', () => {
    expect(isZipArchive(zipOf({ 'a.txt': 'hi' }))).toBe(true)
    expect(isZipArchive(new Uint8Array([0x7b, 0x22]))).toBe(false)
    expect(isZipArchive(new Uint8Array([]))).toBe(false)
  })
})

describe('readZipEntries', () => {
  it('reads stored entries by path, including nested ones', async () => {
    const entries = await readZipEntries(zipOf({ 'manifest.json': '{"a":1}', 'a/b/c.txt': 'deep' }))
    expect([...entries.keys()].sort()).toEqual(['a/b/c.txt', 'manifest.json'])
    expect(new TextDecoder().decode(entries.get('a/b/c.txt'))).toBe('deep')
  })

  it('returns binary entries byte for byte', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])
    const entries = await readZipEntries(zipOf({ 'portrait.png': png }))
    expect([...(entries.get('portrait.png') ?? [])]).toEqual([...png])
  })

  it('throws on bytes that are not a zip at all', async () => {
    await expect(readZipEntries(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a readable ZIP/i)
  })
})

describe('replaceByafMacros', () => {
  it('converts BYAF macros to the app form', () => {
    expect(replaceByafMacros('#{character}: hello #{user}: hi')).toBe('{{char}}: hello {{user}}: hi')
    expect(replaceByafMacros('{character} and {user}')).toBe('{{char}} and {{user}}')
  })

  it('leaves macros that are already in the app form alone', () => {
    expect(replaceByafMacros('{{char}} said it')).toBe('{{char}} said it')
    expect(replaceByafMacros('{{user}} nodded')).toBe('{{user}} nodded')
  })

  it('is case-insensitive and never returns undefined', () => {
    expect(replaceByafMacros('#{USER}: hey')).toBe('{{user}}: hey')
    expect(replaceByafMacros(undefined)).toBe('')
    expect(replaceByafMacros(42)).toBe('42')
  })
})

describe('firstMessageText', () => {
  it('reads a plain string, an array, or an object with text', () => {
    expect(firstMessageText('morning')).toBe('morning')
    expect(firstMessageText([{ text: 'morning' }])).toBe('morning')
    expect(firstMessageText({ text: 'morning' })).toBe('morning')
    expect(firstMessageText({ firstMessages: [{ mes: 'nested' }] })).toBe('nested')
  })

  it('skips empty entries and gives up quietly on nothing usable', () => {
    expect(firstMessageText([{ text: '' }, { text: 'second wins' }])).toBe('second wins')
    expect(firstMessageText(undefined)).toBe('')
    expect(firstMessageText({})).toBe('')
  })
})

describe('formatByafExampleMessages', () => {
  it('writes one START block per example, macros converted', () => {
    const formatted = formatByafExampleMessages([
      { text: '#{character}: You again?\n#{user}: Passing by.' },
      'plain string example',
    ])
    expect(formatted).toBe(
      '<START>\n{{char}}: You again?\n{{user}}: Passing by.\n<START>\nplain string example',
    )
  })

  it('is empty without an array', () => {
    expect(formatByafExampleMessages(undefined)).toBe('')
    expect(formatByafExampleMessages('not an array')).toBe('')
  })
})

describe('exampleDialogueText', () => {
  it('keeps plain string arrays as paragraphs', () => {
    expect(exampleDialogueText(['one', '', 'two'])).toBe('one\n\ntwo')
  })

  it('routes object entries through the START formatter', () => {
    expect(exampleDialogueText([{ text: 'a' }])).toBe('<START>\na')
  })
})

describe('byafLoreItemsToBook', () => {
  it('splits comma-separated keys and keeps the content', () => {
    const book = byafLoreItemsToBook([{ key: 'bakery, the corner', value: 'Opens at dawn.' }])
    expect(book?.entries[0].keys).toEqual(['bakery', 'the corner'])
    expect(book?.entries[0].content).toBe('Opens at dawn.')
    expect(book?.entries[0].enabled).toBe(true)
  })

  it('is undefined for nothing usable, so no empty book is stored', () => {
    expect(byafLoreItemsToBook([])).toBeUndefined()
    expect(byafLoreItemsToBook(undefined)).toBeUndefined()
    expect(byafLoreItemsToBook(['nope'])).toBeUndefined()
  })
})

describe('isByafFlatCard', () => {
  it('accepts a card carrying a Backyard-only field name', () => {
    expect(isByafFlatCard({ name: 'Sumire', persona: 'a baker' })).toBe(true)
    expect(isByafFlatCard({ first_message: 'hi' })).toBe(true)
  })

  it('never steals a card the existing V1/V2/V3 paths already handle', () => {
    expect(isByafFlatCard({ spec: 'chara_card_v2', data: {} })).toBe(false)
    expect(isByafFlatCard({ first_mes: 'greeting', mes_example: '<START>' })).toBe(false)
    expect(isByafFlatCard({ name: 'Plain', description: 'no markers' })).toBe(false)
    expect(isByafFlatCard(undefined)).toBe(false)
  })
})

describe('byafFlatCard', () => {
  it('maps the Backyard field names onto our card', () => {
    const card = byafFlatCard({
      name: 'Sumire',
      persona: '{character} bakes.',
      narrative: 'A Saturday morning.',
      first_message: 'You are early.',
      example_dialogue: 'one\ntwo',
      isNSFW: true,
      displayName: 'Sumire the Baker',
    })
    expect(card.name).toBe('Sumire')
    expect(card.description).toBe('{{char}} bakes.')
    expect(card.scenario).toBe('A Saturday morning.')
    expect(card.first_mes).toBe('You are early.')
    expect(card.tags).toEqual(['nsfw'])
    expect(card.extensions).toMatchObject({ display_name: 'Sumire the Baker' })
  })

  it('accepts the older char_* aliases instead of importing a nameless card', () => {
    const card = byafFlatCard({ char_name: 'Old', char_persona: 'a persona', char_greeting: 'hello there' })
    expect(card.name).toBe('Old')
    expect(card.first_mes).toBe('hello there')
  })

  it('falls back to the display name and never leaves the greeting empty for a nested array', () => {
    const card = byafFlatCard({ displayName: 'Nested', firstMessages: [{ text: 'nested greeting' }] })
    expect(card.name).toBe('Nested')
    expect(card.first_mes).toBe('nested greeting')
  })
})

describe('isByafManifest', () => {
  it('needs a characters list, plus scenarios or a schema version', () => {
    expect(isByafManifest({ characters: ['a.json'], schemaVersion: 1 })).toBe(true)
    expect(isByafManifest({ characters: ['a.json'], scenarios: [] })).toBe(true)
    expect(isByafManifest({ characters: [] })).toBe(false)
    expect(isByafManifest({ schemaVersion: 1 })).toBe(false)
    expect(isByafManifest('nope')).toBe(false)
  })
})

describe('byafCardFields', () => {
  it('builds ST-shaped fields from manifest, character and scenario', () => {
    const fields = byafCardFields({
      manifest: JSON.parse(BYAF_MANIFEST),
      character: JSON.parse(BYAF_CHARACTER),
      scenarios: [JSON.parse(BYAF_SCENARIO)],
    })
    expect(fields.name).toBe('Sumire')
    expect(fields.description).toContain('{{char}} runs the bakery')
    expect(fields.first_mes).toBe('{{char}}: You are early again. The ovens are not even on.')
    expect(fields.mes_example).toContain('<START>')
    expect(fields.creator).toBe('Nightjar')
    expect(fields.tags).toEqual(['nsfw'])
    expect(fields.extensions).toEqual({ display_name: 'Sumire the Baker' })
  })
})

describe('byafAlternateGreetings', () => {
  it('takes the scenarios after the first, deduped and macro-converted', () => {
    const greetings = byafAlternateGreetings([
      { firstMessages: [{ text: 'primary' }] },
      { firstMessages: [{ text: '#{character}: another morning' }] },
      { firstMessages: [{ text: '#{character}: another morning' }] },
      { firstMessages: [{ text: 'primary' }] },
    ])
    expect(greetings).toEqual(['{{char}}: another morning'])
  })

  it('is empty for a single scenario', () => {
    expect(byafAlternateGreetings([{ firstMessages: [{ text: 'only' }] }])).toEqual([])
  })
})

describe('imageMimeFromPath', () => {
  it('maps the extensions a card actually carries', () => {
    expect(imageMimeFromPath('a/b/portrait.png')).toBe('image/png')
    expect(imageMimeFromPath('photo.JPEG')).toBe('image/jpeg')
    expect(imageMimeFromPath('art.webp')).toBe('image/webp')
    expect(imageMimeFromPath('mystery.bin')).toBe('image/png')
  })
})

describe('parseByafArchive', () => {
  it('reads a whole archive end to end: card fields plus the portrait', async () => {
    const { card, images } = await parseByafArchive(BYAF_ARCHIVE())
    expect(card.name).toBe('Sumire')
    expect(card.first_mes).toContain('You are early again')
    expect(card.scenario).toBe('Saturday morning, an hour before opening.')
    expect(card.creator).toBe('Nightjar')
    expect(card.character_book?.entries[0].content).toContain('Opens at dawn')
    expect(images).toHaveLength(1)
    expect(images[0].path).toBe('portrait.png')
    expect([...images[0].bytes]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('fails loudly on a zip that is not a BYAF archive', async () => {
    await expect(parseByafArchive(zipOf({ 'readme.txt': 'hello' }))).rejects.toThrow(/Not a BYAF archive/)
  })

  it('fails loudly when the manifest points at a character file the archive lacks', async () => {
    const archive = zipOf({
      'manifest.json': JSON.stringify({ characters: ['missing.json'], scenarios: [] }),
    })
    await expect(parseByafArchive(archive)).rejects.toThrow(/could not be read/)
  })
})
