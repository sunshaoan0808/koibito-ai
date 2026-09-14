/**
 * The character interview — the question sequence and transcript assembly behind the "generate a
 * character by talking to it" path.
 *
 * Absorbed from Front Porch's `character_gen_service.dart`, whose `_runCharacterInterview` asks a
 * fixed, ordered set of questions and feeds the transcript back into both the card rewrite and the
 * lorebook pass ("Runs after interview so transcript context makes entries richer"). Two rules there
 * are worth keeping verbatim, because they are about *why* the order is what it is:
 *
 * - VOICE comes first. It grounds the greeting and example dialogue, so establishing it early keeps
 *   every later answer voice-consistent.
 * - APPEARANCE comes last, so a character doesn't open with a vanity monologue before its voice
 *   exists.
 *
 * The relationship and intimacy questions are conditional for the same reason Front Porch gates
 * them: asking a stranger about what's "unresolved between us" invents shared history that then
 * leaks into the greeting.
 *
 * What this module deliberately is NOT: it does not talk to a model, does not record audio, and
 * does not know about React. It turns answers into the one artifact the generator consumes — a
 * transcript string — so the whole thing is assertable.
 */

export type InterviewTopic =
  | 'voice'
  | 'motive'
  | 'wound'
  | 'relationship'
  | 'social'
  | 'pressure'
  | 'joy'
  | 'intimacy'
  | 'appearance'

export interface InterviewQuestion {
  id: InterviewTopic
  /** What the answer is used for. Shown to the interviewer (the UI), never spoken to the character. */
  purpose: string
  prompt: string
}

export interface InterviewPlanInput {
  /** A chosen relationship starter's label. Absent/blank means the bond question is pointless. */
  relationship?: string
  nsfwEnabled?: boolean
  /** Keep a session short: take the ordered head of the plan. */
  maxQuestions?: number
}

/**
 * The interview, in the order it must be asked. Each entry carries its `purpose` so the UI can say
 * why it is asking rather than being a mystery questionnaire.
 */
export function buildInterviewPlan(input: InterviewPlanInput = {}): InterviewQuestion[] {
  const relationship = input.relationship?.trim()
  const plan: InterviewQuestion[] = [
    {
      id: 'voice',
      purpose: 'Fixes how they speak, so every later answer stays in one voice.',
      prompt:
        'How do you talk? Give me two quick samples of your voice: first, how you would explain something to someone you are trying to impress — then how you would say the same thing to someone you completely trust.',
    },
    {
      id: 'motive',
      purpose: 'The want that drives scenes.',
      prompt: 'In your own words: who are you, and what do you want more than anything right now?',
    },
    {
      id: 'wound',
      purpose: 'The fear that makes them resist.',
      prompt:
        'Tell me about a moment from your past that shaped who you are — and what it left you afraid of, or unable to do.',
    },
    ...(relationship
      ? [
          {
            id: 'relationship' as const,
            purpose: 'Voices the bond they already have with the user, so the greeting carries history.',
            prompt: `Your relationship to {{user}} is: ${relationship}. Who are they to you, really — what do you want from them, and what is unresolved or unspoken between you?`,
          },
        ]
      : []),
    {
      id: 'social',
      purpose: 'Sets the social gradient between strangers and trust.',
      prompt:
        'How do you treat someone who has just met you versus someone you have come to trust completely? What changes?',
    },
    {
      id: 'pressure',
      purpose: 'Behaviour under pressure — the part prose summaries flatten.',
      prompt:
        'When you are cornered, or when someone truly angers you — what do you actually do? Show me, do not tell me.',
    },
    {
      id: 'joy',
      purpose: 'The thing that lowers their guard, for softer scenes.',
      prompt: 'What brings you genuine joy or peace — the thing that lets your guard down?',
    },
    ...(input.nsfwEnabled
      ? [
          {
            id: 'intimacy' as const,
            purpose: 'Intimacy preferences and limits, asked only when the app is in NSFW mode.',
            prompt:
              'When it comes to sex and intimacy: what do you crave, where are your hard limits, and are you dominant or submissive?',
          },
        ]
      : []),
    {
      id: 'appearance',
      purpose: 'Their looks, in their own words — asked last so it does not become a vanity monologue.',
      prompt:
        'Now describe your physical appearance in your own words — what you look like, how you carry yourself, and what you are wearing and carrying in this opening scene. Be specific.',
    },
  ]

  const max = input.maxQuestions
  return typeof max === 'number' && max > 0 ? plan.slice(0, max) : plan
}

