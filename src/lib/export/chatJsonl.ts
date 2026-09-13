// P2-8: SillyTavern chat export / import as JSONL.
//
// The file is the exact thing SillyTavern's own `saveChat()` writes (`public/script.js`): one JSON
// object per line, the first line the chat header, every following line one message.
//
//   {"user_name":"unused","character_name":"unused","create_date":"...","chat_metadata":{...}}
//   {"name":"Sumire","is_user":false,"is_system":false,"send_date":"2026-01-01T00:00:00.000Z","mes":"..."}
//
// Two deliberate deviations from ST's writer, both read-compatible:
//   - `user_name` / `character_name` carry the real names (ST writes the literal string "unused"
//     there and reads both names out of `chat_metadata` instead, so it ignores these two keys);
//   - a message whose turn carries attached images also gets `extra.media`, the array of
//     `{ type: 'image', url }` that ST renders inline (`script.js`'s `ensureMessageMediaIsArray`).
//
// Layer split: `buildStChatHeader` / `buildStChatMessages` / `serializeChatJsonl` / `parseChatJsonl`
// are pure and hold every format decision; `downloadChatJsonl` is the only I/O.

import type { ChatMessage } from '@/lib/prompt/builder'

/** The message fields this exporter reads — a `StoredMessage` satisfies it as-is. */
export interface ExportableMessage extends ChatMessage {
  createdAt?: number
  swipes?: string[]
  activeSwipe?: number
}

/** ST's `image` media type (`MEDIA_TYPE.IMAGE`). */
const MEDIA_TYPE_IMAGE = 'image'

/** Line one of the file. */
export interface StChatJsonlHeader {
  user_name: string
  character_name: string
  create_date: string
  chat_metadata: Record<string, unknown>
}

/** A `data:` URL for a stored image, whose bytes are base64 without the prefix. */
function imageMediaUrl(base64: string): string {
  if (base64.startsWith('data:')) return base64
  return `data:image/png;base64,${base64}`
}

export interface StMediaAttachment {
  type: string
  url: string
}

/** One line of the file, message side. Field names are ST's, spelled exactly as ST spells them. */
export interface StChatJsonlMessage {
  name: string
  is_user: boolean
  is_system: boolean
  send_date: string
  mes: string
  /** Present only when the turn actually has alternates — ST rebuilds a single swipe on load. */
  swipes?: string[]
  /** 0-based index of the active swipe inside `swipes`. */
  swipe_id?: number
  extra?: Record<string, unknown>
}

export interface BuildStChatOptions {
  messages: ExportableMessage[]
  userName: string
  characterName: string
}

/**
 * A stored timestamp as an ISO string. A message whose `createdAt` is missing or not a finite
 * number exports as the epoch rather than throwing the whole chat away — a single corrupt row
 * shouldn't make the export fail.
 */
export function toSendDate(createdAt: unknown): string {
  const ms = typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : 0
  return new Date(ms).toISOString()
}

/** `create_date` accepts whatever the caller has — an epoch number, a Date, or an ISO string. */
export function toCreateDate(value?: string | number | Date): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  if (typeof value === 'string' && value.trim()) return value
  return new Date().toISOString()
}

export function buildStChatHeader(options: {
  userName: string
  characterName: string
  createDate?: string | number | Date
  chatMetadata?: Record<string, unknown>
}): StChatJsonlHeader {
  return {
    user_name: options.userName,
    character_name: options.characterName,
    create_date: toCreateDate(options.createDate),
    chat_metadata: { ...(options.chatMetadata ?? {}) },
  }
}

/** Messages -> ST message lines. Pure: no clock, no I/O — every value comes from the input. */
export function buildStChatMessages(options: BuildStChatOptions): StChatJsonlMessage[] {
  return options.messages.map((message) => {
    const isUser = message.role === 'user'
    const fallbackName = isUser ? options.userName : options.characterName
    const line: StChatJsonlMessage = {
      name: message.name?.trim() || fallbackName,
      is_user: isUser,
      // ChatMessage has no system role — 'user' | 'char' only — so nothing exports as system.
      is_system: false,
      send_date: toSendDate(message.createdAt),
      mes: message.text ?? '',
    }

    // Swipes are only written when the turn really has alternates; a one-entry swipe list is the
    // same information as `mes` and would just bloat the file.
    if (Array.isArray(message.swipes) && message.swipes.length > 1) {
      const swipes = message.swipes.filter((swipe): swipe is string => typeof swipe === 'string')
      const active = typeof message.activeSwipe === 'number' ? message.activeSwipe : 0
      line.swipes = swipes
      line.swipe_id = active >= 0 && active < swipes.length ? active : 0
    }

    const images = (message.images ?? []).filter((image) => typeof image === 'string' && !!image)
    if (images.length) {
      line.extra = { media: images.map((image) => ({ type: MEDIA_TYPE_IMAGE, url: imageMediaUrl(image) })) }
    }

    return line
  })
}

