import { useApiQuery } from '@/lib/hooks/useApiQuery'
import { relationshipEventsApi } from '@/lib/api/client'
import { t } from '@/lib/i18n'

/**
 * Read-only view of the judge's relationship bookkeeping (`relationship_events`): what moved each
 * turn, why it decided so, and any milestone flags it set. Nothing here writes — the journal exists
 * so the mechanics are *visible* instead of having to be inferred from the stage number.
 */
export function RelationshipJournal({ chatId }: { chatId: string }) {
  const events =
    useApiQuery(`relationship-events:${chatId}`, () => relationshipEventsApi.listByChat(chatId), [chatId]) ?? []

  if (events.length === 0) {
    return (
      <p className="px-1 text-xs text-text-muted">
        {t('Nothing logged yet — the journal fills in as warmth, intimacy or a milestone moves.')}
      </p>
    )
  }

  // Newest first: the journal is read top-down after a turn, not browsed chronologically.
  const sorted = [...events].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((e) => (
        <li key={e.id} className="rounded-xl bg-bg-sunken px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] text-text-muted">{new Date(e.createdAt).toLocaleString()}</span>
            <span className="flex flex-wrap justify-end gap-x-2 text-[11px] tabular-nums">
              {Object.entries(e.deltas).map(([dim, v]) => (
                <span key={dim} className={v > 0 ? 'text-accent' : 'text-text-muted'}>
                  {dim} {v > 0 ? `+${v}` : v}
                </span>
              ))}
            </span>
          </div>
          <p className="mt-1 text-xs text-text">{e.reason}</p>
          {e.newFlags && e.newFlags.length > 0 && (
            <p className="mt-1 text-[11px] text-accent">{e.newFlags.join(' · ')}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
