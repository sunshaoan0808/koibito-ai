import { describe, expect, it } from 'vitest'
import {
  dedupeRecalledItems,
  RECALL_DEDUPE_THRESHOLD,
  RECALL_SIMILARITY_FLOOR,
  type RecallItem,
} from './dedupe'
import { textSimilarity } from '@/lib/text/slop'

let nextId = 1
function memory(text: string, extra: Partial<RecallItem> = {}): RecallItem {
  return { id: `m${nextId++}`, text, ...extra }
}

// Fixtures whose similarity bands were measured against `textSimilarity` before being relied on:
// markup/casing/whitespace variants 1.000, a single swapped word ~0.94, a superset that adds a
// clause ~0.58, a plain paraphrase ~0.65, a light qualifier ~0.75, unrelated ~0.29.
const markupVariant = '*She keeps a photo of her grandmother in her wallet.*'
const plainVariant = 'she keeps a photo of her grandmother in her wallet'

const paraphrase = 'He has a sister named Mira.'
const superset = 'He has a sister named Mira who lives in Osaka.'
const qualified = 'He hates surprises.'
const qualifiedMore = 'He hates surprises, badly.'
const unrelated = 'She hates the smell of lavender candles.'

const longFact =
  'She told him about the letter from her mother that arrived three days late, and about the ones that never came at all, and about what she did with them.'
const longerFact = `${longFact} She kept every one.`

describe('dedupeRecalledItems — collapses near-identical recall', () => {
  it('collapses two entries that differ only in markup and casing', () => {
    const a = memory(markupVariant)
    const b = memory(plainVariant)
    const { kept, removed } = dedupeRecalledItems([a, b])
    expect(kept).toHaveLength(1)
    expect(removed).toHaveLength(1)
    expect(removed[0].similarity).toBe(1)
  })

  it('collapses an exact restatement, reporting what replaced what', () => {
    const first = memory('He always orders the same thing at the cafe on Fridays.', { createdAt: 5 })
    const again = memory('He always orders the same thing at the cafe on Fridays.', { createdAt: 9 })
    const { kept, removed } = dedupeRecalledItems([first, again])
    expect(kept).toHaveLength(1)
    expect(kept[0].id).toBe(again.id)
    expect(removed[0].removed.id).toBe(first.id)
    expect(removed[0].survivor.id).toBe(again.id)
    expect(removed[0].similarity).toBeGreaterThanOrEqual(RECALL_DEDUPE_THRESHOLD)
  })

  it('keeps the entry that says more when the two are otherwise near-identical', () => {
    const shorter = memory(longFact)
    const richer = memory(longerFact)
    const { kept, removed } = dedupeRecalledItems([shorter, richer])
    expect(kept).toHaveLength(1)
    expect(kept[0].id).toBe(richer.id)
    expect(removed[0].removed.id).toBe(shorter.id)
    expect(removed[0].similarity).toBeGreaterThanOrEqual(RECALL_DEDUPE_THRESHOLD)
  })

  it('prefers the newer entry when two near-identical entries are equally informative', () => {
    const text = 'Likes tea but only when it is made with loose leaves.'
    const older = memory(text, { createdAt: 10 })
    const newer = memory(text, { createdAt: 20 })
    expect(dedupeRecalledItems([older, newer]).kept.map((m) => m.id)).toEqual([newer.id])
  })

  it('prefers the more important entry when size and age both tie', () => {
    const text = 'Said she would think about the offer and never brought it up again.'
    const trivial = memory(text, { createdAt: 10, importance: 0.2 })
    const key = memory(text, { createdAt: 10, importance: 0.9 })
    expect(dedupeRecalledItems([trivial, key]).kept.map((m) => m.id)).toEqual([key.id])
  })

  it('keeps the entry that arrived first when size, age and importance all tie', () => {
    const text = 'She still wears the ring he gave her the summer before he left.'
    const first = memory(text, { createdAt: 10 })
    const second = memory(text, { createdAt: 10 })
    const { kept, removed } = dedupeRecalledItems([first, second])
    expect(kept.map((m) => m.id)).toEqual([first.id])
    expect(removed[0].removed.id).toBe(second.id)
  })

  it('collapses a chain of restatements down to one survivor', () => {
    const base = 'She folds the letter twice before she puts it away.'
    const items = [memory(base), memory(`${base}!`), memory(`*${base}*`)]
    const { kept, removed } = dedupeRecalledItems(items)
    expect(kept).toHaveLength(1)
    expect(removed).toHaveLength(2)
  })

  it('takes the slot of the entry it replaces, leaving the rest of the order alone', () => {
    const survivor = memory('The photograph on the shelf is older than either of them remembers.')
    const untouched = memory(unrelated)
    const duplicate = memory('THE PHOTOGRAPH ON THE SHELF IS OLDER THAN EITHER OF THEM REMEMBERS.')
    const { kept } = dedupeRecalledItems([survivor, untouched, duplicate])
    expect(kept.map((m) => m.id)).toEqual([survivor.id, untouched.id])
  })

  it('is idempotent: re-running it on its own output drops nothing', () => {
    const items = [memory(longFact), memory(longerFact), memory(paraphrase), memory(unrelated)]
    const once = dedupeRecalledItems(items)
    const twice = dedupeRecalledItems(once.kept)
    expect(twice.kept.map((m) => m.id)).toEqual(once.kept.map((m) => m.id))
    expect(twice.removed).toEqual([])
  })
})