export interface ChatJsonlInput extends BuildStChatOptions {
  createDate?: string | number | Date
  chatMetadata?: Record<string, unknown>
}

/**
 * The whole file as one string: header line, one line per message, `\n` separated, no trailing
 * newline — byte-for-byte the shape ST's own `saveChat()` produces.
 */
export function serializeChatJsonl(input: ChatJsonlInput): string {
  const header = buildStChatHeader({
    userName: input.userName,
    characterName: input.characterName,
    createDate: input.createDate,
    chatMetadata: input.chatMetadata,
  })
  const lines: unknown[] = [header, ...buildStChatMessages(input)]
  return lines.map((line) => JSON.stringify(line)).join('\n')
}

export interface ParsedChatJsonl {
  header: StChatJsonlHeader | null
  messages: StChatJsonlMessage[]
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((item): item is string => typeof item === 'string')
  return strings.length ? strings : undefined
}

function normalizeParsedMessage(raw: Record<string, unknown>): StChatJsonlMessage {
  const message: StChatJsonlMessage = {
    name: typeof raw.name === 'string' ? raw.name : '',
    is_user: !!raw.is_user,
    is_system: !!raw.is_system,
    send_date: typeof raw.send_date === 'string' ? raw.send_date : String(raw.send_date ?? ''),
    mes: typeof raw.mes === 'string' ? raw.mes : '',
  }
  const swipes = readOptionalStringArray(raw.swipes)
  if (swipes) message.swipes = swipes
  if (typeof raw.swipe_id === 'number') message.swipe_id = raw.swipe_id
  if (raw.extra && typeof raw.extra === 'object' && !Array.isArray(raw.extra)) {
    message.extra = raw.extra as Record<string, unknown>
  }
  return message
}

/** True for the file's first line — the header carries `chat_metadata` and no message body. */
function isHeaderLine(raw: Record<string, unknown>): boolean {
  if ('mes' in raw || 'is_user' in raw) return false
  return 'chat_metadata' in raw || 'create_date' in raw || 'user_name' in raw || 'character_name' in raw
}

/**
 * Parses a JSONL chat back. Tolerates CRLF and blank lines; throws on a line that isn't JSON
 * rather than silently dropping messages (a partially readable chat is worse than a clear error).
 */
export function parseChatJsonl(text: string): ParsedChatJsonl {
  const result: ParsedChatJsonl = { header: null, messages: [] }
  const lines = text.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line.trim()) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      throw new Error(`Chat JSONL line ${index + 1} is not valid JSON.`)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`Chat JSONL line ${index + 1} is not an object.`)
    }
    const raw = parsed as Record<string, unknown>
    if (!result.header && isHeaderLine(raw)) {
      result.header = {
        user_name: typeof raw.user_name === 'string' ? raw.user_name : '',
        character_name: typeof raw.character_name === 'string' ? raw.character_name : '',
        create_date: typeof raw.create_date === 'string' ? raw.create_date : String(raw.create_date ?? ''),
        chat_metadata:
          raw.chat_metadata && typeof raw.chat_metadata === 'object' && !Array.isArray(raw.chat_metadata)
            ? (raw.chat_metadata as Record<string, unknown>)
            : {},
      }
      continue
    }
    result.messages.push(normalizeParsedMessage(raw))
  }
  return result
}

/** Turns a chat title into a `.jsonl` file name — same character policy as the HTML transcript export. */
export function chatJsonlFilename(title: string): string {
  const base = (title || 'chat').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
  return `${base || 'chat'}.jsonl`
}

/** Thin I/O wrapper: anchor + object URL, the same pattern as `downloadChatTranscript`. */
export function downloadChatJsonl(text: string, filename: string): void {
  const blob = new Blob([text], { type: 'application/jsonl' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
