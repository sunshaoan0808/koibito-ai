/**
 * P2-6 dynamic cast: find people who walk into a scene and are named in the prose, but who are not
 * one of the chat's real characters yet — the candidates a writer might want to promote into a
 * permanent one. Pure and derived: nothing is stored, nothing is created here.
 *
 * Deliberately conservative — a wrongly promoted name pollutes the character library, while a
 * missed one costs nothing. So every rule below needs a *person signal* (an honorific, an act of
 * speech, or being mentioned more than once), never just "capitalised word".
 *
 * Design + acceptance: `docs/P2-6-dynamic-cast-npc.md`.
 */

/** How many recent turns look for newcomers. An opening-scene bystander should not resurface forever. */
export const CAST_SCAN_TURNS = 8
/** Mentions needed before a candidate is strong enough to reach the prompt (the panel shows weaker ones collapsed). */
export const CAST_MIN_MENTIONS = 2
/** Hard cap on how many names the prompt line ever carries. */
export const CAST_PROMPT_LIMIT = 3

export interface CastCandidate {
  name: string
  /** Message the name first appeared in, so the panel can jump back to the scene. */
  firstSeenMessageId: string
  mentions: number
  /** The sentence around the first sighting — the seed text for a promoted character. */
  sample: string
}

export interface DetectCastInput {
  /** Recent turns, oldest first. */
  texts: readonly { id: string; text: string }[]
  /** Names already accounted for: roster + character library. Matched case-insensitively. */
  knownNames: readonly string[]
  /** World-book keys, so a lorebook entry's subject is never mistaken for a newcomer. */
  lorebookKeys?: readonly string[]
  /** Names the writer dismissed. Matched case-insensitively. */
  ignore?: readonly string[]
}

/** Titles that follow a Chinese name; the name is what sits in front of them. */
const CJK_HONORIFICS = [
  '先生',
  '小姐',
  '女士',
  '太太',
  '夫人',
  '老师',
  '老板',
  '同学',
  '医生',
  '店长',
  '师傅',
  'さん',
  '君',
  'ちゃん',
]

/** Speech acts that follow a Chinese name in narration ("铃木说" / "阿婆问道"). */
const CJK_SPEECH_VERBS = ['说', '问', '答', '道', '喊', '叫', '回答', '开口', '低语', '嘟囔', '笑道', '叹道', '应道']

/** Familiar-name prefixes that carry the person's name with them. */
const CJK_PREFIXES = ['小', '老', '阿']

/**
 * Words that only look like Latin names: pronouns, sentence openers, weekday/month names. A
 * capitalised token on this list is never a person, so no rule below can pick it up.
 */
const LATIN_STOPWORDS = new Set(
  [
    'The', 'A', 'An', 'And', 'But', 'Or', 'If', 'So', 'Then', 'That', 'This', 'These', 'Those', 'There', 'Here',
    'She', 'He', 'They', 'It', 'You', 'We', 'I', 'Her', 'His', 'Their', 'Its', 'Your', 'My', 'Our',
    'Yes', 'No', 'Maybe', 'Well', 'Oh', 'Ah', 'Hey', 'Okay', 'Still', 'Even', 'Just', 'Only', 'Not', 'Now',
    'What', 'Why', 'How', 'Who', 'When', 'Where', 'Which', 'Something', 'Nothing', 'Everything',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
    'November', 'December',
  ].map((word) => word.toLowerCase()),
)

const CJK_CHAR = '\\u4e00-\\u9fa5'

/** Verbs that mark the Latin word in front of them as somebody speaking. */
const LATIN_SPEECH_VERBS =
  /\b(?:said|says|asked|answered|replied|whispered|muttered|shouted|called|nodded|smiled|laughed)\b/i

/** Honorifics that mark a Latin word as a surname or a nickname. */
const LATIN_TITLES = /(?:Mr|Mrs|Ms|Miss|Dr|Prof)\.?\s*$/i

