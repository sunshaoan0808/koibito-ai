import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { ViewShell } from '@/components/ui/ViewShell'
import { charactersApi, chatsApi, worldsApi } from '@/lib/api/client'
import { useApiQuery } from '@/lib/hooks/useApiQuery'
import { t } from '@/lib/i18n'
import { errorMessage, toastError, toastSuccess } from '@/lib/store/useToastStore'
import { mergeFeedEntries, planSettlement, type FeedEntry, type FeedCharacterLike, type FeedKind } from '@/lib/world/townFeed'
import type { Chat } from '@/lib/types'

/**
 * The town feed — what the world got up to while the player was elsewhere.
 *
 * Phase 2 of `docs/design/town-feed.md`: the pure generator from phase 1, plus a place to keep its
 * output and a view to read it. Storage is a chat row (`Chat.townFeed` / `townFeedSettledAt`), which
 * is what makes this a zero-migration feature — `server/db.ts` already keeps everything but the
 * indexed columns in one JSON blob, so a new optional field is just a new optional field.
 *
 * The feed is **not** a narration of the current scene. Nothing here is fed to a prompt: what the
 * character in front of you knows is the knowledge fog's question (`lib/knowledge/claims.ts`), and
 * phase 3 is where the two meet.
 */
export function TownFeedView({
  activeChatId,
  onOpenChat,
}: {
  activeChatId?: string | null
  onOpenChat: (chatId: string) => void
}) {
  const chats = useApiQuery('chats', () => chatsApi.list(), []) ?? []
  const characters = useApiQuery('characters', () => charactersApi.list(), []) ?? []
  const worlds = useApiQuery('worlds', () => worldsApi.list(), []) ?? []
  const [busy, setBusy] = useState(false)

  /** Who lives in which world — `Character.worldId`, not a card field. */
  const worldOfCharacter = useMemo(() => new Map(characters.map((c) => [c.id, c.worldId])), [characters])

  /** The roster a world's feed may draw on: the same primitives `ambientEvents` reads. */
  const rosters = useMemo(() => {
    const map = new Map<string, FeedCharacterLike[]>()
    for (const character of characters) {
      if (!character.worldId) continue
      const roster = map.get(character.worldId) ?? []
      roster.push({
        id: character.id,
        name: character.card.name,
        schedule: character.schedule,
        connections: character.socialConnections,
      })
      map.set(character.worldId, roster)
    }
    return map
  }, [characters])

  const caughtUp = async () => {
    setBusy(true)
    try {
      let added = 0
      for (const world of worlds) {
        const roster = rosters.get(world.id) ?? []
        if (roster.length === 0) continue
        const now = { day: world.currentDay ?? 0, phaseIndex: world.currentPhaseIndex ?? 0 }
        const inWorld = chats.filter((chat) => worldOfCharacter.get(chat.characterId) === world.id)
        for (const plan of planSettlement({ worldId: world.id, characters: roster, now, chats: inWorld })) {
          const chat = inWorld.find((c) => c.id === plan.chatId)
          await chatsApi.update(plan.chatId, {
            townFeed: mergeFeedEntries(chat?.townFeed ?? [], plan.entries),
            townFeedSettledAt: plan.settledAt,
          })
          added += plan.entries.length
        }
      }
      toastSuccess(added > 0 ? t('Town feed caught up') : t('Nothing new to catch up on'))
    } catch (error) {
      toastError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const markRead = async (chat: Chat, entries: FeedEntry[]) => {
    const readAt = Date.now()
    try {
      await chatsApi.update(chat.id, { townFeed: entries.map((entry) => ({ ...entry, readAt })) })
    } catch (error) {
      toastError(errorMessage(error))
    }
  }

  const withFeed = chats.filter((chat) => (chat.townFeed?.length ?? 0) > 0)

  return (
    <ViewShell
      title={t('Town feed')}
      width="wide"
      description={
        <>
          The world does not pause while you are somewhere else. Everything here is derived from what
          the repo already knows — shift tables, the social graph, the weather on the world clock —
          never invented, and never narrated into the scene you are actually in.
        </>
      }
      actions={
        <Button variant="ghost" onClick={caughtUp} disabled={busy}>
          {busy ? t('Catching up…') : t('Catch up')}
        </Button>
      }
    >
      {withFeed.length === 0 ? (
        <EmptyState
          action={
            <Button onClick={caughtUp} disabled={busy}>
              {t('Catch up')}
            </Button>
          }
        >
          {t('Nothing has been recorded here yet — the world keeps happening whether or not anyone is watching.')}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {withFeed.map((chat) => {
            const entries = chat.townFeed ?? []
            const unread = entries.filter((entry) => entry.readAt === undefined).length
            return (
              <section key={chat.id} className="rounded-2xl border border-border bg-bg-elevated p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <button
                      className={`truncate text-sm hover:underline ${chat.id === activeChatId ? 'text-accent' : 'text-text'}`}
                      onClick={() => onOpenChat(chat.id)}
                    >
                      {chat.title}
                    </button>
                    <div className="text-[11px] text-text-muted">
                      {t('Day')} {chat.townFeedSettledAt?.day ?? 0} · {entries.length} {t('entries')}
                      {unread > 0 && <span className="ml-2 text-accent">{unread} {t('unread')}</span>}
                    </div>
                  </div>
                  {unread > 0 && (
                    <Button variant="ghost" onClick={() => markRead(chat, entries)}>
                      {t('Mark all read')}
                    </Button>
                  )}
                </div>
                <ul className="mt-3 space-y-2">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className={`rounded-xl border p-2 ${
                        entry.readAt === undefined ? 'border-accent/40 bg-accent/5' : 'border-border'
                      }`}
                    >
                      <div className="flex items-baseline gap-2 text-[11px] text-text-muted">
                        <span>{t('Day')} {entry.at.day}</span>
                        <span>·</span>
                        <span>{t(KIND_LABELS[entry.kind])}</span>
                      </div>
                      <p className="mt-1 text-sm text-text">{entry.headline}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}
    </ViewShell>
  )
}

const KIND_LABELS: Record<FeedKind, string> = {
  social: 'In town',
  weather: 'Weather',
  work: 'Work',
  rumor: 'Word going round',
  cast: 'A new face',
}
