/** 468: Persona ↔ character compatibility nudge (pure core). */

/** Normalizes one free-text interest/like for comparison: lowercase + trim + collapse whitespace. */
export function normalizeInterest(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * Shared interests between a persona and a character (exact match on normalized text).
 * Returns the matched persona-side labels (deduped, in persona order) so callers can explain the bonus.
 */
export function sharedInterests(personaInterests: string[] | undefined, characterLikes: string[] | undefined): string[] {
  const likes = new Set((characterLikes ?? []).map(normalizeInterest).filter(Boolean))
  if (likes.size === 0) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of personaInterests ?? []) {
    const key = normalizeInterest(raw)
    if (!key || seen.has(key) || !likes.has(key)) continue
    seen.add(key)
    out.push(raw.trim())
  }
  return out
}

/** Small starting-affection nudge: +1 per shared interest, capped at +3. Zero when nothing overlaps. */
export function compatibilityBonus(personaInterests: string[] | undefined, characterLikes: string[] | undefined): number {
  return Math.min(sharedInterests(personaInterests, characterLikes).length, 3)
}

/** Applies the bonus to a starter value, clamped to the 0-100 affection band. */
export function applyCompatibilityBonus(
  startingAffection: number,
  personaInterests: string[] | undefined,
  characterLikes: string[] | undefined,
): { affection: number; bonus: number; matched: string[] } {
  const matched = sharedInterests(personaInterests, characterLikes)
  const bonus = Math.min(matched.length, 3)
  return { affection: Math.max(0, Math.min(100, Math.round(startingAffection + bonus))), bonus, matched }
}
