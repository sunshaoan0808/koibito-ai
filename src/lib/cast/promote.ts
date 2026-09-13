import { blankCharacterData } from '@/lib/characters/cardSpec'
import type { CastCandidate } from './detector'

/**
 * P2-6: turn a guest the model invented into a real character, and put them on the chat roster.
 *
 * Kept pure and dependency-injected so the two rules that matter are testable without a network:
 * nothing is created until the writer asks, and the roster only ever gains a character that already
 * exists (an id on the roster with no character behind it is a broken chat).
 */

/** A guest flattened into the shape `charactersApi.create` takes. */
export function candidateToCharacterInput(candidate: CastCandidate): Record<string, unknown> {
  const sample = candidate.sample.trim()
  return {
    // Spread the repo's own blank card rather than writing a partial literal: a hand-rolled card
    // silently drops every field it forgets (the trap `saveCharacter.ts` calls out), and the
    // payload here is untyped enough that nothing would fail loudly.
    card: {
      ...blankCharacterData(candidate.name),
      // The line the guest actually appeared in, `Came from the scene` rather than an invented bio.
      description: sample || candidate.name,
      creator: 'Dynamic cast',
      character_version: '1.0',
      tags: ['dynamic-cast'],
      extensions: {
        dynamic_cast: true,
        first_seen: candidate.firstSeenMessageId,
        mentions: candidate.mentions,
      },
    },
  }
}

/** Add a promoted character to a roster without duplicating it or reordering the existing entries. */
export function withPromotedParticipant(participants: readonly string[], id: string): string[] {
  return participants.includes(id) ? [...participants] : [...participants, id]
}

/** The two writes a promotion performs, injected so the ordering can be asserted in a test. */
export interface PromotionDeps {
  createCharacter: (input: Record<string, unknown>) => Promise<{ id: string }>
  updateChat: (chatId: string, patch: { participants: string[] }) => Promise<unknown>
}

/**
 * Create the character first, then add them to the chat. Deliberately in that order: if creation
 * fails nothing is written to the chat, so a failed promotion leaves no trace in either store.
 */
export async function promoteCandidate(
  candidate: CastCandidate,
  chatId: string,
  participants: readonly string[],
  deps: PromotionDeps,
): Promise<string> {
  const created = await deps.createCharacter(candidateToCharacterInput(candidate))
  await deps.updateChat(chatId, { participants: withPromotedParticipant(participants, created.id) })
  return created.id
}
