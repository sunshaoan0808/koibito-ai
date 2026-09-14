import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextAreaField } from '@/components/ui/Field'
import { startDictation, sttSupported, type DictationHandle } from '@/lib/voice/dictation'
import {
  assembleInterviewTranscript,
  buildInterviewPlan,
  transcriptIsUsable,
  type InterviewTopic,
} from '@/lib/characters/interview'

/**
 * The character interview — ask the character about itself, then hand the answers to the generator.
 *
 * The questions and their order come from `@/lib/characters/interview` (absorbed from Front Porch's
 * `character_gen_service.dart`, including the reasons the order is what it is). This panel is only
 * the asking: it shows one question at a time with the reason it is being asked, takes an answer by
 * voice or keyboard, and reports the assembled transcript upward on every change.
 *
 * Voice input is optional in both senses: browsers without speech recognition get the same panel
 * with the keyboard path only, and someone who answers one question and stops is not penalised —
 * the transcript rules (two answers minimum) live in the pure module, not here.
 */
export function InterviewPanel({
  relationship,
  nsfwEnabled = false,
  onChange,
}: {
  relationship?: string
  nsfwEnabled?: boolean
  onChange: (transcript: string) => void
}) {
  const plan = useMemo(() => buildInterviewPlan({ relationship, nsfwEnabled }), [relationship, nsfwEnabled])
  const [answers, setAnswers] = useState<Partial<Record<InterviewTopic, string>>>({})
  const [index, setIndex] = useState(0)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const dictation = useRef<DictationHandle | undefined>(undefined)

  const transcript = assembleInterviewTranscript(plan.map((q) => ({ id: q.id, answer: answers[q.id] ?? '' })))
  const answered = plan.filter((q) => (answers[q.id] ?? '').trim()).length

  useEffect(() => {
    onChange(transcript)
  }, [transcript, onChange])

  useEffect(() => () => dictation.current?.stop(), [])

  const question = plan[index]
  const setAnswer = (id: InterviewTopic, text: string) => setAnswers((prev) => ({ ...prev, [id]: text }))

  const toggleMic = () => {
    if (listening) {
      dictation.current?.stop()
      setListening(false)
      return
    }
    const base = (answers[question.id] ?? '').trim()
    setError('')
    dictation.current = startDictation({
      onText: (fullDraft) => setAnswer(question.id, [base, fullDraft].filter(Boolean).join(' ')),
      onEnd: () => setListening(false),
      onError: (message) => {
        setError(message)
        setListening(false)
      },
    })
    setListening(true)
  }

  const goTo = (next: number) => setIndex(Math.min(plan.length - 1, Math.max(0, next)))

  return (
    <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
        <span>
          Question {index + 1} of {plan.length}
        </span>
        <span>{transcriptIsUsable(transcript) ? `${answered} answered — these go to the generator` : 'at least two answers to count'}</span>
      </div>

      <p className="mt-2 text-sm font-medium text-neutral-100">{question.prompt}</p>
      <p className="mt-1 text-xs text-neutral-500">{question.purpose}</p>

      <TextAreaField
        label=""
        value={answers[question.id] ?? ''}
        onChange={(e) => setAnswer(question.id, e.target.value)}
        rows={3}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {sttSupported() && (
          <Button variant="ghost" onClick={toggleMic} className="gap-1">
            {listening ? 'Stop recording' : 'Answer by voice'}
          </Button>
        )}
        <Button variant="ghost" onClick={() => goTo(index - 1)} disabled={index === 0}>
          Previous
        </Button>
        <Button variant="ghost" onClick={() => goTo(index + 1)} disabled={index >= plan.length - 1}>
          Next
        </Button>
        {index < plan.length - 1 && <Button variant="ghost" onClick={() => goTo(index + 1)}>Skip this one</Button>}
        {answered > 0 && (
          <Button variant="ghost" onClick={() => setAnswers({})}>
            Clear answers
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {!sttSupported() && (
        <p className="mt-2 text-xs text-neutral-500">This browser has no speech input — typing works just as well.</p>
      )}
    </div>
  )
}
