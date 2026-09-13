// P2-8: Backyard AI card import.
//
// A real BYAF ("Backyard Archive Format") file is a zip:
//   - root `manifest.json` — `{ schemaVersion, characters: [path], scenarios: [path], author }`
//   - one character JSON per `characters` path — `{ name, displayName, persona, isNSFW, loreItems, images }`
//   - one scenario JSON per `scenarios` path — `{ narrative, firstMessages, exampleMessages, formattingInstructions }`
// The field mapping below mirrors SillyTavern's own `ByafParser` (`src/byaf.js` in the ST repo)
// field for field, so the same archive produces the same card text here and there.
//
// A flat Backyard-style card JSON — the same fields with no archive around them, and no card
// spec (`first_message` / `example_dialogue` / `persona` / `loreItems` at the top level) — is
// handled by the same mapper; `isByafFlatCard` is deliberately strict so no plain V1/V2/V3 card
// can fall into this path (see its doc comment).
//
// Everything except `readZipEntries`/`parseByafArchive` is a pure function. Deflate is handled by
// the platform `DecompressionStream` rather than a new zip dependency (same call as
// `api/binaryUtils.ts`), so this file adds no dependency.

import { normalizeCardJson, type CharacterCardData, type Lorebook } from './cardSpec'

/* ---------------------------------------------------------------- zip reading */

const ZIP_LOCAL_HEADER = 0x04034b50
const ZIP_CENTRAL_HEADER = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50
/** End-of-central-directory record is 22 bytes plus an optional comment of up to 0xffff. */
const ZIP_EOCD_MIN_BYTES = 22
const ZIP_MAX_COMMENT_BYTES = 0xffff
const ZIP_STORED = 0
const ZIP_DEFLATED = 8

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  )
}

/** True when `bytes` starts with a zip local file header — used to sniff a BYAF archive by content, not by file name. */
export function isZipArchive(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && readU32(bytes, 0) === ZIP_LOCAL_HEADER
}

/** Scans backwards for the end-of-central-directory record (it sits before an optional trailing comment). */
function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const lowest = Math.max(0, bytes.length - (ZIP_MAX_COMMENT_BYTES + ZIP_EOCD_MIN_BYTES))
  for (let offset = bytes.length - ZIP_EOCD_MIN_BYTES; offset >= lowest; offset--) {
    if (readU32(bytes, offset) === ZIP_END_OF_CENTRAL_DIRECTORY) return offset
  }
  return -1
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  // Copy into a freshly allocated array: the input is usually a subarray view of the whole
  // archive, and `Blob` only accepts an `ArrayBuffer`-backed view.
  const stream = new Blob([new Uint8Array(compressed)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * Reads every file of a zip archive into a `path -> bytes` map. Walks the central directory
 * (rather than local headers) because that's where the authoritative entry list and sizes live.
 * Directory entries and entries using a compression method other than stored/deflate are skipped.
 */
export async function readZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const eocd = findEndOfCentralDirectory(bytes)
  if (eocd < 0) throw new Error('Not a readable ZIP archive (no end-of-central-directory record).')
  const entryCount = readU16(bytes, eocd + 10)
  let offset = readU32(bytes, eocd + 16)
  const entries = new Map<string, Uint8Array>()
  const decoder = new TextDecoder()

  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > bytes.length || readU32(bytes, offset) !== ZIP_CENTRAL_HEADER) break
    const method = readU16(bytes, offset + 10)
    const compressedSize = readU32(bytes, offset + 20)
    const nameLength = readU16(bytes, offset + 28)
    const extraLength = readU16(bytes, offset + 30)
    const commentLength = readU16(bytes, offset + 32)
    const localOffset = readU32(bytes, offset + 42)
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength

    if (!name || name.endsWith('/')) continue
    if (localOffset + 30 > bytes.length || readU32(bytes, localOffset) !== ZIP_LOCAL_HEADER) continue
    const localNameLength = readU16(bytes, localOffset + 26)
    const localExtraLength = readU16(bytes, localOffset + 28)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize)
    if (method === ZIP_STORED) entries.set(name, compressed.slice())
    else if (method === ZIP_DEFLATED) entries.set(name, await inflateRaw(compressed))
  }

  return entries
}