describe('dedupeRecalledItems — does not over-prune', () => {
  it('keeps a restatement that adds a clause, and reports the near-miss pair', () => {
    const a = memory(paraphrase)
    const b = memory(superset)
    const { kept, removed, similarKeptTogether } = dedupeRecalledItems([a, b])
    expect(kept.map((m) => m.id)).toEqual([a.id, b.id])
    expect(removed).toEqual([])
    expect(similarKeptTogether).toHaveLength(1)
    expect(similarKeptTogether[0].similarity).toBeGreaterThanOrEqual(RECALL_SIMILARITY_FLOOR)
    expect(similarKeptTogether[0].similarity).toBeLessThan(RECALL_DEDUPE_THRESHOLD)
  })

  it('keeps a superset that adds a clause rather than eating the shorter version', () => {
    const plain = memory('He has one sister, Mira.')
    const detailed = memory(superset)
    const { kept, removed } = dedupeRecalledItems([plain, detailed])
    expect(kept.map((m) => m.id)).toEqual([plain.id, detailed.id])
    expect(removed).toEqual([])
  })

  it('keeps a lightly-qualified restatement', () => {
    const a = memory(qualified)
    const b = memory(qualifiedMore)
    const { kept, removed, similarKeptTogether } = dedupeRecalledItems([a, b])
    expect(kept).toHaveLength(2)
    expect(removed).toEqual([])
    expect(similarKeptTogether).toHaveLength(1)
  })

  it('keeps unrelated memories in place and does not even flag them as similar', () => {
    const a = memory(markupVariant)
    const b = memory(unrelated)
    expect(textSimilarity(a.text, b.text)).toBeLessThan(RECALL_SIMILARITY_FLOOR)
    const { kept, removed, similarKeptTogether } = dedupeRecalledItems([a, b])
    expect(kept.map((m) => m.id)).toEqual([a.id, b.id])
    expect(removed).toEqual([])
    expect(similarKeptTogether).toEqual([])
  })

  it('never reports a kept-together pair below the floor', () => {
    const items = [memory(markupVariant), memory(unrelated), memory(qualified), memory(qualifiedMore)]
    const { similarKeptTogether } = dedupeRecalledItems(items)
    for (const pair of similarKeptTogether) expect(pair.similarity).toBeGreaterThanOrEqual(RECALL_SIMILARITY_FLOOR)
  })

  it('passes an entry with no usable text through untouched instead of deleting it', () => {
    const good = memory(markupVariant)
    const blank = memory('   ')
    const { kept, removed } = dedupeRecalledItems([good, blank])
    expect(kept.map((m) => m.id)).toEqual([good.id, blank.id])
    expect(removed).toEqual([])
  })
})

describe('dedupeRecalledItems — options', () => {
  it('returns an empty result for an empty list', () => {
    expect(dedupeRecalledItems([])).toEqual({ kept: [], removed: [], similarKeptTogether: [] })
  })

  it('honours a caller-supplied threshold in both directions', () => {
    const items = () => [memory(paraphrase), memory(superset)]
    // Default: the paraphrase band is deliberately kept.
    expect(dedupeRecalledItems(items()).kept).toHaveLength(2)
    // Loosened: the same pair now collapses.
    expect(dedupeRecalledItems(items(), { threshold: 0.5 }).kept).toHaveLength(1)
    // Tightened: even a punctuation-only restatement in the 1.0 band still collapses,
    expect(dedupeRecalledItems([memory(markupVariant), memory(plainVariant)], { threshold: 0.99 }).kept).toHaveLength(1)
    // ...while a single swapped word no longer counts as a duplicate.
    const oneWord = 'He always orders the same thing at the bar on Fridays.'
    const oneWordOriginal = 'He always orders the same thing at the cafe on Fridays.'
    expect(dedupeRecalledItems([memory(oneWordOriginal), memory(oneWord)], { threshold: 0.99 }).kept).toHaveLength(2)
    expect(dedupeRecalledItems([memory(oneWordOriginal), memory(oneWord)]).kept).toHaveLength(1)
  })

  it('honours a caller-supplied floor for the near-miss report', () => {
    const items = [memory(paraphrase), memory(superset)]
    // Nothing is close enough to report at a floor above the pair's similarity.
    expect(dedupeRecalledItems(items, { floor: 0.7 }).similarKeptTogether).toEqual([])
    expect(dedupeRecalledItems(items, { floor: 0.5 }).similarKeptTogether).toHaveLength(1)
  })

  it('defaults its bands to the exported constants', () => {
    const items = [memory(paraphrase), memory(superset)]
    const defaults = dedupeRecalledItems(items)
    const explicit = dedupeRecalledItems(items, {
      threshold: RECALL_DEDUPE_THRESHOLD,
      floor: RECALL_SIMILARITY_FLOOR,
    })
    expect(defaults.kept.map((m) => m.id)).toEqual(explicit.kept.map((m) => m.id))
    expect(defaults.similarKeptTogether).toHaveLength(explicit.similarKeptTogether.length)
  })
})
