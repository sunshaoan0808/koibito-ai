import { describe, expect, it } from 'vitest'
import {
  INTERVIEW_TRANSCRIPT_BUDGET,
  appendSubjectContext,
  assembleInterviewTranscript,
  buildInterviewPlan,
  clampTranscript,
  transcriptIsUsable,
  type InterviewAnswer,
} from './interview'

describe('buildInterviewPlan', () => {
  it('asks about voice first and appearance last', () => {
    const plan = buildInterviewPlan()
    expect(plan[0].id).toBe('voice')
    expect(plan[plan.length - 1].id).toBe('appearance')
  })

  it('skips the relationship question when there is no relationship to voice', () => {
    expect(buildInterviewPlan().map((q) => q.id)).not.toContain('relationship')
    expect(buildInterviewPlan({ relationship: '   ' }).map((q) => q.id)).not.toContain('relationship')
    expect(buildInterviewPlan({ relationship: 'Old rivals' }).map((q) => q.id)).toContain('relationship')
  })

  it('names the relationship in its own question', () => {
    const plan = buildInterviewPlan({ relationship: 'Lab neighbours' })
    const question = plan.find((q) => q.id === 'relationship')
    expect(question?.prompt).toContain('Lab neighbours')
  })

  it('asks about intimacy only in NSFW mode', () => {
    expect(buildInterviewPlan().map((q) => q.id)).not.toContain('intimacy')
    expect(buildInterviewPlan({ nsfwEnabled: true }).map((q) => q.id)).toContain('intimacy')
  })

  it('keeps appearance last even with every conditional question enabled', () => {
    const plan = buildInterviewPlan({ nsfwEnabled: true, relationship: 'Married' })
    expect(plan[plan.length - 1].id).toBe('appearance')
    expect(plan.map((q) => q.id)).toContain('intimacy')
  })

  it('takes the ordered head when a session is capped', () => {
    const plan = buildInterviewPlan({ maxQuestions: 3 })
    expect(plan.map((q) => q.id)).toEqual(['voice', 'motive', 'wound'])
  })

  it('gives every question a purpose, so the UI can say why it is asking', () => {
    for (const question of buildInterviewPlan({ nsfwEnabled: true, relationship: 'Friend' })) {
      expect(question.purpose.length).toBeGreaterThan(10)
      expect(question.prompt.length).toBeGreaterThan(10)
    }
  })
})

describe('assembleInterviewTranscript', () => {
  const answers: InterviewAnswer[] = [
    { id: 'voice', answer: 'I explain things like a lecture, and I tease when I trust you.' },
    { id: 'motive', answer: 'I want to finish the survey.' },
    { id: 'appearance', answer: '   ' },
  ]

  it('pairs each answer with its question and drops blanks', () => {
    const transcript = assembleInterviewTranscript(answers)
    expect(transcript).toContain('Q: ')
    expect(transcript).toContain('A: I want to finish the survey.')
    expect(transcript).not.toContain('A: \n')
    expect(transcript).not.toContain('appearance')
  })

  it('keeps the asked order rather than the answer order', () => {
    const transcript = assembleInterviewTranscript([
      { id: 'motive', answer: 'Second asked.' },
      { id: 'voice', answer: 'First asked.' },
    ])
    expect(transcript.indexOf('First asked.')).toBeLessThan(transcript.indexOf('Second asked.'))
  })
})

describe('clampTranscript', () => {
  it('leaves a short transcript untouched', () => {
    expect(clampTranscript('Q: a\nA: b', 100)).toBe('Q: a\nA: b')
  })

  it('keeps whole question/answer blocks and never half a block', () => {
    const blocks = Array.from({ length: 20 }, (_, i) => `Q: question ${i} ${'x'.repeat(40)}\nA: answer ${i}`)
    const clamped = clampTranscript(blocks.join('\n\n'), 200)
    expect(clamped.length).toBeLessThanOrEqual(200)
    const kept = clamped.split('\n\n')
    // Every kept block is a complete pair — no dangling "Q:" without its "A:".
    for (const block of kept) {
      expect(block).toMatch(/^Q: /)
      expect(block).toMatch(/\nA: /)
    }
  })

  it('cuts at a sentence end when one block alone blows the budget', () => {
    const oneLine = `Q: ${'q'.repeat(50)}\nA: First long sentence. ${'x'.repeat(200)}`
    const clamped = clampTranscript(oneLine, 120)
    expect(clamped.length).toBeLessThanOrEqual(120)
    expect(clamped.endsWith('.')).toBe(true)
  })

  it('falls back to a hard cut when no sentence end is far enough in', () => {
    const oneLine = `Q: only\nA: ${'word '.repeat(200)}. And then more.`
    const clamped = clampTranscript(oneLine, 120)
    expect(clamped.length).toBeLessThanOrEqual(120)
  })

  it('defaults to the interview budget', () => {
    expect(clampTranscript('x'.repeat(INTERVIEW_TRANSCRIPT_BUDGET + 500)).length).toBeLessThanOrEqual(
      INTERVIEW_TRANSCRIPT_BUDGET,
    )
  })
})

describe('transcriptIsUsable', () => {
  it('rejects an empty or single-answer interview — one answer is not an interview', () => {
    expect(transcriptIsUsable(undefined)).toBe(false)
    expect(transcriptIsUsable('')).toBe(false)
    expect(transcriptIsUsable('Q: a\nA: only one')).toBe(false)
  })

  it('accepts two or more answered questions', () => {
    expect(transcriptIsUsable('Q: a\nA: one\n\nQ: b\nA: two')).toBe(true)
  })
})

describe('appendSubjectContext', () => {
  it('accumulates newest last', () => {
    const first = appendSubjectContext(undefined, 'Interview: she is blunt.')
    const second = appendSubjectContext(first, 'Established: occupation = researcher')
    expect(second.indexOf('Interview')).toBeLessThan(second.indexOf('Established'))
  })

  it('ignores blank additions instead of leaving empty paragraphs', () => {
    expect(appendSubjectContext('kept', '   ')).toBe('kept')
    expect(appendSubjectContext(undefined, '  ')).toBe('')
  })

  it('drops the oldest text when the budget is exceeded, keeping the tail', () => {
    const merged = appendSubjectContext('a'.repeat(50), 'b'.repeat(50), 60)
    expect(merged.length).toBeLessThanOrEqual(60)
    expect(merged).toContain('b')
  })
})
