import { describe, expect, it } from 'vitest'
import { isFilterActive, matchesSectionFilter } from './sectionFilter'

describe('isFilterActive', () => {
  it('treats blank and whitespace-only queries as off', () => {
    expect(isFilterActive('')).toBe(false)
    expect(isFilterActive('   ')).toBe(false)
    expect(isFilterActive('\t\n')).toBe(false)
  })

  it('turns on for any real content', () => {
    expect(isFilterActive('memory')).toBe(true)
    expect(isFilterActive('  memory  ')).toBe(true)
  })
})

describe('matchesSectionFilter', () => {
  it('renders every card while the filter is off', () => {
    expect(matchesSectionFilter('Objectives', 'Goals the character pursues', '')).toBe(true)
    expect(matchesSectionFilter('Objectives', 'Goals the character pursues', '   ')).toBe(true)
  })

  it('matches a substring of the title, case-insensitively', () => {
    expect(matchesSectionFilter('Long-term memory', 'Recall that survives', 'memory')).toBe(true)
    expect(matchesSectionFilter('Long-term memory', 'Recall that survives', 'MEMORY')).toBe(true)
  })

  it('matches the description too, not just the title', () => {
    expect(matchesSectionFilter('Objectives', 'Goals the character pursues', 'pursues')).toBe(true)
  })

  it('folds separators, so a spaced query finds a hyphenated title', () => {
    expect(matchesSectionFilter('Long-term memory', '', 'long term')).toBe(true)
    expect(matchesSectionFilter('Quick replies', '', 'quick-replies')).toBe(true)
    expect(matchesSectionFilter('VN assists', '', 'vn/assists')).toBe(true)
  })

  it('requires every token, so extra words narrow instead of widening', () => {
    expect(matchesSectionFilter('Long-term memory', 'Recall that survives', 'long memory')).toBe(true)
    expect(matchesSectionFilter('Long-term memory', 'Recall that survives', 'memory survives')).toBe(true)
    // 'sampler' appears nowhere on this card — adding it has to drop the card, not keep it.
    expect(matchesSectionFilter('Long-term memory', 'Recall that survives', 'long sampler')).toBe(false)
  })

  it('ignores token order', () => {
    expect(matchesSectionFilter('Long-term memory', '', 'memory long')).toBe(true)
  })

  it('returns false when nothing matches', () => {
    expect(matchesSectionFilter('Objectives', 'Goals', 'koboldcpp')).toBe(false)
  })

  it('cannot match an absent description', () => {
    expect(matchesSectionFilter('Presets', '', 'presets')).toBe(true)
    expect(matchesSectionFilter('Presets', '', 'described elsewhere')).toBe(false)
  })
})
