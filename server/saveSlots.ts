/**
 * The pure half of save slots (ROADMAP §12): given a snapshot and a target chat id, work out
 * exactly which rows to write.
 *
 * Semantics: mirroring the fork route's COPY-not-move rule — and Front Porch's own fork
 * carry-over, which duplicates session state rather than moving it — restoring a slot never
 * touches the source chat. A new chat is materialised instead, so returning to an old save
 * cannot destroy the live timeline. That property is what `saveSlots.test.ts` proves with a
 * deep-frozen snapshot rather than trusting the callers to be careful.
 */
export type Row = Record<string, unknown>

/**
 * Bump when the snapshot shape changes in a way an older slot cannot satisfy. Slots are refused
 * outright, never guessed at: a half-restored timeline is worse than a clear refusal.
 */
export const SAVE_SLOT_SCHEMA_VERSION = 1

export interface ChatSnapshot {
  chat: Row
  messages: Row[]
  objectives: Row[]
  relationshipEvents: Row[]
  facts: Row[]
}

/** What a chat's "full state" actually covers server-side, in one place so the count shown in the UI and the rows copied can never disagree. */
export function snapshotCounts(snapshot: ChatSnapshot): Record<string, number> {
  return {
    messages: snapshot.messages.length,
    objectives: snapshot.objectives.length,
    relationshipEvents: snapshot.relationshipEvents.length,
    facts: snapshot.facts.length,
  }
}

export function slotIsRestorable(slot: Row, version: number = SAVE_SLOT_SCHEMA_VERSION): boolean {
  const snapshot = slot.snapshot as ChatSnapshot | undefined
  return Boolean(snapshot?.chat && snapshot.messages) && slot.schemaVersion === version
}

/**
 * Picks the lineage for a restored chat from candidate ids, first live one wins. Pure so the choice
 * is testable; the caller supplies liveness, because only the caller can ask the store.
 *
 * The fallback matters: a slot taken from a fork carries that fork's own parent in its chat row, so
 * when its immediate source is gone but the grandparent survives, the restored timeline is still
 * attached to something real instead of silently losing its history.
 */
export function resolveParentChatId(
  candidates: (string | undefined)[],
  isAlive: (id: string) => boolean,
): string | undefined {
  return candidates.find((id): id is string => typeof id === 'string' && id.length > 0 && isAlive(id))
}

/** Re-keys one satellite row for the restored chat: fresh id, stamped chatId, everything else intact. */
function rekey(row: Row, chatId: string, newId: () => string): Row {
  const { id: _id, ...rest } = row
  return { ...rest, id: newId(), chatId }
}

export function restorePlan(
  snapshot: ChatSnapshot,
  opts: { chatId: string; title: string; parentChatId?: string; slotId: string; now: number },
  newId: () => string,
): { chat: Row; messages: Row[]; objectives: Row[]; relationshipEvents: Row[]; facts: Row[] } {
  // The inherited `parentChatId` is dropped on purpose: only the caller can check whether a parent
  // still exists, and trusting an unvalidated id would bake a dangling parent into the restored
  // timeline (the branch tree renders those as orphans). Lineage is always an explicit decision —
  // see `resolveParentChatId`, which the restore route calls first.
  const { id: _id, createdAt: _ca, updatedAt: _ua, parentChatId: _inheritedParent, ...rest } = snapshot.chat
  return {
    chat: {
      ...rest,
      id: opts.chatId,
      title: opts.title,
      // Only set when the resolved parent is a chat that exists — a dangling parent would show up as
      // an orphan in the branch tree (`src/lib/chat/branchTree.ts`).
      ...(opts.parentChatId ? { parentChatId: opts.parentChatId } : {}),
      restoredFromSlotId: opts.slotId,
      createdAt: opts.now,
      updatedAt: opts.now,
    },
    messages: snapshot.messages.map((m) => rekey(m, opts.chatId, newId)),
    objectives: snapshot.objectives.map((o) => rekey(o, opts.chatId, newId)),
    relationshipEvents: snapshot.relationshipEvents.map((e) => rekey(e, opts.chatId, newId)),
    facts: snapshot.facts.map((f) => rekey(f, opts.chatId, newId)),
  }
}
