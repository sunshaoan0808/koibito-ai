/**
 * Chat tags — free-form labels used to filter the chat list. Deliberately dumb: no registry, no ids,
 * no nesting. The point is that tagging a chat costs one line of input and never becomes a chore, so
 * everything here is a pure function over plain strings.
 */

/** Cap so a pasted paragraph can't wreck the filter row. */
export const MAX_TAG_LENGTH = 24

/** One tag as stored: trimmed, internal runs of whitespace collapsed, length-capped. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH)
}

/** Normalizes, drops empties, and de-dupes case-insensitively (first spelling wins, order kept). */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of raw) {
    const tag = normalizeTag(value)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

/** Every tag in use across chats, sorted — the suggestion list for the tag input. */
export function allTags(chats: readonly { tags?: string[] }[]): string[] {
  const byKey = new Map<string, string>()
  for (const chat of chats) {
    for (const tag of normalizeTags(chat.tags ?? [])) {
      const key = tag.toLowerCase()
      if (!byKey.has(key)) byKey.set(key, tag)
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b))
}

/** Chats carrying `tag`, case-insensitive. An empty tag matches everything, so "no filter" needs no special case. */
export function filterChatsByTag<T extends { tags?: string[] }>(chats: readonly T[], tag: string): T[] {
  const key = normalizeTag(tag).toLowerCase()
  if (!key) return [...chats]
  return chats.filter((chat) => (chat.tags ?? []).some((t) => normalizeTag(t).toLowerCase() === key))
}
