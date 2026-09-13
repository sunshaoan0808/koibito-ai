/**
 * Recall-result deduplication.
 *
 * The same event reaches the character's recalled memories more than once — once as the line that
 * recorded it, again as a later restatement of it — and every copy spends prompt budget saying the
 * same thing. This collapses only entries that are *near-identical* to one already held, and
 * deliberately leaves merely-similar ones alone: a memory that restates an earlier one with an
 * extra qualifier is nearly always worth more in two forms than in one, so the policy errs toward
 * keeping it. The bands are:
 *
 *   >= RECALL_DEDUPE_THRESHOLD          the same memory twice; keep the richer (or newer) one.
 *   >= RECALL_SIMILARITY_FLOOR          related but not the same; keep BOTH, and report the pair.
 *   below the floor                     unrelated; no judgement, keep both.
 *
 * Pure: no storage, no globals, no randomness, deterministic for a given input order. Similarity is
 * `textSimilarity` from `@/lib/text/slop`, shared with the anti-parrot check so "same text" means
 * one thing across the app.
 */

import { textSimilarity } from '@/lib/text/slop'

/** Any recalled entry the policy can read — a `ChatFact` satisfies this as-is. */
export interface RecallItem {
  id: string
  text: string
  /** Recency stamp. Only ever a tie-breaker between two near-identical entries. */
  createdAt?: number
  /** 0-1 salience. Only ever a tie-breaker between two near-identical entries. */
  importance?: number
}

/**
 * At or above this similarity the pair is the same memory twice, so one entry is dropped.
 *
 * Measured bands (see dedupe.test.ts): text differing only in casing / markup / spacing /
 * punctuation scores 1.000, a single swapped word ~0.94, and a clause appended to a long fact
 * ~0.89 — all at or above the bar. A short fact with a clause interleaved scores ~0.58 and a
 * lightly-qualified restatement ~0.75; both add detail, so they sit below the bar on purpose and
 * both copies are kept.
 */
export const RECALL_DEDUPE_THRESHOLD = 0.85

/**
 * Pairs at or above this similarity but below `RECALL_DEDUPE_THRESHOLD` are reported in
 * `similarKeptTogether` yet always kept in full. This is the near-miss band: if a change ever makes
 * the dedupe collapse entries that only "rhyme", this list is where the damage shows up.
 */
export const RECALL_SIMILARITY_FLOOR = 0.5

export interface RecallDedupeOptions {
  /** Collapse at or above this similarity. Defaults to `RECALL_DEDUPE_THRESHOLD`. */
  threshold?: number
  /** Report-at-or-above similarity for kept-together pairs. Defaults to `RECALL_SIMILARITY_FLOOR`. */
  floor?: number
}

/** One entry dropped because another already held entry said the same thing. */
export interface RecallRemoval<T> {
  removed: T
  /** The entry that stood in for the removed one. */
  survivor: T
  similarity: number
}

/** A similar-but-kept pair, recorded so a review can confirm nothing useful was eaten. */
export interface RecallKeptPair<T> {
  a: T
  b: T
  similarity: number
}

export interface RecallDedupeResult<T> {
  /** The entries to recall, in the caller's original order (a survivor takes the slot it replaces). */
  kept: T[]
  /** Everything dropped, with what replaced it — the audit trail for "did we over-prune?". */
  removed: RecallRemoval<T>[]
  /** Pairs kept despite similarity, with the score, for spot-checking the threshold. */
  similarKeptTogether: RecallKeptPair<T>[]
}

/** Trimmed length — how much an entry actually says, used as the first tie-breaker. */
function informationSize(item: RecallItem): number {
  return typeof item.text === 'string' ? item.text.trim().length : 0
}

/**
 * Whether a near-identical candidate should replace the entry already held. The one that says more
 * wins; then the higher `importance`; then the newer `createdAt`; on a full tie the entry already
 * held stays, so the outcome never depends on which of two equal entries happened to arrive first.
 */
function candidateOutranks<T extends RecallItem>(candidate: T, incumbent: T): boolean {
  const sizeDelta = informationSize(candidate) - informationSize(incumbent)
  if (sizeDelta !== 0) return sizeDelta > 0
  const importanceDelta = (candidate.importance ?? 0.5) - (incumbent.importance ?? 0.5)
  if (importanceDelta !== 0) return importanceDelta > 0
  return (candidate.createdAt ?? 0) > (incumbent.createdAt ?? 0)
}

/**
 * Drops near-identical recalled entries. Each entry is compared against the ones already kept, in
 * the order given, so a chain of restatements collapses to a single survivor. An entry without
 * usable `text` is passed through untouched rather than silently deleted.
 */
export function dedupeRecalledItems<T extends RecallItem>(
  items: T[],
  opts: RecallDedupeOptions = {},
): RecallDedupeResult<T> {
  const threshold = opts.threshold ?? RECALL_DEDUPE_THRESHOLD
  const floor = opts.floor ?? RECALL_SIMILARITY_FLOOR

  const kept: T[] = []
  const removed: RecallRemoval<T>[] = []
  let similarKeptTogether: RecallKeptPair<T>[] = []

  for (const item of items) {
    if (!item || typeof item.text !== 'string' || !item.text.trim()) {
      if (item) kept.push(item)
      continue
    }

    const comparisons = kept.map((held, index) => ({ held, index, similarity: textSimilarity(item.text, held.text) }))
    const match = comparisons.find((c) => c.similarity >= threshold)

    if (!match) {
      kept.push(item)
      for (const c of comparisons) {
        if (c.similarity >= floor) similarKeptTogether.push({ a: c.held, b: item, similarity: c.similarity })
      }
      continue
    }

    if (candidateOutranks(item, match.held)) {
      removed.push({ removed: match.held, survivor: item, similarity: match.similarity })
      // The survivor keeps the slot of the entry it replaces, so the caller's ordering is otherwise untouched.
      kept[match.index] = item
      // Any near-miss pair recorded against the replaced entry no longer refers to a kept entry.
      similarKeptTogether = similarKeptTogether.filter((pair) => pair.a !== match.held)
    } else {
      removed.push({ removed: item, survivor: match.held, similarity: match.similarity })
    }
  }

  return { kept, removed, similarKeptTogether }
}
