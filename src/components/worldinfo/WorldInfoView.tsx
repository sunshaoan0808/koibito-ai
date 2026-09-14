import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useApiQuery } from '@/lib/hooks/useApiQuery'
import { charactersApi, chatsApi, worldInfoBooksApi, worldsApi } from '@/lib/api/client'
import { mergeClaims } from '@/lib/knowledge/claims'
import { isGlobalBook } from '@/lib/worldinfo/scope'
import type { WorldInfoBook } from '@/lib/types'
import { LorebookEditor } from './LorebookEditor'
import { BookScopePicker } from './BookScopePicker'
import { Button } from '@/components/ui/Button'
import { Section } from '@/components/ui/Section'
import { ViewShell } from '@/components/ui/ViewShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { confirmDialog } from '@/lib/store/useConfirmStore'
import { t } from '@/lib/i18n'

function scopeSummary(
  book: WorldInfoBook,
  names: { characters: Map<string, string>; worlds: Map<string, string> },
): string {
  if (isGlobalBook(book)) return 'Every chat'
  const labels = [
    ...(book.boundWorldIds ?? []).map((id) => names.worlds.get(id) ?? 'a world'),
    ...(book.boundCharacterIds ?? []).map((id) => names.characters.get(id) ?? 'a character'),
  ]
  if (labels.length === 0) return 'Every chat'
  if (labels.length <= 2) return labels.join(', ')
  return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`
}

export function WorldInfoView() {
  const books = useApiQuery('world-info-books', () => worldInfoBooksApi.list(), []) ?? []
  const characters = useApiQuery('characters', () => charactersApi.list(), []) ?? []
  const worlds = useApiQuery('worlds', () => worldsApi.list(), []) ?? []
  const chats = useApiQuery('chats', () => chatsApi.list(), []) ?? []
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = books.find((b) => b.id === activeId)

  const names = {
    characters: new Map(characters.map((c) => [c.id, c.card.name])),
    worlds: new Map(worlds.map((w) => [w.id, w.name])),
  }

  // "谁知道"（`docs/design/knowledge-fog.md` 三期）。claims 是派生的、从不单独持久化：每条都搭在
  // 某个 Chat 行上，这里用 `mergeClaims` 合并——一桩事是**世界**的事实，不是某次会话的，所以同一
  // 件事抵达三个聊天必须只出现一次，且"被告知"取并集。
  const claims = mergeClaims(...chats.map((chat) => chat.knowledgeClaims ?? []))
  const nameOf = (id: string) => names.characters.get(id) ?? id

  const createBook = async () => {
    const created = await worldInfoBooksApi.create({
      name: 'New World Info',
      book: { name: 'New World Info', entries: [], token_budget: 512, scan_depth: 8 },
      boundChatIds: [],
      boundCharacterIds: [],
      boundWorldIds: [],
    })
    setActiveId(created.id)
  }

  const removeBook = async (id: string) => {
    const book = books.find((b) => b.id === id)
    const ok = await confirmDialog({
      title: `Delete "${book?.book.name || 'this book'}"?`,
      body: 'Its entries are removed from every chat they were active in. This cannot be undone.',
      confirmLabel: 'Delete book',
      tone: 'danger',
    })
    if (!ok) return
    await worldInfoBooksApi.remove(id)
    if (activeId === id) setActiveId(null)
  }

  if (active) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6 sm:p-8">
        <Button variant="ghost" onClick={() => setActiveId(null)} className="mb-6 -ml-2 flex items-center gap-1">
          <ChevronLeft size={15} strokeWidth={2} />
          All books
        </Button>

        <Section title="Scope" description={t("Where this book's entries are eligible to activate.")} className="mb-8">
          <BookScopePicker
            scope={active}
            onChange={(patch) => worldInfoBooksApi.update(active.id, patch)}
          />
        </Section>

        <Section title="Entries" surface="bare">
          <LorebookEditor
            book={active.book}
            onChange={(book) => worldInfoBooksApi.update(active.id, { book, name: book.name || active.name })}
          />
        </Section>
      </div>
    )
  }

  return (
    <ViewShell
      title="World Info"
      description="Standalone lorebooks. Locations, factions, history, world rules. A book with no scope is available to every chat; scope it to a character or world to keep unrelated lore out. Lore that belongs to one character lives on the character card instead."
      actions={
        <Button variant="primary" onClick={createBook}>
          New book
        </Button>
      }
    >
      <div className="space-y-2">
        {books.map((b) => (
          <div
            key={b.id}
            className="group flex items-center justify-between rounded-xl border border-border bg-bg-elevated px-5 py-4 transition-colors hover:border-accent/40"
          >
            <button className="min-w-0 flex-1 text-left" onClick={() => setActiveId(b.id)}>
              <div className="truncate text-sm font-medium text-text">{b.book.name || 'Untitled'}</div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                <span>{b.book.entries.length} {b.book.entries.length === 1 ? 'entry' : 'entries'}</span>
                <span className="text-border">·</span>
                <span className={isGlobalBook(b) ? '' : 'text-accent'}>{scopeSummary(b, names)}</span>
              </div>
            </button>
            <Button
              variant="ghost"
              onClick={() => removeBook(b.id)}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              Delete
            </Button>
          </div>
        ))}
        <Section
          title={t('Who knows')}
          description={t(
            'One row per thing that happened, with everyone who was there and everyone who was told. A claim is a fact about the world rather than about one conversation, so the same event reaching several chats is merged here rather than repeated.',
          )}
        >
          {claims.length === 0 ? (
            <EmptyState>
              <p className="text-sm">{t('Nothing has been witnessed yet')}</p>
              <p className="pt-1 text-xs">
                {t('Claims appear here once a scene has been settled — that is when witnesses are recorded.')}
              </p>
            </EmptyState>
          ) : (
            <ul className="space-y-2">
              {claims.slice(0, 20).map((claim) => (
                <li key={claim.id} className="rounded-lg border border-border bg-bg-elevated px-4 py-3">
                  <p className="text-sm text-text">{claim.text}</p>
                  <p className="pt-1 text-xs text-text-muted">
                    <span className="text-accent">{t('Witnessed by')}</span>{' '}
                    {claim.witnessedByIds.map(nameOf).join('、') || '—'}
                    {claim.toldIds.length > 0 && (
                      <>
                        <span className="px-1 text-border">·</span>
                        <span className="text-accent">{t('Told')}</span>{' '}
                        {claim.toldIds.map(nameOf).join('、')}
                      </>
                    )}
                    <span className="px-1 text-border">·</span>
                    {t('Day')} {claim.at.day} · {claim.at.phaseIndex + 1}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {claims.length > 20 && (
            <p className="pt-2 text-xs text-text-muted">
              {t('Showing the first 20 of')} {claims.length}
            </p>
          )}
        </Section>

        {books.length === 0 && (
          <EmptyState
            action={
              <Button variant="primary" onClick={createBook}>
                Create your first book
              </Button>
            }
          >
            No standalone world info books yet. Most lore can live on a character or world instead. Reach for a book when the same lore spans several of them.
          </EmptyState>
        )}
      </div>
    </ViewShell>
  )
}
