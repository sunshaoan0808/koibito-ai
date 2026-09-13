import type { Chat } from '@/lib/types'

/**
 * The fork graph of the chat list, as a tree.
 *
 * `ChatsPanel` deliberately stays a flat daily-driver list — its own header says so, and that a
 * branch tree should be its own view. This is that view's core: one pure pass over `Chat[]` using
 * `parentChatId`, no extra persisted state, so the tree can never disagree with the chats it draws.
 *
 * Two conditions the app can really produce, handled rather than assumed away:
 * - a `parentChatId` that no longer resolves (the parent was deleted) → the child is promoted to a
 *   root so it stays visible, and is also listed in `orphaned` so the broken link can be shown
 * - a parent chain that loops (hand-edited or imported data) → walking stops at already-visited
 *   nodes, and any chat unreachable from a root is promoted to one. Nothing hangs, nothing is
 *   dropped silently.
 */
export interface BranchNode {
  chat: Chat
  /** 0 for a root chat, +1 per fork generation. */
  depth: number
  children: BranchNode[]
  /** Chats below this one at any depth — what a "3 forks" label counts. */
  descendants: number
}

export interface BranchTree {
  roots: BranchNode[]
  /** Chats whose `parentChatId` points at nothing that exists. */
  orphaned: Chat[]
}

/** Newest activity first, id as a stable tiebreak — the same "recent first" the chat list uses. */
function byRecency(a: Chat, b: Chat): number {
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.id.localeCompare(b.id)
}

export function buildBranchTree(chats: readonly Chat[]): BranchTree {
  const byId = new Map(chats.map((chat) => [chat.id, chat]))
  const childrenOf = new Map<string, Chat[]>()
  const rootChats: Chat[] = []
  const orphaned: Chat[] = []

  for (const chat of chats) {
    const parentId = chat.parentChatId
    const parent = parentId ? byId.get(parentId) : undefined
    if (!parent || parent.id === chat.id) {
      // Root, or a link we can't follow (missing parent, or a chat claiming itself as its parent).
      if (parentId && !parent) orphaned.push(chat)
      rootChats.push(chat)
      continue
    }
    const bucket = childrenOf.get(parent.id)
    if (bucket) bucket.push(chat)
    else childrenOf.set(parent.id, [chat])
  }

  const visited = new Set<string>()
  const countDescendants = (chat: Chat, depth: number): BranchNode => {
    visited.add(chat.id)
    const kids = (childrenOf.get(chat.id) ?? []).filter((kid) => !visited.has(kid.id)).sort(byRecency)
    const children = kids.map((kid) => countDescendants(kid, depth + 1))
    const descendants = children.reduce((sum, node) => sum + 1 + node.descendants, 0)
    return { chat, depth, children, descendants }
  }

  const roots = rootChats.sort(byRecency).map((chat) => countDescendants(chat, 0))

  // Anything still unvisited sits in a cycle (or hangs off one). Promote it — one walk per cycle,
  // since walking marks the rest of that cycle visited.
  for (const chat of [...chats].sort(byRecency)) {
    if (!visited.has(chat.id)) roots.push(countDescendants(chat, 0))
  }

  return { roots, orphaned: orphaned.sort(byRecency) }
}

/** Pre-order walk — parents before children, which is the order a tree list renders in. */
export function flattenBranchTree(roots: readonly BranchNode[]): BranchNode[] {
  const rows: BranchNode[] = []
  const walk = (nodes: readonly BranchNode[]) => {
    for (const node of nodes) {
      rows.push(node)
      walk(node.children)
    }
  }
  walk(roots)
  return rows
}

/** True when the chat on screen is an ancestor of `chatId` at any depth. */
export function isDescendantOf(chats: readonly Chat[], chatId: string, ancestorId: string): boolean {
  // A chat is never its own descendant — even in a cycle, where the walk below would otherwise
  // come back around and report exactly that.
  if (chatId === ancestorId) return false
  const byId = new Map(chats.map((chat) => [chat.id, chat]))
  const seen = new Set<string>()
  let cursor = byId.get(chatId)?.parentChatId
  while (cursor && !seen.has(cursor)) {
    if (cursor === ancestorId) return true
    seen.add(cursor)
    cursor = byId.get(cursor)?.parentChatId
  }
  return false
}
