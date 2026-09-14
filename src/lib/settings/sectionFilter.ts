/**
 * Settings search's matching rule, kept pure (and therefore testable) because two places must agree
 * on it: the filter box in `SettingsView` and the `Section` that decides whether to render at all.
 *
 * Deliberately not fuzzy. The settings surface is ~17 cards, and "does this card contain the words I
 * typed" is a rule the writer can predict. A ranked match would hide the card you meant for reasons
 * you cannot see, which is worse than showing one card too many.
 */

/** Lowercases and flattens separators, so `long-term`, `long_term` and `Long term` all agree. */
function fold(value: string): string {
  return value
    .toLowerCase()
    .replace(/[-_/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A blank (or whitespace-only) query means "no filtering" — the same value the context defaults to. */
export function isFilterActive(query: string): boolean {
  return fold(query).length > 0
}

/**
 * True when every whitespace-separated token of `query` appears somewhere in the card's title or
 * description.
 *
 * All-tokens (AND) rather than any-token (OR), because typing more words has to narrow the list.
 * Widening is the failure mode that matters here: you add a word to disambiguate and the card you
 * were steering away from reappears.
 */
export function matchesSectionFilter(title: string, description: string, query: string): boolean {
  if (!isFilterActive(query)) return true
  const haystack = fold(`${title} ${description}`)
  return fold(query)
    .split(' ')
    .every((token) => haystack.includes(token))
}
