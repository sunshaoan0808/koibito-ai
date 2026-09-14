import type { Lorebook } from '@/lib/characters/cardSpec'
import type { SocialConnectionLike } from '@/lib/world/ambientEvents'
import { PHASES } from '@/lib/world/calendar'

/** The narrow shape of a fact this module needs — `worldinfo/facts.ts` owns the wording. */
export interface ClaimFactLike {
  id: string
  /** Already rendered for the prompt (pass `factContent(f)`); this module never rewrites it. */
  text: string
}

/**
 * Turn a scene's established facts into "who knows this" claims.
 *
 * Phase 2 keeps this derived rather than stored: fact rows already live per chat, so a claim about
 * them costs nothing to recompute and cannot drift out of sync with what the prompt actually said.
 * The moment claims have to travel between chats, `Chat.knowledgeClaims` takes over (zero migration).
 */
export function claimsFromFacts(params: {
  facts: ClaimFactLike[]
  /** Who was there when these were true — the scene's participants. */
  witnesses: string[]
  at: ClaimAt
  scope: { worldId?: string; chatId?: string }
}): KnowledgeClaim[] {
  const witnesses = params.witnesses.filter(Boolean)
  if (witnesses.length === 0) return []
  return params.facts
    .filter((fact) => fact.text.trim().length > 0)
    .map((fact) => ({
      id: `claim:${fact.id}`,
      text: fact.text.trim(),
      factId: fact.id,
      // Keep one entry per character, in the order given, so a claim about a fact is byte-identical
      // however many participants the scene has.
      witnessedByIds: [...new Set(witnesses)],
      toldIds: [],
      at: params.at,
      scope: params.scope,
    }))
}

/** Token cap for the synthetic "What this character knows" book — same order as `FACTS_TOKEN_BUDGET`. */
export const KNOWLEDGE_TOKEN_BUDGET = 200

/**
 * The gate, as a synthetic lorebook — deliberately the same shape `buildFactsLorebook` produces, so
 * it rides the existing insertion and token-budget machinery instead of adding a second prompt path.
 *
 * Returns `[]` rather than an empty book when the character knows nothing: an empty section still
 * costs a header and a slot.
 */
export function knowledgeLorebookFor(params: {
  claims: KnowledgeClaim[]
  characterId: string
  limit?: number
}): Lorebook[] {
  const visible = visibleClaims(params.claims, params.characterId, { limit: params.limit })
  if (visible.length === 0) return []
  return [
    {
      name: 'What this character knows',
      token_budget: KNOWLEDGE_TOKEN_BUDGET,
      entries: visible.map((claim, i) => ({
        id: i,
        keys: [],
        content: claim.text,
        constant: true,
        selective: false,
        // Above the facts book: what someone personally knows outranks a general reminder.
        insertion_order: 300 + i,
        enabled: true,
        activationMode: 'always' as const,
      })),
    },
  ]
}
/**
 * The knowledge fog — who knows what, and how they came to know it.
 *
 * Self-designed: Front Porch has no knowledge-state model at all (see
 * `docs/design/knowledge-fog.md`). Today a fact enters the prompt for everyone present, and for
 * people who were never there, because visibility only goes down to chat / character / world — never
 * to "who, on which timeline, was actually there".
 *
 * This module adds that one dimension and nothing else. It does not add a recall layer: the repo has
 * no `src/lib/memory/` and no embeddings, so "memory" means `chat_facts` plus world info, and a claim
 * is a thin statement over the same facts saying who witnessed it and who was told.
 *
 * Phase 1 is pure judgement — no prompt wiring, no persistence. `'inferred'` is a reserved source
 * that phase 1 never produces: letting a model decide it has inferred something is exactly how
 * omniscience gets back in through the side door.
 */

/** How a character came to know something. Only the first two are produced in phase 1. */
export type ClaimSource = 'witnessed' | 'told' | 'inferred'

/** World-clock coordinate, same as the town feed — cross-chat comparison must never use wall clock. */
export interface ClaimAt {
  day: number
  phaseIndex: number
}

