import { useMemo } from 'react'
import { useApiQuery } from '@/lib/hooks/useApiQuery'
import { chatsApi } from '@/lib/api/client'
import { buildBranchTree, flattenBranchTree } from '@/lib/chat/branchTree'
import { ViewShell } from '@/components/ui/ViewShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { t } from '@/lib/i18n'

/**
 * §12's "visual story-branch tree": the fork graph the chat list deliberately keeps flat, drawn as
 * a tree instead. `ChatsPanel`'s own header calls for this to be a separate view rather than a
 * nested list, which is why it exists here and not inside that panel.
 *
 * Read-only by design. Forking already lives where the decision is made (a message's own menu), so
 * this view answers the other question: where did this timeline come from, and what else came off
 * it — with any chat one click away. The graph itself (`buildBranchTree`) is pure and knows how to
 * survive a deleted parent and a looping parent chain.
 */
export function BranchTreeView({
  activeChatId,
  onOpenChat,
}: {
  activeChatId?: string | null
  onOpenChat: (chatId: string) => void
}) {
  const chats = useApiQuery('chats', () => chatsApi.list(), []) ?? []
  const tree = useMemo(() => buildBranchTree(chats), [chats])
  const rows = useMemo(() => flattenBranchTree(tree.roots), [tree])
  const forkCount = chats.filter((chat) => chat.parentChatId).length

  return (
    <ViewShell
      title={t('Branch tree')}
      width="wide"
      description={
        <>
          Every chat as a timeline: a fork sits under the chat it came from, indented by generation.
          To branch one, fork a message from its own menu inside the chat — this view is for seeing
          where each timeline came from, and jumping between them.
        </>
      }
      actions={
        <div className="text-xs text-text-muted">
          {chats.length} chats · {forkCount} forks
        </div>
      }
    >
      {chats.length === 0 ? (
        <EmptyState>
          No chats yet. Start one in Chat, then fork a message to grow a tree here.
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {tree.orphaned.length > 0 && (
            <div className="rounded-2xl border border-border bg-bg-elevated p-3 text-xs text-text-muted">
              {tree.orphaned.length} chat(s) point at a parent that no longer exists — kept at the top
              level so nothing disappears: {tree.orphaned.map((chat) => chat.title).join('、')}
            </div>
          )}
          <div className="space-y-1">
            {rows.map((node) => {
              const isCurrent = node.chat.id === activeChatId
              return (
                <button
                  key={node.chat.id}
                  onClick={() => onOpenChat(node.chat.id)}
                  style={{ paddingLeft: 12 + node.depth * 20 }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
                    isCurrent ? 'border-text-muted bg-bg-elevated' : 'border-transparent hover:border-border hover:bg-bg-elevated'
                  }`}
                >
                  <span className="w-4 shrink-0 text-xs text-text-muted">{node.depth > 0 ? '↳' : '●'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm text-text">{node.chat.title}</span>
                      {isCurrent && (
                        <span className="shrink-0 rounded-md bg-bg-sunken px-1.5 py-0.5 text-[10px] text-text-muted">
                          {t('open')}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-text-muted">
                      {node.depth === 0 ? t('Original timeline') : `${t('Fork')} · ${t('generation')} ${node.depth}`}
                      {node.descendants > 0 ? ` · ${node.descendants} ${t('below')}` : ''}
                      {' · '}
                      {new Date(node.chat.updatedAt).toLocaleString()}
                    </span>
                  </span>
                  {node.children.length > 0 && (
                    <span className="shrink-0 text-[11px] text-text-muted">
                      {node.children.length} {t('forks')}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </ViewShell>
  )
}
