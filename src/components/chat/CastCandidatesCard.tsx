import { useMemo, useState } from 'react'
import { Sparkles, UserPlus, X } from 'lucide-react'
import { t } from '@/lib/i18n'
import { charactersApi } from '@/lib/api/client'
import {
  CAST_SCAN_TURNS,
  detectCastCandidates,
  strongCandidates,
  type CastCandidate,
} from '@/lib/cast/detector'
import { promoteCandidate } from '@/lib/cast/promote'

/**
 * P2-6: the guests the scene invented, offered to the writer as candidates.
 *
 * Nothing is written to the character library until "promote" is clicked — that is the whole point
 * of the panel existing rather than the detector creating characters on its own. Dismissals are kept
 * per chat in `localStorage` (a name the writer ignored should not come back on every scroll); the
 * setting that turns the detector on lives in Settings, and this panel is inert while it is off.
 */

/** How many candidates the panel lists. Wider than the prompt's cap: this is a chooser, not a hint. */
const PANEL_CANDIDATES = 5

const dismissKey = (chatId: string) => `cast-dismissed:${chatId}`

function readDismissed(chatId: string): string[] {
  try {
    const raw = localStorage.getItem(dismissKey(chatId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : []
  } catch {
    // Private mode or corrupt JSON: dismissing still works for this session, it just will not persist.
    return []
  }
}

export interface CastCandidatesCardProps {
  chatId: string
  messages: readonly { id: string; text: string }[]
  /** Names already on the roster — never offered back as candidates. */
  knownNames: readonly string[]
  participants: readonly string[]
  onSaveParticipants: (ids: string[]) => Promise<void> | void
  onClose: () => void
}

export function CastCandidatesCard({
  chatId,
  messages,
  knownNames,
  participants,
  onSaveParticipants,
  onClose,
}: CastCandidatesCardProps) {
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(chatId))
  const [busyName, setBusyName] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [promotedNames, setPromotedNames] = useState<string[]>([])

  const candidates = useMemo(() => {
    const found = detectCastCandidates({
      texts: messages.slice(-CAST_SCAN_TURNS).map((message) => ({ id: message.id, text: message.text })),
      knownNames,
      ignore: dismissed,
    })
    return strongCandidates(found, PANEL_CANDIDATES)
  }, [messages, knownNames, dismissed])

  const promote = async (candidate: CastCandidate) => {
    setBusyName(candidate.name)
    setError('')
    try {
      await promoteCandidate(candidate, chatId, participants, {
        createCharacter: (input) => charactersApi.create(input) as Promise<{ id: string }>,
        // The hook's own roster saver, so the round-robin bookkeeping resets exactly as it does
        // when a participant is added from the relationship panel.
        updateChat: async (_chatId, patch) => {
          await onSaveParticipants(patch.participants)
        },
      })
      setPromotedNames((prev) => [...prev, candidate.name])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyName(null)
    }
  }

  const dismiss = (name: string) => {
    const next = [...dismissed, name]
    setDismissed(next)
    try {
      localStorage.setItem(dismissKey(chatId), JSON.stringify(next))
    } catch {
      // Storage refused (private mode / quota): the dismissal still applies to this session.
    }
  }

  return (
    <div className="absolute right-3 top-12 z-30 w-80 rounded-lg border border-border bg-surface/95 p-3 text-sm shadow-lg backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 font-medium">
          <Sparkles size={12} strokeWidth={2} />
          {t('Dynamic cast')}
        </span>
        <button onClick={onClose} title={t('Close')} className="text-text-muted hover:text-text">
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {candidates.length === 0 ? (
        <p className="text-text-muted">{t('Nobody new walked into this scene yet')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {candidates.map((candidate) => (
            <li key={candidate.name} className="rounded border border-border/60 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{candidate.name}</span>
                <span className="text-text-muted">{candidate.mentions}×</span>
              </div>
              <p className="mt-1 line-clamp-2 text-text-muted">{candidate.sample}</p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => void promote(candidate)}
                  disabled={busyName !== null}
                  className="flex items-center gap-1 rounded border border-border px-2 py-0.5 hover:text-text disabled:opacity-50"
                >
                  <UserPlus size={11} strokeWidth={2} />
                  {busyName === candidate.name ? t('Promoting…') : t('Promote')}
                </button>
                <button
                  onClick={() => dismiss(candidate.name)}
                  disabled={busyName !== null}
                  className="rounded px-2 py-0.5 text-text-muted hover:text-text disabled:opacity-50"
                >
                  {t('Ignore')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {promotedNames.length > 0 && (
        <p className="mt-2 text-text-muted">
          {t('On the roster now')}: {promotedNames.join(', ')}
        </p>
      )}
      {error && <p className="mt-2 text-red-400">{error}</p>}
    </div>
  )
}