/** Collapses `.` / `..` / backslashes so an archive path and a manifest path can be compared. */
function normalizeArchivePath(path: string): string {
  const parts: string[] = []
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

/**
 * BYAF manifest paths are relative to the archive root, while the file they point at can sit
 * under any directory prefix in the zip — so an exact match is tried first, then a
 * case-insensitive match, then a suffix match on the normalized path.
 */
function findArchiveEntry(entries: Map<string, Uint8Array>, path: string): Uint8Array | undefined {
  const normalized = normalizeArchivePath(path)
  if (!normalized) return undefined
  const direct = entries.get(path) ?? entries.get(normalized)
  if (direct) return direct
  const wanted = normalized.toLowerCase()
  for (const [name, data] of entries) {
    const candidate = normalizeArchivePath(name).toLowerCase()
    if (candidate === wanted || candidate.endsWith(`/${wanted}`)) return data
  }
  return undefined
}

function parseJsonEntry(entries: Map<string, Uint8Array>, path: string): unknown {
  const bytes = findArchiveEntry(entries, path)
  if (!bytes) return undefined
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return undefined
  }
}

/** Maps an image path's extension to a mime type for the data URL an imported portrait becomes. */
export function imageMimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'avif') return 'image/avif'
  return 'image/png'
}

/* ------------------------------------------------------------- value helpers */

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** First non-empty string among `values` — the alias-priority helper the flat mapper is built on. */
function firstStr(...values: unknown[]): string {
  for (const value of values) {
    const text = str(value)
    if (text) return text
  }
  return ''
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

/* ---------------------------------------------------------------- card fields */

/**
 * BYAF writes its own macros instead of SillyTavern's: `#{user}:` / `#{character}:` in example
 * dialogue, and bare `{user}` / `{character}` elsewhere. Converted to `{{user}}` / `{{char}}`,
 * the form this app's own `substituteMacros` reads (`characters/macros.ts`).
 */
export function replaceByafMacros(value: unknown): string {
  return String(value ?? '')
    .replace(/#{user}:/gi, '{{user}}:')
    .replace(/#{character}:/gi, '{{char}}:')
    .replace(/\{character\}(?!\})/gi, '{{char}}')
    .replace(/\{user\}(?!\})/gi, '{{user}}')
}

/** One `<START>`-delimited block per example, matching both ST's `formatExampleMessages` and our own `mes_example` convention. */
export function formatByafExampleMessages(value: unknown): string {
  if (!Array.isArray(value)) return ''
  let formatted = ''
  for (const example of value) {
    const text = isRecord(example) ? str(example.text) : str(example)
    if (!text) continue
    formatted += `<START>\n${replaceByafMacros(text)}\n`
  }
  return formatted.trimEnd()
}

/**
 * The first message of one scenario. BYAF stores it as a `firstMessages` array holding at most one
 * message; a flat export can also carry it as a plain string or a single `{ text }` object.
 */
export function firstMessageText(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const text = firstMessageText(item)
      if (text) return text
    }
    return ''
  }
  if (isRecord(value)) {
    return firstStr(value.text, value.mes, value.message, firstMessageText(value.firstMessages))
  }
  return ''
}

/** Example dialogue from either shape: an array of `{ text }` (BYAF) or one flat string / array of strings. */
export function exampleDialogueText(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.some((item) => isRecord(item))) return formatByafExampleMessages(value)
    const lines = value.filter((item): item is string => typeof item === 'string' && !!item)
    return lines.join('\n\n')
  }
  if (isRecord(value)) return exampleDialogueText(value.exampleMessages ?? value.mes_example)
  return str(value)
}

/**
 * BYAF lore items are a flat `{ key, value }[]`: one entry per item, activated on any of the
 * comma-separated keys — the same conversion ST's parser does.
 */
export function byafLoreItemsToBook(value: unknown): Lorebook | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined
  const entries = value
    .filter(isRecord)
    .map((item, index) => ({
      id: index,
      keys: replaceByafMacros(item.key)
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean),
      secondary_keys: [],
      content: replaceByafMacros(item.value),
      constant: false,
      selective: false,
      insertion_order: index,
      enabled: true,
      extensions: {},
    }))
  if (!entries.length) return undefined
  return { entries, extensions: {} }
}