/** Splits prose into sentences so a candidate can carry the line it was first seen in. */
function sentences(text: string): string[] {
  return text
    .split(/[。！？!?\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/** The sentence a match sits in, trimmed and length-capped — used as the promotion seed text. */
function sentenceAround(text: string, name: string): string {
  const found = sentences(text).find((sentence) => sentence.includes(name))
  const line = found ?? text.trim()
  return line.length > 160 ? `${line.slice(0, 157)}...` : line
}

function cjkPatterns(): RegExp[] {
  // Lazy, not greedy: "隔壁的田中さん" must yield 田中, never 隔壁的田中.
  const honorific = new RegExp(`([${CJK_CHAR}]{1,3}?)(?:${CJK_HONORIFICS.join('|')})`, 'g')
  // Also lazy: "阿婆问道" must yield 阿婆, not 阿婆问 — the shortest window that still ends in a
  // speech verb is the one that actually holds the name.
  const speech = new RegExp(`(?:^|[\\s，。！？；、“”"'(])[${CJK_CHAR}]{0,2}?([${CJK_CHAR}]{2,3}?)(?:${CJK_SPEECH_VERBS.join('|')})`, 'g')
  // The prefix alternation has to stay inside its own group: without the extra parentheses the
  // pattern binds as 小 OR 老 OR 阿-then-anything, which throws the name away for two of the three.
  const familiar = new RegExp(`(?:^|[\\s，。！？；、“”"'(])((?:${CJK_PREFIXES.join('|')})[${CJK_CHAR}]{1,2}?)`, 'g')
  return [honorific, speech, familiar]
}

/**
 * Function words and pronouns that can be swallowed into a CJK capture window. A real name never
 * contains one, so any candidate that does is a false positive rather than a person.
 */
const CJK_JUNK_CHARS = new Set(
  '的了着过在和与是也都就还很没有个这那我你他她它们誰谁说问之其而且但为以于对到从把被给让使能会要想再又已经'.split(''),
)

function isPlausibleName(name: string): boolean {
  if (/[\u4e00-\u9fa5]/.test(name)) {
    if (name.length > 4) return false
    for (const char of name) if (CJK_JUNK_CHARS.has(char)) return false
    return name.length >= 2
  }
  return name.length >= 2
}

/**
 * Peels function words off both ends of a capture. The regex engine reports the *leftmost* match,
 * so "隔壁的田中さん" hands back "的田中" — the name is in there, just padded; trimming recovers it
 * instead of discarding a real person along with the padding.
 */
function trimJunk(name: string): string {
  let trimmed = name
  while (trimmed.length > 1 && CJK_JUNK_CHARS.has(trimmed[0])) trimmed = trimmed.slice(1)
  while (trimmed.length > 1 && CJK_JUNK_CHARS.has(trimmed[trimmed.length - 1])) trimmed = trimmed.slice(0, -1)
  return trimmed
}

/** Every name-looking token in one message, deduped, in order of appearance. */
export function extractNameTokens(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()

  const push = (raw: string) => {
    const name = trimJunk(raw.trim().replace(/^[，。！？；、\s]+|[，。！？；、\s]+$/g, ''))
    if (!name || !isPlausibleName(name)) return
    const key = name.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    found.push(name)
  }

  for (const pattern of cjkPatterns()) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) push(match[1] ?? '')
  }

  const latin = /\b([A-Z][a-z]{1,15}(?:[ -][A-Z][a-z]{1,15})?)\b/g
  for (const match of text.matchAll(latin)) {
    const token = match[1]
    if (LATIN_STOPWORDS.has(token.toLowerCase())) continue
    // A two-part token is a name on its own; a single word needs a person signal, because at the
    // start of a sentence "Strangers" and "Hale" are written exactly the same way. Mid-sentence is
    // signal enough, and a title or a speech verb is signal anywhere.
    if (!token.includes(' ')) {
      const at = match.index ?? 0
      const before = text.slice(Math.max(0, at - 8), at)
      const after = text.slice(at + token.length, at + token.length + 20)
      const atSentenceStart = /(^|[.!?\n]\s?)$/.test(before)
      const hasSignal = LATIN_TITLES.test(before) || LATIN_SPEECH_VERBS.test(after)
      if (atSentenceStart && !hasSignal) continue
    }
    push(token)
  }

  return found
}

/**
 * Named people who are in the prose but not in the chat yet. Sorted strongest first (mention count,
 * then first appearance), so a caller can take the top few without re-sorting.
 */
export function detectCastCandidates(input: DetectCastInput): CastCandidate[] {
  const recent = input.texts.slice(-CAST_SCAN_TURNS)
  const known = new Set(input.knownNames.map((name) => name.trim().toLowerCase()).filter(Boolean))
  const ignore = new Set((input.ignore ?? []).map((name) => name.trim().toLowerCase()).filter(Boolean))
  const lore = new Set((input.lorebookKeys ?? []).map((key) => key.trim().toLowerCase()).filter(Boolean))

  const byName = new Map<string, CastCandidate>()

  for (const turn of recent) {
    for (const name of extractNameTokens(turn.text)) {
      const key = name.toLowerCase()
      if (known.has(key) || ignore.has(key) || lore.has(key)) continue
      const existing = byName.get(key)
      if (existing) {
        existing.mentions += 1
        continue
      }
      byName.set(key, {
        name,
        firstSeenMessageId: turn.id,
        mentions: 1,
        sample: sentenceAround(turn.text, name),
      })
    }
  }

  return [...byName.values()].sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name))
}

/**
 * The candidates worth showing: seen more than once, strongest first, capped. Shared by the chat
 * panel and the prompt line so both agree on who counts as part of the cast.
 */
export function strongCandidates(
  candidates: readonly CastCandidate[],
  limit: number = CAST_PROMPT_LIMIT,
): CastCandidate[] {
  return [...candidates]
    .filter((candidate) => candidate.mentions >= CAST_MIN_MENTIONS)
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, limit)
}

/**
 * The one prompt line that keeps newcomers consistent inside the scene. Only strong candidates
 * (mentioned more than once) qualify, capped at `CAST_PROMPT_LIMIT`; an empty string means "inject
 * nothing", which is what a disabled setting and a candidate-free scene both produce.
 */
export function castPromptLine(candidates: readonly CastCandidate[], limit: number = CAST_PROMPT_LIMIT): string {
  const strong = strongCandidates(candidates, limit)
  if (!strong.length) return ''
  return `People passing through this scene right now: ${strong.map((candidate) => candidate.name).join(', ')}. Keep their names and roles consistent, and treat them as passing visitors rather than established characters.`
}
