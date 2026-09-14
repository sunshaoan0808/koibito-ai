import type { SaveSlot } from '@/lib/types'

/** A chat's slots, newest first — the shape `SaveSlotsView` renders. */
export interface SlotGroup {
  chatId: string
  /** The source chat's title as snapshotted onto its slots; empty when every slot predates a title. */
  title: string
  slots: SaveSlot[]
}

/**
 * Groups slots under the chat they were taken from, newest slot first in each group and the groups
 * themselves ordered by their most recent save (a slot list is a history — the freshest save is the
 * one a player is looking for).
 *
 * `chatTitle` is snapshotted onto each slot exactly so this survives the source chat being renamed
 * or deleted; a group whose slots carry no title at all is still returned rather than dropped, and
 * the view labels it. Ordering is by `createdAt` with the id breaking ties, so two slots saved in
 * the same millisecond can't swap places between renders.
 */
export function groupSlotsByChat(slots: SaveSlot[]): SlotGroup[] {
  const ordered = [...slots].sort(
    (a, b) => b.createdAt - a.createdAt || String(a.id).localeCompare(String(b.id)),
  )
  const groups = new Map<string, SlotGroup>()
  for (const slot of ordered) {
    const group = groups.get(slot.chatId)
    if (group) {
      group.slots.push(slot)
      if (!group.title) group.title = slot.chatTitle?.trim() ?? ''
    } else {
      groups.set(slot.chatId, { chatId: slot.chatId, title: slot.chatTitle?.trim() ?? '', slots: [slot] })
    }
  }
  return [...groups.values()]
}

/** What a slot actually captured, per the snapshot tables (`server/saveSlots.ts`). */
export function slotCounts(slot: SaveSlot): {
  messages: number
  objectives: number
  relationshipEvents: number
  facts: number
  total: number
} {
  const messages = slot.counts?.messages ?? 0
  const objectives = slot.counts?.objectives ?? 0
  const relationshipEvents = slot.counts?.relationshipEvents ?? 0
  const facts = slot.counts?.facts ?? 0
  return { messages, objectives, relationshipEvents, facts, total: messages + objectives + relationshipEvents + facts }
}

/**
 * Whether a slot carries story state beyond the transcript — the whole point of a slot over "scroll
 * back up". False means the snapshot is effectively a chat copy, which the view says out loud
 * instead of implying the story position was captured.
 */
export function hasStoryState(slot: SaveSlot): boolean {
  const { objectives, relationshipEvents, facts } = slotCounts(slot)
  return objectives + relationshipEvents + facts > 0
}
