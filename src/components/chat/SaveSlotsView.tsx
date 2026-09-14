import { useMemo, useState } from 'react'
import { useApiQuery } from '@/lib/hooks/useApiQuery'
import { chatsApi, saveSlotsApi } from '@/lib/api/client'
import { groupSlotsByChat, hasStoryState, slotCounts } from '@/lib/chat/saveSlotDisplay'
import { ViewShell } from '@/components/ui/ViewShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { confirmDialog } from '@/lib/store/useConfirmStore'
import { errorMessage, toastError, toastSuccess } from '@/lib/store/useToastStore'
import { t } from '@/lib/i18n'
import type { SaveSlot } from '@/lib/types'

/**
 * §12's save slots: a named, full-state snapshot of a chat's story position — relationship state,
 * objectives, relationship events and recalled facts included, not just the transcript — so a
 * player can return to a point in the story instead of "scroll back up and hope".
 *
 * Restoring is deliberately non-destructive. It materialises a *new* chat from the snapshot
 * (`server/saveSlots.ts`'s COPY-not-move rule, matching the fork route and Front Porch's own fork
 * carry-over) and the confirm dialog spells that out: the live timeline is never swapped under the
 * reader, so an old save can't cost anyone the story they have already played.
 */
export function SaveSlotsView({
  activeChatId,
  onOpenChat,
}: {
  activeChatId?: string | null
  onOpenChat: (chatId: string) => void
}) {
  const slots = useApiQuery('saveSlots', () => saveSlotsApi.list(), []) ?? []
  const chats = useApiQuery('chats', () => chatsApi.list(), []) ?? []
  const groups = useMemo(() => groupSlotsByChat(slots), [slots])

  const [targetChatId, setTargetChatId] = useState('')
  const [name, setName] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Defaults to the chat that's open — saving the obvious one shouldn't need a dropdown trip.
  const target = targetChatId || activeChatId || chats[0]?.id || ''

  async function createSlot() {
    if (!target) {
      toastError(t('No chat to save yet — start one first.'))
      return
    }
    const trimmed = name.trim()
    if (!trimmed) {
      toastError(t('Give the slot a name so you recognise it later.'))
      return
    }
    setBusyId('create')
    try {
      await saveSlotsApi.create({ chatId: target, name: trimmed })
      setName('')
      toastSuccess(t('Slot saved.'))
    } catch (e) {
      toastError(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  async function restore(slot: SaveSlot) {
    const ok = await confirmDialog({
      title: `${t('Restore')} “${slot.name}”?`,
      body: t(
        'A new chat is created from this snapshot. The chat you have open now is left untouched, so nothing already played is lost.',
      ),
      confirmLabel: t('Restore'),
    })
    if (!ok) return
    setBusyId(slot.id)
    try {
      const restored = await saveSlotsApi.restore(slot.id)
      toastSuccess(t('Restored — opening the new chat.'))
      onOpenChat(restored.id)
    } catch (e) {
      toastError(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  async function commitRename(id: string) {
    const trimmed = renameValue.trim()
    if (!trimmed) return
    try {
      await saveSlotsApi.update(id, { name: trimmed })
      setRenamingId(null)
    } catch (e) {
      toastError(errorMessage(e))
    }
  }

  async function removeSlot(slot: SaveSlot) {
    const ok = await confirmDialog({
      title: `${t('Delete')} “${slot.name}”?`,
      body: t('The slot goes away. The chat it was taken from keeps its story either way.'),
      confirmLabel: t('Delete'),
      tone: 'danger',
    })
    if (!ok) return
    setBusyId(slot.id)
    try {
      await saveSlotsApi.remove(slot.id)
      toastSuccess(t('Slot deleted.'))
    } catch (e) {
      toastError(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <ViewShell
      title={t('Save slots')}
      width="wide"
      description={
        <>
          A slot captures where a story <em>is</em> — relationship state, open objectives, what the
          characters have told each other — not just what was said. Restoring one opens a new chat
          from that moment and leaves the chat you are playing exactly as it was.
        </>
      }
      actions={<div className="text-xs text-text-muted">{slots.length} {t('slots')}</div>}
    >
      <div className="space-y-6">
        <div className="rounded-2xl border border-border bg-bg-elevated p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <span className="text-[11px] text-text-muted">{t('Chat')}</span>
              <select
                value={target}
                onChange={(e) => setTargetChatId(e.target.value)}
                className="rounded-xl border border-border bg-bg px-2 py-1.5 text-sm text-text"
              >
                {chats.length === 0 && <option value="">{t('No chats yet')}</option>}
                {chats.map((chat) => (
                  <option key={chat.id} value={chat.id}>
                    {chat.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[12rem] flex-[2] flex-col gap-1">
              <span className="text-[11px] text-text-muted">{t('Slot name')}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createSlot()
                }}
                placeholder={t('e.g. Before the festival')}
                className="rounded-xl border border-border bg-bg px-2 py-1.5 text-sm text-text"
              />
            </label>
            <button
              onClick={() => void createSlot()}
              disabled={busyId === 'create' || !target}
              className="rounded-xl border border-border px-3 py-1.5 text-sm text-text transition-colors hover:bg-bg-sunken disabled:opacity-40"
            >
              {busyId === 'create' ? t('Saving…') : t('Save slot')}
            </button>
          </div>
        </div>

        {slots.length === 0 ? (
          <EmptyState>
            No slots yet. Save one above before a scene you might want to come back to — a slot keeps
            the story state, not just the messages.
          </EmptyState>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.chatId} className="space-y-1">
                <div className="text-xs text-text-muted">
                  {group.title || t('Chat no longer exists')} · {group.slots.length}{' '}
                  {group.slots.length === 1 ? t('slot') : t('slots')}
                  {group.chatId === activeChatId ? ` · ${t('open')}` : ''}
                </div>
                {group.slots.map((slot) => {
                  const counts = slotCounts(slot)
                  const isCurrentChat = group.chatId === activeChatId
                  return (
                    <div
                      key={slot.id}
                      className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 ${
                        isCurrentChat ? 'border-text-muted bg-bg-elevated' : 'border-border'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        {renamingId === slot.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void commitRename(slot.id)
                              if (e.key === 'Escape') setRenamingId(null)
                            }}
                            onBlur={() => setRenamingId(null)}
                            className="w-full rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text"
                          />
                        ) : (
                          <div className="truncate text-sm text-text">{slot.name}</div>
                        )}
                        <div className="mt-0.5 text-[11px] text-text-muted">
                          {new Date(slot.createdAt).toLocaleString()} · {counts.messages}{' '}
                          {t('messages')} · {counts.objectives} {t('objectives')} ·{' '}
                          {counts.relationshipEvents} {t('events')} · {counts.facts} {t('facts')}
                          {!hasStoryState(slot) && ` · ${t('transcript only')}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => void restore(slot)}
                          disabled={busyId === slot.id}
                          className="rounded-lg border border-border px-2 py-1 text-xs text-text transition-colors hover:bg-bg-sunken disabled:opacity-40"
                        >
                          {busyId === slot.id ? t('Restoring…') : t('Restore')}
                        </button>
                        <button
                          onClick={() => {
                            setRenamingId(slot.id)
                            setRenameValue(slot.name)
                          }}
                          className="rounded-lg border border-transparent px-2 py-1 text-xs text-text-muted transition-colors hover:border-border hover:text-text"
                        >
                          {t('Rename')}
                        </button>
                        <button
                          onClick={() => void removeSlot(slot)}
                          className="rounded-lg border border-transparent px-2 py-1 text-xs text-text-muted transition-colors hover:border-border hover:text-text"
                        >
                          {t('Delete')}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </ViewShell>
  )
}
