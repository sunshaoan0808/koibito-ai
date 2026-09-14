import { useApiQuery } from '@/lib/hooks/useApiQuery'
import { charactersApi, worldsApi } from '@/lib/api/client'
import { isGlobalBook } from '@/lib/worldinfo/scope'
import { Chip } from '@/components/ui/Chip'
import type { WorldInfoBook } from '@/lib/types'
import { t } from '@/lib/i18n'

export type BookScope = Pick<WorldInfoBook, 'boundChatIds' | 'boundCharacterIds' | 'boundWorldIds'>

/**
 * "Available in" control for a standalone World Info book. Nothing selected = the book is global
 * (every chat). Select characters and/or worlds to limit it to chats whose primary character —
 * or that character's world — matches. Chat-level bindings exist in the data model but aren't
 * surfaced here; a chat is a transient unit, a character or world is the natural thing to scope to.
 */
export function BookScopePicker({
  scope,
  onChange,
}: {
  scope: BookScope
  onChange: (patch: Partial<BookScope>) => void
}) {
  const characters = useApiQuery('characters', () => charactersApi.list(), []) ?? []
  const worlds = useApiQuery('worlds', () => worldsApi.list(), []) ?? []
  const charIds = scope.boundCharacterIds ?? []
  const worldIds = scope.boundWorldIds ?? []
  const scoped = !isGlobalBook(scope)

  const toggle = (key: 'boundCharacterIds' | 'boundWorldIds', id: string) => {
    const current = scope[key] ?? []
    onChange({ [key]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id] })
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-text-muted">{t('Available in')}</span>
        {scoped && (
          <button
            type="button"
            onClick={() => onChange({ boundChatIds: [], boundCharacterIds: [], boundWorldIds: [] })}
            className="text-[11px] text-accent hover:underline"
          >
            {t('Make global')}
          </button>
        )}
      </div>
      <p className="mb-3 text-[11px] text-text-muted">
        {scoped
          ? t('Only chats whose character (or that character’s world) is selected below.')
          : t('Every chat. Select a character or world below to limit it.')}
      </p>

      {worlds.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{t('Worlds')}</div>
          <div className="flex flex-wrap gap-1.5">
            {worlds.map((w) => (
              <Chip key={w.id} on={worldIds.includes(w.id)} onClick={() => toggle('boundWorldIds', w.id)}>
                {w.name || t('Untitled world')}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">{t('Characters')}</div>
        {characters.length === 0 ? (
          <p className="text-[11px] text-text-muted">{t('No characters yet.')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {characters.map((c) => (
              <Chip key={c.id} on={charIds.includes(c.id)} onClick={() => toggle('boundCharacterIds', c.id)}>
                {c.card.name || t('Unnamed')}
              </Chip>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
