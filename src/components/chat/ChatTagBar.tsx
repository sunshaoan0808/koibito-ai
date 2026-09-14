import { useState } from 'react'
import { chatsApi } from '@/lib/api/client'
import { normalizeTags } from '@/lib/chat/tags'
import { errorMessage, toastError } from '@/lib/store/useToastStore'
import type { Chat } from '@/lib/types'

/**
 * Tag filter + tagging for the chat list. Deliberately free-form: the chips are just whatever tags
 * are already in use, and `+` writes one onto the chat you currently have open. No registry, no
 * management screen — see `lib/chat/tags.ts` for why.
 */
export function ChatTagBar({
  tagsInUse,
  activeChat,
  value,
  onChange,
}: {
  tagsInUse: string[]
  activeChat: Chat | null
  value: string
  onChange: (tag: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)

  const commitTag = async () => {
    const [tag] = normalizeTags([draft])
    setDraft('')
    setAdding(false)
    if (!tag || !activeChat) return
    const current = activeChat.tags ?? []
    const next = normalizeTags([...current, tag])
    if (next.length === current.length) return
    try {
      await chatsApi.update(activeChat.id, { tags: next })
    } catch (e) {
      toastError(errorMessage(e))
    }
  }

  const chip = (tag: string) => (
    <button
      key={tag}
      type="button"
      onClick={() => onChange(value === tag ? '' : tag)}
      className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${
        value === tag ? 'bg-accent/15 text-accent' : 'bg-bg-sunken text-text-muted hover:text-text'
      }`}
    >
      {tag}
    </button>
  )

  const plus = adding ? (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commitTag()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void commitTag()
        if (e.key === 'Escape') {
          setDraft('')
          setAdding(false)
        }
      }}
      placeholder="tag"
      className="w-20 rounded-full bg-bg-sunken px-2 py-0.5 text-[11px] outline-none"
    />
  ) : (
    <button
      type="button"
      onClick={() => setAdding(true)}
      title={activeChat ? `Tag "${activeChat.title}"` : 'Open a chat to tag it'}
      className="rounded-full px-1.5 py-0.5 text-[11px] text-text-muted transition-colors hover:text-text"
    >
      +
    </button>
  )

  return (
    <div className="flex flex-wrap items-center gap-1 px-1 pb-1">
      {tagsInUse.map(chip)}
      {plus}
    </div>
  )
}