export interface KnowledgeClaim {
  id: string
  /** One sentence of the thing itself. Reuse `facts.ts`'s `factContent()` when it came from a fact. */
  text: string
  /** The existing fact or world-info entry this corresponds to, when there is one. */
  factId?: string
  /** Who was personally there — the source of truth. */
  witnessedByIds: string[]
  /** Who found out second-hand. Grows only through `withTold`. */
  toldIds: string[]
  at: ClaimAt
  scope: { worldId?: string; chatId?: string }
}

/** What this module needs about a character: an id to judge by, a name to match the graph on. */
export interface KnowledgeCharacterLike {
  id: string
  name: string
  connections?: SocialConnectionLike[]
}

/**
 * How this character knows the claim, if at all.
 *
 * `undefined` means they do not know it — which is also what `'inferred'` returns, since phase 1
 * produces no inferred knowledge. Undocumented knowledge stays invisible; that is the whole point.
 *
 * Note the judgement deliberately takes only the character id. The social graph belongs to
 * propagation (`toldTargets`), not to judgement: mixing them is how "everyone present also gets
 * told" sneaks in.
 */
export function sourceFor(claim: KnowledgeClaim, characterId: string): ClaimSource | undefined {
  if (claim.witnessedByIds.includes(characterId)) return 'witnessed'
  if (claim.toldIds.includes(characterId)) return 'told'
  return undefined
}

export function claimVisibleTo(claim: KnowledgeClaim, characterId: string): boolean {
  return sourceFor(claim, characterId) !== undefined
}

/**
 * The claims this character can be shown, newest first and capped.
 *
 * Newest first because the caller is usually assembling a prompt under a budget: if something has to
 * be dropped, it should be the oldest thing, not an arbitrary one.
 */
export function visibleClaims(
  claims: KnowledgeClaim[],
  characterId: string,
  opts: { limit?: number } = {},
): KnowledgeClaim[] {
  const visible = claims
    .filter((claim) => claimVisibleTo(claim, characterId))
    .sort((a, b) => claimCell(b) - claimCell(a))
  if (opts.limit === undefined) return visible
  return visible.slice(0, Math.max(0, opts.limit))
}

/**
 * Who the witnesses could tell, given the graph.
 *
 * Only registered characters can be told: a connection whose name matches nobody is left out rather
 * than invented. "Same world-clock cell" is the caller's condition to enforce — this function only
 * answers "who is reachable from here", so it stays assertable without a clock.
 */
export function toldTargets(claim: KnowledgeClaim, characters: KnowledgeCharacterLike[]): string[] {
  const already = new Set([...claim.witnessedByIds, ...claim.toldIds])
  const reachable = new Set<string>()
  for (const witnessId of claim.witnessedByIds) {
    const witness = characters.find((c) => c.id === witnessId)
    for (const connection of witness?.connections ?? []) {
      const known = characters.find((c) => c.name === connection.name)
      if (known && !already.has(known.id)) reachable.add(known.id)
    }
  }
  return [...reachable].sort()
}

/** A new claim with these characters added to the told list. Immutable: the input is untouched. */
export function withTold(claim: KnowledgeClaim, characterIds: string[]): KnowledgeClaim {
  const told = new Set(claim.toldIds)
  for (const id of characterIds) {
    if (!claim.witnessedByIds.includes(id)) told.add(id)
  }
  return { ...claim, toldIds: [...told].sort() }
}

/**
 * Drop claims older than `before`, then keep the newest `limit`.
 *
 * The prompt is a hot path, so claims must not accumulate without bound. Ordering is world-clock,
 * never wall-clock: a claim made on day 3 must expire relative to day 5, not to when the browser
 * happened to be open.
 */
export function pruneClaims(
  claims: KnowledgeClaim[],
  opts: { before?: ClaimAt; limit?: number } = {},
): KnowledgeClaim[] {
  const beforeCell = opts.before ? claimCellAt(opts.before) : undefined
  const kept = beforeCell === undefined ? [...claims] : claims.filter((claim) => claimCell(claim) >= beforeCell)
  if (opts.limit === undefined) return kept
  return kept.sort((a, b) => claimCell(b) - claimCell(a)).slice(0, Math.max(0, opts.limit))
}

function claimCell(claim: KnowledgeClaim): number {
  return claimCellAt(claim.at)
}

/** World-clock coordinates to one index, using the same phases-per-day the rest of the world uses. */
function claimCellAt(at: ClaimAt): number {
  return at.day * PHASES.length + at.phaseIndex
}