/** Alternate greetings are the scenarios after the first one, deduped, skipping the primary first message. */
export function byafAlternateGreetings(scenarios: Record<string, unknown>[]): string[] {
  if (scenarios.length <= 1) return []
  const primary = firstMessageText(scenarios[0]?.firstMessages)
  const greetings = new Set<string>()
  for (const scenario of scenarios.slice(1)) {
    const text = firstMessageText(scenario?.firstMessages)
    if (!text || text === primary) continue
    greetings.add(replaceByafMacros(text))
  }
  return [...greetings]
}

export interface ByafSources {
  /** The archive's root `manifest.json`. */
  manifest?: Record<string, unknown>
  /** The character JSON the manifest points at. */
  character?: Record<string, unknown>
  /** Every scenario JSON the manifest points at, in manifest order. */
  scenarios?: Record<string, unknown>[]
}

/**
 * Archives -> the flat ST-shaped card object `normalizeCardJson` consumes. Kept as its own
 * exported step (rather than returning a `CharacterCardData` directly) so a caller can inspect or
 * extend the raw mapping before normalization fills in defaults.
 */
export function byafCardFields(sources: ByafSources): Record<string, unknown> {
  const manifest = record(sources.manifest)
  const character = record(sources.character)
  const scenarios = (sources.scenarios ?? []).map(record)
  const primary = record(scenarios[0])
  const author = record(manifest.author)
  const displayName = str(character.displayName)

  return {
    name: str(character.name) || displayName,
    description: replaceByafMacros(character.persona),
    // BYAF has no separate personality field — its persona text is the whole description.
    personality: '',
    scenario: replaceByafMacros(primary.narrative),
    first_mes: replaceByafMacros(firstMessageText(primary.firstMessages)),
    mes_example: formatByafExampleMessages(primary.exampleMessages),
    creator_notes: str(author.backyardURL),
    system_prompt: replaceByafMacros(primary.formattingInstructions),
    post_history_instructions: '',
    alternate_greetings: byafAlternateGreetings(scenarios),
    character_book: byafLoreItemsToBook(character.loreItems),
    // BYAF has no tags; ST stores the NSFW flag as one so the information survives the trip.
    tags: character.isNSFW ? ['nsfw'] : [],
    creator: str(author.name),
    character_version: '',
    // Preserves the author's own name for the character when it differs from the internal one.
    extensions: displayName ? { display_name: displayName } : {},
  }
}

/** Field names that mark a flat card as Backyard-family rather than a plain V1/V2/V3 card. */
const BYAF_FLAT_MARKERS = [
  'persona',
  'loreItems',
  'isNSFW',
  'displayName',
  'first_message',
  'firstMessage',
  'firstMessages',
  'example_dialogue',
  'exampleMessages',
  'narrative',
  'formattingInstructions',
  'backyardURL',
  'char_persona',
] as const

/** True for an archive's root `manifest.json` — a `characters` path list is the one load-bearing field. */
export function isByafManifest(raw: unknown): boolean {
  if (!isRecord(raw)) return false
  const characters = raw.characters
  if (!Array.isArray(characters) || !characters.some((path) => typeof path === 'string' && !!path)) {
    return false
  }
  return Array.isArray(raw.scenarios) || raw.schemaVersion === 1
}

/**
 * True for a flat Backyard-style card. Deliberately strict, in three ways, so no existing import
 * path can be stolen:
 *   - anything carrying a card spec wrapper (`spec` / `data`) is a V2/V3 card, never this;
 *   - anything already using the standard `first_mes` / `mes_example` keys is a V1/V2 card — the
 *     normal path maps those, and this mapper only exists for cards that would otherwise lose
 *     their opening message entirely;
 *   - at least one Backyard-specific field name has to be present.
 */
export function isByafFlatCard(raw: unknown): boolean {
  if (!isRecord(raw)) return false
  if ('spec' in raw || 'data' in raw) return false
  if ('first_mes' in raw || 'mes_example' in raw) return false
  return BYAF_FLAT_MARKERS.some((marker) => marker in raw)
}

/**
 * A flat Backyard-style card (`first_message` / `example_dialogue` / `persona` and friends) mapped
 * to our card shape. The older `char_name` / `char_persona` / `char_greeting` / `world_scenario`
 * aliases are accepted too: those are the key names the same pre-V2 flat exports used, and without
 * them such a card would import with an empty name and an empty greeting.
 */
