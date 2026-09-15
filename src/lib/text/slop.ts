/**
 * Detection and cleanup of "AI slop" — recognisable tells of machine-written RP prose.
 * `cleanModelOutput` rewrites a completion before storage, stripping things that are never
 * legitimate character speech (echoed prefixes, OOC asides, meta lines). `findSlop` /
 * `buildSlopAvoidanceNote` instead detect clichéd phrasing and build a steering note naming
 * back to the model the specific tells it has already used, rather than editing prose in place.
 */

import { normalizeRpMarkup } from '@/lib/text/messageSegments'
import { EXPLICIT_ANTI_PATTERNS } from '@/lib/dating/intimacyScene'

/** One recognisable tell of machine-written prose. */
export interface SlopPattern {
  id: string
  /** How this gets named back to the model — the offending phrase itself, not a category label. */
  label: string
  re: RegExp
}

/**
 * The corpus, read by `findSlop` for steering only (never rewritten in place). Excludes plain
 * wording ("she said"), frequency-dependent patterns, and anything a character might say aloud.
 */
export const SLOP_PATTERNS: SlopPattern[] = [
  // --- Stock emotional shorthand: naming a feeling instead of showing it ---
  { id: 'couldnt-help', label: "couldn't help but", re: /\bcould ?n['’]?t help but\b/gi },
  { id: 'mix-of', label: '"a mix of X and Y" for an expression', re: /\ba mix(ture)? of [a-z\s]{3,30} and [a-z\s]{3,30}/gi },
  { id: 'despite-herself', label: '"despite herself/himself/themselves"', re: /\bdespite (her|him|them)self\b/gi },
  { id: 'ghost-of-smile', label: '"a ghost of a smile"', re: /\b(a|the) ghost of (a|her|his|their) (smile|grin|smirk)\b/gi },
  { id: 'ghost-of-touch', label: '"the ghost of a touch"', re: /\b(a|the) ghost of (a|her|his|their) (touch|breath|laugh)\b/gi },
  { id: 'barely-whisper', label: '"voice barely above a whisper"', re: /\b(barely|scarcely|no louder than) (a|above a) whisper\b/gi },
  { id: 'shiver-down', label: '"sent a shiver down her spine"', re: /\b(sent|sending) (a|an) (shiver|shudder|jolt|spark|thrill) (down|through|up)\b/gi },
  { id: 'heart-hammering', label: '"heart hammering/pounding in her chest"', re: /\b(heart|pulse) (hammer|pound|thunder|thud|race)(ing|ed|s)? (in|against|inside) (her|his|their|its) (chest|ribs|throat)\b/gi },
  { id: 'breath-didnt-know', label: '"a breath she didn\'t know she was holding"', re: /\b(a |the )?breath (she|he|they) did ?n['’]?t (even )?(know|realise|realize) (she|he|they) (was|were) holding\b/gi },
  { id: 'air-thick-with', label: '"the air was thick with"', re: /\b(the )?air (was|felt|hung|grew|turned) (thick|heavy|charged|electric)\b/gi },
  { id: 'silence-stretched', label: '"the silence stretched"', re: /\b(the )?silence (stretch|linger|hang|hung|drag)(ed|ing|s)?\b/gi },
  { id: 'unreadable', label: '"an unreadable expression"', re: /\b(an?|her|his|their) (unreadable|inscrutable|indecipherable) (expression|look|gaze|face)\b/gi },
  { id: 'something-flickered', label: '"something flickered in her eyes"', re: /\bsomething (flicker|flash|shift|dance|glint)(ed|ing|s)? (in|across|behind|through)\b/gi },
  { id: 'eyes-darkened', label: '"her eyes darkened"', re: /\b(her|his|their) (eyes|gaze) (darken|soften|harden)(ed|s|ing)?\b/gi },
  { id: 'smile-didnt-reach', label: '"a smile that didn\'t reach her eyes"', re: /\b(smile|grin) that did ?n['’]?t (quite )?reach (her|his|their) eyes\b/gi },
  { id: 'dangerously-low', label: '"voice dangerously low"', re: /\bvoice (dropp?ing|dropped|going|went|low(er)?)(,)? (dangerous(ly)?|deceptive(ly)?|impossibly) (low|soft|quiet)\b/gi },
  { id: 'beat-passed', label: '"a beat passed"', re: /\b(a|another) beat (passed|of silence|went by)\b/gi },
  { id: 'first-time-in', label: '"for the first time in a long time"', re: /\bfor the first time in (a )?(long time|years|forever)\b/gi },

  // --- Narrator editorialising: the story explaining itself to the reader ---
  { id: 'little-did', label: '"little did she know"', re: /\blittle did (she|he|they|you|[A-Z][a-z]+) (know|suspect|realise|realize)\b/gi },
  { id: 'unbeknownst', label: '"unbeknownst to"', re: /\bunbeknownst to\b/gi },
  { id: 'in-that-moment', label: '"in that moment, she knew"', re: /\bin that moment,? (she|he|they|you) (knew|understood|realised|realized)\b/gi },
  { id: 'not-just-but', label: '"it\'s not just X, it\'s Y" phrasing', re: /\bnot (just|only|merely) [^.,;!?]{2,40}[,;]? (but|it['’]s|they['’]re|she['’]s|he['’]s) \b/gi },
  { id: 'more-than-just', label: '"more than just"', re: /\bmore than (just|merely|simply) (a|an|the)?\b/gi },
  { id: 'seemed-to', label: '"seemed to" / "appeared to" hedging in narration', re: /\b(seemed|appeared) to (be|have|know|understand|sense|want|need)\b/gi },

  // --- Purple prose ---
  { id: 'orbs', label: '"orbs" for eyes', re: /\b(her|his|their|the) (emerald|sapphire|amber|violet|azure|obsidian|crimson|golden|dark|bright)? ?orbs\b/gi },
  { id: 'ministrations', label: '"ministrations"', re: /\bministrations\b/gi },
  { id: 'pools-of', label: '"pools of" for eyes', re: /\bpools of (liquid |molten |dark |warm )?[a-z]{3,12}\b/gi },
  { id: 'electricity', label: '"electricity shot through"', re: /\b(electricity|a current|fire|heat) (shot|surged|coursed|raced) (through|down|up)\b/gi },
  { id: 'every-fibre', label: '"every fibre of her being"', re: /\bevery fib(re|er) of (her|his|their|my) being\b/gi },
  { id: 'tapestry', label: '"a tapestry of"', re: /\ba tapestry of\b/gi },
  { id: 'testament', label: '"a testament to"', re: /\ba testament to\b/gi },
  { id: 'symphony', label: '"a symphony of"', re: /\ba symphony of\b/gi },
  { id: 'dance-of', label: '"a delicate dance of"', re: /\b(a|the) (delicate|intricate|careful) dance of\b/gi },
  { id: 'palpable', label: '"palpable"', re: /\bpalpable\b/gi },

  // --- Scene-closing filler: a turn that ends by gesturing at nothing ---
  { id: 'only-time-will-tell', label: '"only time will tell"', re: /\bonly time (will|would) tell\b/gi },
  { id: 'rest-is-history', label: '"and the rest is history"', re: /\bthe rest (is|was) history\b/gi },
  { id: 'what-happens-next', label: '"whatever happens next" scene-closing filler', re: /\bwhat(ever)? (happens|comes|came) next\b/gi },
  { id: 'one-thing-certain', label: '"one thing was certain"', re: /\bone thing (was|is) (certain|for sure|clear)\b/gi },
]

/** `intimacyScene.ts`'s peak-phase stock phrases, converted into the same `SlopPattern` shape so a phrase the character has already used feeds the same avoidance note as ordinary slop. Passed as `extraPatterns`, not merged into `SLOP_PATTERNS`, since it's only relevant during an explicit-rated chat. */
export const EXPLICIT_ANTI_PATTERN_ENTRIES: SlopPattern[] = EXPLICIT_ANTI_PATTERNS.map((phrase) => ({
  id: `explicit-${phrase.replace(/[^a-z]+/gi, '-')}`,
  label: phrase,
  re: new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
}))

/**
 * Text that is never part of a character's actual turn, only the model slipping out of the
 * roleplay. Handled by `cleanModelOutput` as whole-line removals, not steering.
 */
const META_LINE_PATTERNS: RegExp[] = [
  // An OOC aside in any of the conventional wrappers.
  /^\s*[([{]{1,2}\s*ooc\b[^\n]*$/i,
  /^\s*ooc\s*[:\-][^\n]*$/i,
  /^\s*[([{]{2}[^\n]*[)\]}]{2}\s*$/,
  // Guards against the model echoing the injected relationship-guidance prompt text verbatim
  // (see dating/relationshipDescription.ts's buildRelationshipDescription).
  /^\s*relationship:\s*.+\bare at the ["“'].+["”'] stage\b.*$/i,
  /^\s*\(let this colour tone, warmth, and what feels earned right now\.[^)]*\)\s*$/i,
  // An assistant addressing the user about the text it just wrote.
  /^\s*\(?\s*(let me know|i hope (this|that)|feel free to|would you like|shall i|do you want me to|if you('| wa)?nt me to)\b[^\n]*$/i,
  /^\s*\(?\s*(note|disclaimer|content warning|cw)\s*[:\-][^\n]*$/i,
  /^\s*as an? (ai|language model|assistant)\b[^\n]*$/i,
  // A model narrating its own compliance.
  /^\s*\(?\s*(continuing|continued|to be continued|end of (reply|response|turn|scene))\s*\.?\s*\)?\s*$/i,
]

/** A leading "Certainly!" style affirmation, only when it stands as its own opening line. */
const LEADING_AFFIRMATION_RE =
  /^\s*(certainly|of course|sure|absolutely|got it|understood|alright|okay|ok|no problem|happy to)[!.,]?\s*(here('s| is) [^\n]*)?\n+/i

/** A markdown heading at the start of a line — RP prose has no headings. */
const MD_HEADING_RE = /^[ \t]*#{1,6}[ \t]+/gm

/**
 * Leaked thinking blocks (Mortal-style ECoT / generic think tags): a model that was told to
 * "think first, then write" sometimes emits the thinking part into the reply. These can never
 * be legitimate character speech — strip the whole block, keep what follows. Unclosed trailing
 * blocks are dropped with the tail (a cut-off think is not dialogue either).
 */
const THINK_BLOCK_RES: RegExp[] = [
  /<MortalThink>[\s\S]*?(?:<\/MortalThink>|$)/gi,
  /<thinking>[\s\S]*?(?:<\/thinking>|$)/gi,
  /<think>[\s\S]*?(?:<\/think>|$)/gi,
]

/** Strips leaked thinking blocks — the hard counterpart to the Mortal preset's soft "never emit ECoT" rule. Pure. */
export function stripThinkBlocks(text: string): string {
  if (!text) return text
  let out = text
  for (const re of THINK_BLOCK_RES) {
    re.lastIndex = 0
    out = out.replace(re, '')
  }
  return out
}

/** Three or more blank lines collapse to one blank line. */
const EXCESS_BLANKS_RE = /\n{3,}/g

export interface CleanModelOutputOptions {
  /** The speaking character's name, to strip an echoed `Name:` prefix the prompt's own generation cue invited. */
  charName?: string
  /** The player's persona name, to cut the reply short if the model started writing their turn too. */
  personaName?: string
}

/**
 * Cuts off a stray turn marker — the model narrating a whole back-and-forth (or a `<START>`-style
 * scene break) instead of one turn. Backstop for when stop sequences (`useChatSession.ts`'s
 * `dynamicStops`) don't get honoured by the server/template.
 */
export function truncateAtStrayTurnMarker(text: string, charName: string, personaName: string): string {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const markers: RegExp[] = [/<START>/i]
  if (charName.trim()) markers.push(new RegExp(`\\n\\s*${escape(charName.trim())}\\s*:`, 'i'))
  if (personaName.trim()) markers.push(new RegExp(`\\n\\s*${escape(personaName.trim())}\\s*:`, 'i'))
  let cut = text.length
  for (const marker of markers) {
    const match = text.match(marker)
    if (match?.index !== undefined && match.index < cut) cut = match.index
  }
  return text.slice(0, cut).trim()
}

/** A leading name-shaped label glued onto an echo (`"Kai: "`), narrow enough (1-2 capitalized
 *  words right before a colon) to not strip a real sentence's opening clause. */
const LEADING_SPEAKER_LABEL_RE = /^\s*[A-Z][A-Za-z'-]*(?:\s[A-Z][A-Za-z'-]*)?\s*:\s*/

/**
 * True when `text` is nothing but the immediately-preceding message played back, bare or with a
 * stray speaker-label glued on. Only checks the ONE prior message — a short line ("Oh." "Fine.")
 * recurring later in real dialogue is common, but an exact *immediate* repeat never is.
 */
export function isVerbatimEcho(text: string, priorText: string | undefined): boolean {
  const prior = priorText?.trim()
  if (!prior) return false
  const trimmed = text.trim()
  return trimmed === prior || trimmed.replace(LEADING_SPEAKER_LABEL_RE, '') === prior
}

/** Texts shorter than this are never compared — a short line ("Oh.") recurs legitimately in real dialogue. */
const DUPLICATE_MIN_LENGTH = 40

/** Collapses whitespace so a real duplicate isn't missed over a stray newline/spacing difference. */
function normalizeForDuplicateCheck(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/**
 * Broader than `isVerbatimEcho`: catches a reply that's a tail-end repeat, a concatenation of
 * recent turns, or a copy of the player's own earlier line — via a bidirectional substring check
 * against both roles' recent messages.
 */
export function isDuplicateOfRecentText(candidate: string, recentTexts: (string | undefined)[]): boolean {
  const normalizedCandidate = normalizeForDuplicateCheck(candidate)
  if (normalizedCandidate.length < DUPLICATE_MIN_LENGTH) return false
  for (const raw of recentTexts) {
    if (!raw) continue
    const other = normalizeForDuplicateCheck(raw)
    if (other.length < DUPLICATE_MIN_LENGTH) continue
    if (normalizedCandidate.includes(other) || other.includes(normalizedCandidate)) return true
  }
  return false
}

// --- Full-history (anti-parrot) echo detection -------------------------------------------------
//
// `isVerbatimEcho` only ever looks at the ONE message before the candidate, and
// `isDuplicateOfRecentText` only ever asks whether one text is a substring of another. Neither
// catches a turn the model rebuilt from an *older* message with a word or two swapped. The pieces
// below do: one similarity measure over normalised text, a scan of the whole window the caller
// hands over, and a rate report so a before/after baseline can be quoted instead of guessed.

/** Comparison form of a text: lowercase, letters/digits/whitespace kept, every run of
 *  markup/punctuation/quotes (`*`, `"`, `,`, `...`) collapsed to a single space. NFKC first, so
 *  full-width and compatibility glyphs fold onto their plain forms. */
function normalizeForSimilarity(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** Only the first N chars of each side enter the edit-distance comparison: a repeat is already
 *  unmistakable inside that window, and it keeps one bad turn from making the turn cost unbounded. */
export const SIMILARITY_MAX_LENGTH = 1200

/** Classic two-row Levenshtein distance — insertions, deletions, substitutions. Callers pass the
 *  shorter string first; the buffer sizes off that side. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  const n = a.length
  const m = b.length
  if (n === 0) return m
  if (m === 0) return n
  if (n > m) return editDistance(b, a)
  let prev = new Int32Array(n + 1)
  let cur = new Int32Array(n + 1)
  for (let i = 0; i <= n; i++) prev[i] = i
  for (let j = 1; j <= m; j++) {
    cur[0] = j
    const bj = b.charCodeAt(j - 1)
    for (let i = 1; i <= n; i++) {
      const substitution = prev[i - 1] + (a.charCodeAt(i - 1) === bj ? 0 : 1)
      const deletion = prev[i] + 1
      const insertion = cur[i - 1] + 1
      let best = deletion < insertion ? deletion : insertion
      if (substitution < best) best = substitution
      cur[i] = best
    }
    const swap = prev
    prev = cur
    cur = swap
  }
  return prev[n]
}

/**
 * How alike two texts are, 0 (nothing in common) to 1 (identical once casing, markup, punctuation
 * and whitespace are normalised away). 1 - edit distance / longer length, so a single swapped word
 * in a long turn still scores in the high 0.9s while a genuine continuation lands in the 0.8s. The
 * one measure both the anti-parrot check and recall dedupe use, so "same text" means one thing
 * everywhere. Returns 0 as soon as either side normalises away to nothing.
 */
export function textSimilarity(a: string, b: string): number {
  const x = normalizeForSimilarity(a).slice(0, SIMILARITY_MAX_LENGTH)
  const y = normalizeForSimilarity(b).slice(0, SIMILARITY_MAX_LENGTH)
  if (!x || !y) return 0
  if (x === y) return 1
  return 1 - editDistance(x, y) / Math.max(x.length, y.length)
}

/** At or above this similarity a prior turn counts as reproduced rather than answered. Calibrated
 *  against real shapes (see slop.test.ts): exact / whitespace / markup / punctuation variants score
 *  1.000, a one-word edit 0.94, while a genuine continuation that appends a new sentence scores
 *  0.87 and is deliberately left alone. */
export const PARROT_ECHO_THRESHOLD = 0.9

/** Texts shorter than this are never compared here — a short line ("...Fine.") recurs legitimately
 *  in real dialogue. Mirrors `DUPLICATE_MIN_LENGTH`. */
export const PARROT_ECHO_MIN_LENGTH = 40

/** A prior turn the candidate reproduces. */
export interface EchoMatch {
  /** Index into the array passed as `priorTexts`, so the caller can name which message was echoed. */
  index: number
  similarity: number
  /** The prior text exactly as it was passed in, untouched. */
  text: string
}

export interface EchoScanOptions {
  /** Counts as an echo at or above this similarity. Defaults to `PARROT_ECHO_THRESHOLD`. */
  threshold?: number
  /** Skip comparison for texts shorter than this (after trimming). Defaults to `PARROT_ECHO_MIN_LENGTH`. */
  minLength?: number
}

/**
 * Anti-parrot scan over the WHOLE window the caller hands over, not just the message before the
 * candidate — a turn rebuilt from five messages back is the shape `isVerbatimEcho` cannot see. Pass
 * pass the full recent history (both roles) as `priorTexts`; the highest-similarity entry wins, ties
 * resolved toward the earliest index, so the result is order-stable and never depends on iteration
 * accidents. Returns undefined when nothing in the window is reproduced.
 */
export function findEchoMatch(
  candidate: string,
  priorTexts: (string | undefined)[],
  opts: EchoScanOptions = {},
): EchoMatch | undefined {
  const threshold = opts.threshold ?? PARROT_ECHO_THRESHOLD
  const minLength = opts.minLength ?? PARROT_ECHO_MIN_LENGTH
  const trimmed = typeof candidate === 'string' ? candidate.trim() : ''
  if (trimmed.length < minLength) return undefined

  let best: EchoMatch | undefined
  for (let i = 0; i < priorTexts.length; i++) {
    const raw = priorTexts[i]
    if (typeof raw !== 'string') continue
    const prior = raw.trim()
    if (prior.length < minLength) continue
    const similarity = textSimilarity(trimmed, prior)
    if (similarity < threshold) continue
    if (!best || similarity > best.similarity) best = { index: i, similarity, text: raw }
  }
  return best
}

/** Boolean face of `findEchoMatch`, for callers that only need the yes/no gate. */
export function isEchoOfHistory(
  candidate: string,
  priorTexts: (string | undefined)[],
  opts: EchoScanOptions = {},
): boolean {
  return findEchoMatch(candidate, priorTexts, opts) !== undefined
}

export interface DuplicateRateReport {
  /** How many texts were offered, comparable or not. */
  total: number
  /** How many were long enough to be compared against earlier ones — the denominator of `rate`. */
  comparable: number
  /** How many comparable texts reproduced an earlier text in the same list. */
  duplicates: number
  /** `duplicates / comparable`, or 0 when nothing was comparable. */
  rate: number
}

/**
 * Share of a turn list that restates an earlier turn — the number to quote when claiming a
 * duplicate-line rate improved, measured with the same threshold the live gate uses. Pass the same
 * history before and after a change to compare like with like; `rate` is 0 for an empty list.
 */
export function measureDuplicateRate(texts: string[], opts: EchoScanOptions = {}): DuplicateRateReport {
  const minLength = opts.minLength ?? PARROT_ECHO_MIN_LENGTH
  let comparable = 0
  let duplicates = 0
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i]
    if (typeof text !== 'string' || text.trim().length < minLength) continue
    comparable += 1
    if (findEchoMatch(text, texts.slice(0, i), opts)) duplicates += 1
  }
  return { total: texts.length, comparable, duplicates, rate: comparable === 0 ? 0 : duplicates / comparable }
}

const oddCount = (text: string, mark: string): boolean => (text.split(mark).length - 1) % 2 === 1

/** Whether `text` ends on a finished thought — proper terminal punctuation and no unclosed `*`/`"`. */
export function endsCleanly(text: string): boolean {
  const t = text.trimEnd()
  if (!t) return true
  if (oddCount(t, '*') || oddCount(t, '"')) return false
  return /[.!?…]["'’”*)\]]*$/.test(t) || /[*"”’]$/.test(t)
}

/** Closes markup a stop sequence cut off mid-beat (`*She says it` → `*She says it*`); drops a bare trailing mark with nothing inside it. */
export function balanceTrailingMarkup(text: string): string {
  let out = text.trimEnd()
  for (const mark of ['"', '*']) {
    if (!oddCount(out, mark)) continue
    out = new RegExp(`\\${mark}\\s*$`).test(out)
      ? out.replace(new RegExp(`\\s*\\${mark}\\s*$`), '').trimEnd()
      : out + mark
  }
  return out
}

/**
 * Trims a reply back to its last complete sentence, for a generation cut off mid-word. Bails
 * (returns input unchanged) if the trim would lose more than `maxLossRatio` of the text.
 */
export function trimToLastSentence(text: string, maxLossRatio = 0.35): string {
  const trimmed = text.trimEnd()
  if (!trimmed) return text
  if (endsCleanly(trimmed)) return trimmed
  const match = trimmed.match(/[\s\S]*[.!?…]["'’”*)\]]*/)
  if (!match) return text
  const cut = match[0].trimEnd()
  if (!cut) return text
  if ((trimmed.length - cut.length) / trimmed.length > maxLossRatio) return text
  return cut
}

/**
 * The deterministic scrub applied once to a completed generation before it's stored. Order
 * matters: turn markers cut first, then whole-line meta removals, then cosmetic collapses. Idempotent.
 */
export function cleanModelOutput(text: string, opts: CleanModelOutputOptions = {}): string {
  if (!text) return text
  // Leaked thinking blocks (Mortal-style ECoT / generic think tags) go FIRST — before
  // `normalizeRpMarkup` below strips every `<tag>` into bare text and the block boundaries
  // become unfindable. A cut-off think is not dialogue either, so unclosed tails go too.
  let out = stripThinkBlocks(text)

  if (opts.charName || opts.personaName) {
    out = truncateAtStrayTurnMarker(out, opts.charName ?? '', opts.personaName ?? '')
  }

  // An echoed speaker prefix (the generation cue already ends with e.g. `Sumire:`). Only stripped
  // at the very start, and only for the actual speaker.
  if (opts.charName?.trim()) {
    const escaped = opts.charName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(`^\\s*${escaped}\\s*:\\s*`, 'i'), '')
  }

  out = out.replace(LEADING_AFFIRMATION_RE, '')
  out = normalizeRpMarkup(out)

  // Curly quotes -> straight, so quote-matching below (and elsewhere in the codebase) works
  // against a single consistent character.
  out = out.replace(/[‘’]/g, "'").replace(/[“”]/g, '"')

  // A model sometimes italicizes an entire line of spoken dialogue outright; this app keeps
  // dialogue plain and reserves italics for actions/thoughts. Only strips when a `*` sits directly
  // against the quote mark on both sides, with no nested quote/star in between — so a genuine
  // action beat next to the quote (`"Hey." *She turns.*`) or emphasis on one word inside otherwise
  // plain dialogue (`"I *really* mean it."`) is left alone.
  out = out.replace(/\*"([^"*\n]+)"\*/g, '"$1"')
  out = out.replace(/"\*([^"*\n]+)\*"/g, '"$1"')

  const kept = out
    .split('\n')
    .filter((line) => !META_LINE_PATTERNS.some((re) => re.test(line)))
  out = kept.join('\n')

  out = out.replace(MD_HEADING_RE, '')
  out = out.replace(EXCESS_BLANKS_RE, '\n\n')

  // A lone trailing asterisk with no partner is a half-written action beat, not emphasis.
  const stars = (out.match(/\*/g) ?? []).length
  if (stars % 2 === 1 && /\*\s*$/.test(out)) out = out.replace(/\*\s*$/, '')

  return out.trim()
}

export interface SlopHit {
  id: string
  label: string
  /** How many times it occurs across everything scanned. */
  count: number
}

/** Every slop pattern present in `text`, with occurrence counts. */
export function findSlop(text: string): SlopHit[] {
  return findSlopAcross([text])
}

/** As `findSlop`, but counting across several texts at once (a character's recent turns). `extraPatterns` (e.g. `EXPLICIT_ANTI_PATTERN_ENTRIES`) are scanned alongside the base corpus for this call only. */
export function findSlopAcross(texts: string[], extraPatterns: SlopPattern[] = []): SlopHit[] {
  const hits: SlopHit[] = []
  for (const pattern of [...SLOP_PATTERNS, ...extraPatterns]) {
    let count = 0
    for (const text of texts) {
      if (!text) continue
      // matchAll consumes the shared global regex safely, unlike .test/.exec (which carry lastIndex).
      count += [...text.matchAll(pattern.re)].length
    }
    if (count > 0) hits.push({ id: pattern.id, label: pattern.label, count })
  }
  return hits.sort((a, b) => b.count - a.count)
}

/** Words too common to be evidence of repetition on their own. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'her', 'his', 'i', 'if', 'in', 'is',
  'it', 'its', 'me', 'my', 'not', 'of', 'on', 'or', 'she', 'so', 'that', 'the', 'their', 'them', 'then',
  'they', 'this', 'to', 'was', 'were', 'with', 'you', 'your',
])

/** Normalises a phrase for comparison: lowercase, punctuation and asterisks gone, spaces collapsed. */
function normalisePhrase(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[*"“”'’]/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

export interface RepeatedPhrase {
  phrase: string
  count: number
}

/**
 * Word sequences a character has used more than once across `texts` — catches repetition no
 * sampler-level penalty reaches. Only returns the longest form of each repeat (sub-phrases of a
 * reported match are dropped); all-stopword sequences are skipped.
 */
export function findRepeatedPhrases(
  texts: string[],
  opts: { minWords?: number; maxWords?: number; minCount?: number; limit?: number } = {},
): RepeatedPhrase[] {
  const minWords = opts.minWords ?? 4
  const maxWords = opts.maxWords ?? 8
  const minCount = opts.minCount ?? 2
  const limit = opts.limit ?? 5

  const counts = new Map<string, number>()
  for (const text of texts) {
    if (!text) continue
    const words = normalisePhrase(text)
    // Count each n-gram at most once per message — repetition within one turn is a style choice.
    const seenHere = new Set<string>()
    for (let n = minWords; n <= maxWords; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const slice = words.slice(i, i + n)
        if (slice.every((w) => STOPWORDS.has(w))) continue
        const phrase = slice.join(' ')
        if (seenHere.has(phrase)) continue
        seenHere.add(phrase)
        counts.set(phrase, (counts.get(phrase) ?? 0) + 1)
      }
    }
  }

  const repeated = [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)

  // Keep only maximal phrases: drop any that's a substring of an already-kept one at the same count.
  const out: RepeatedPhrase[] = []
  for (const [phrase, count] of repeated) {
    if (out.some((k) => k.count === count && k.phrase.includes(phrase))) continue
    out.push({ phrase, count })
    if (out.length >= limit) break
  }
  return out
}

/** How many of the character's most recent turns the avoidance note looks back over. */
export const SLOP_SCAN_TURNS = 6

export interface SlopAvoidanceOptions {
  /** Cap on named clichés, so the note stays a nudge rather than its own wall of instruction. */
  maxPhrases?: number
  /** Cap on named repeated phrases. */
  maxRepeats?: number
  /** Additional patterns scanned alongside the base corpus for this call only — e.g. `EXPLICIT_ANTI_PATTERN_ENTRIES` during an explicit-rated chat. */
  extraPatterns?: SlopPattern[]
}

/**
 * The steering line naming back to the model the specific tells it has just used. Returns
 * undefined when clean (the common case). Pass the character's own recent turns only.
 */
export function buildSlopAvoidanceNote(recentCharTurns: string[], opts: SlopAvoidanceOptions = {}): string | undefined {
  const texts = recentCharTurns.filter((t) => t?.trim()).slice(-SLOP_SCAN_TURNS)
  if (texts.length === 0) return undefined

  const maxPhrases = opts.maxPhrases ?? 4
  const maxRepeats = opts.maxRepeats ?? 3

  const slop = findSlopAcross(texts, opts.extraPatterns).slice(0, maxPhrases)
  const repeats = findRepeatedPhrases(texts, { limit: maxRepeats })

  const lines: string[] = []
  if (slop.length > 0) {
    lines.push(
      `You have already leaned on these in this chat: ${slop.map((h) => h.label).join('; ')}. Do not use them again. Write the moment a different way.`,
    )
  }
  if (repeats.length > 0) {
    lines.push(
      `You have also repeated these exact phrasings: ${repeats.map((r) => `"${r.phrase}"`).join('; ')}. Say it differently or leave it out.`,
    )
  }
  return lines.length ? lines.join(' ') : undefined
}