export interface InterviewAnswer {
  id: InterviewTopic
  answer: string
}

/** How much of a transcript is worth spending prompt budget on. */
export const INTERVIEW_TRANSCRIPT_BUDGET = 1600

/**
 * Pairs answers with their questions, in the order the questions were asked. Blank answers are
 * dropped rather than written out as empty turns — a half-answered interview should read as a
 * shorter interview, not as a broken one.
 */
export function assembleInterviewTranscript(answers: readonly InterviewAnswer[], maxChars?: number): string {
  const plan = buildInterviewPlan({ nsfwEnabled: true })
  const order = new Map(plan.map((q, i) => [q.id, i]))
  const byId = new Map(plan.map((q) => [q.id, q.prompt]))
  const blocks = answers
    .filter((a) => a.answer.trim().length > 0)
    // Ask order, not answer order: the sequence carries the reason it has this shape (voice before
    // appearance), and a transcript that reads back scrambled loses it. Unknown topics go last.
    .slice()
    .sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER))
    .map((a) => `Q: ${byId.get(a.id) ?? a.id}\nA: ${a.answer.trim()}`)
  return clampTranscript(blocks.join('\n\n'), maxChars)
}

/**
 * Truncates a transcript without ever leaving half a question/answer behind: whole blocks are kept
 * while they fit. Cutting mid-sentence here would hand the model a fragment to "enrich" from, which
 * is exactly how invented details get in.
 */
export function clampTranscript(transcript: string, maxChars: number = INTERVIEW_TRANSCRIPT_BUDGET): string {
  const text = transcript.trim()
  if (text.length <= maxChars) return text
  const blocks = text.split('\n\n')
  const kept: string[] = []
  let used = 0
  for (const block of blocks) {
    const cost = block.length + (kept.length > 0 ? 2 : 0)
    if (used + cost > maxChars) break
    kept.push(block)
    used += cost
  }
  // A single oversized block still has to be cut somewhere; do it at a sentence end when possible.
  if (kept.length === 0) {
    const head = text.slice(0, maxChars)
    const lastStop = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '))
    return (lastStop > maxChars / 2 ? head.slice(0, lastStop + 1) : head).trim()
  }
  return kept.join('\n\n')
}

/**
 * Whether a transcript is worth feeding the generator at all. Front Porch only checks for
 * non-empty; one answer is not enough to enrich a card without the model inventing the rest, so the
 * floor here is two answered questions.
 */
export function transcriptIsUsable(transcript: string | undefined): boolean {
  if (!transcript) return false
  const answered = transcript.split(/\n(?=Q: )/).filter((block) => /\nA: \S/.test(block) || block.trimStart().startsWith('A: ')).length
  return answered >= 2
}

/**
 * Appends a line to a subject's rolling context, newest last, under a character budget. Later
 * generation stages read this, which is what makes the stages a chain instead of five unrelated
 * calls: the lorebook pass sees the interview, the outfits pass sees the profile, and so on.
 */
export function appendSubjectContext(existing: string | undefined, addition: string, budget = 1200): string {
  const text = addition.trim()
  if (!text) return existing?.trim() ?? ''
  const merged = existing?.trim() ? `${existing.trim()}\n\n${text}` : text
  return merged.length <= budget ? merged : merged.slice(merged.length - budget).trimStart()
}