export function byafFlatCard(raw: Record<string, unknown>): CharacterCardData {
  const scenario = record(raw.scenario)
  const narrative = firstStr(raw.scenario, raw.narrative, raw.world_scenario, scenario.narrative)
  const firstMes = firstStr(
    raw.first_message,
    raw.firstMessage,
    raw.firstMessages,
    raw.char_greeting,
    raw.greeting,
    firstMessageText(raw.firstMessages),
    firstMessageText(scenario.firstMessages),
  )
  const examples = exampleDialogueText(
    raw.example_dialogue ?? raw.exampleMessages ?? raw.example_messages ?? scenario.exampleMessages,
  )
  const displayName = str(raw.displayName)
  return normalizeCardJson({
    name: firstStr(raw.name, raw.char_name, displayName, raw.title),
    // BYAF's bare `{character}` / `{user}` macros appear in the persona and the narrative too, not
    // just in the greeting — converted here so a flat card reaches the prompt with them resolved.
    description: replaceByafMacros(firstStr(raw.description, raw.persona, raw.char_persona)),
    personality: replaceByafMacros(firstStr(raw.personality, raw.personality_traits)),
    scenario: replaceByafMacros(narrative),
    first_mes: replaceByafMacros(firstMes),
    mes_example: examples ? formatByafExampleMessages([{ text: examples }]) : '',
    creator_notes: firstStr(raw.creator_notes, raw.backyardURL),
    system_prompt: replaceByafMacros(firstStr(raw.system_prompt, raw.formattingInstructions)),
    post_history_instructions: '',
    alternate_greetings: Array.isArray(raw.alternate_greetings) ? raw.alternate_greetings : [],
    character_book: raw.character_book ?? byafLoreItemsToBook(raw.loreItems),
    tags: Array.isArray(raw.tags) ? raw.tags : raw.isNSFW ? ['nsfw'] : [],
    creator: str(raw.creator),
    character_version: str(raw.character_version),
    extensions: displayName ? { display_name: displayName } : {},
  })
}

/** The archive -> card pipeline, minus the I/O of opening the file. */
export function byafArchiveCard(sources: ByafSources): CharacterCardData {
  return normalizeCardJson(byafCardFields(sources))
}

export interface ByafImage {
  /** Path of the image inside the archive. */
  path: string
  bytes: Uint8Array
}

export interface ByafArchiveImport {
  card: CharacterCardData
  /** Character images in manifest order — the first one is the portrait. */
  images: ByafImage[]
}

/**
 * Reads a BYAF archive (zip) end to end: manifest -> character JSON -> scenario JSONs -> card,
 * plus the character's own images. Throws with a specific message when the archive isn't BYAF,
 * so an accidental `.zip` import fails loudly instead of producing an empty card.
 */
export async function parseByafArchive(bytes: Uint8Array): Promise<ByafArchiveImport> {
  const entries = await readZipEntries(bytes)
  const manifest = parseJsonEntry(entries, 'manifest.json')
  if (!isByafManifest(manifest)) {
    throw new Error('Not a BYAF archive: manifest.json is missing or has no characters list.')
  }
  const manifestRecord = record(manifest)
  const characterPaths = (manifestRecord.characters as string[]).filter((path) => !!path)
  const character = record(parseJsonEntry(entries, characterPaths[0]))
  if (!Object.keys(character).length) {
    throw new Error(`Not a BYAF archive: character file "${characterPaths[0]}" could not be read.`)
  }

  const scenarioPaths = Array.isArray(manifestRecord.scenarios)
    ? (manifestRecord.scenarios as unknown[]).filter((path): path is string => typeof path === 'string' && !!path)
    : []
  const scenarios = scenarioPaths.map((path) => record(parseJsonEntry(entries, path)))

  const images: ByafImage[] = []
  const imageEntries = Array.isArray(character.images) ? character.images : []
  for (const entry of imageEntries) {
    const image = record(entry)
    const imagePath = str(image.path)
    if (!imagePath) continue
    // Image paths are relative to the character file, not to the archive root.
    const characterDir = characterPaths[0].includes('/')
      ? characterPaths[0].slice(0, characterPaths[0].lastIndexOf('/') + 1)
      : ''
    const data = findArchiveEntry(entries, `${characterDir}${imagePath}`) ?? findArchiveEntry(entries, imagePath)
    if (data) images.push({ path: imagePath, bytes: data })
  }

  return { card: byafArchiveCard({ manifest: manifestRecord, character, scenarios }), images }
}
