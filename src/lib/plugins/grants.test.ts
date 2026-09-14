import { describe, expect, it, vi } from 'vitest'
import { applyGrants, hasGrant, loadGrants, saveGrants, withGrant } from './grants'
import { PluginRegistry } from './registry'
import type { PromptSectionId } from './types'

/**
 * vitest runs in the `node` environment here, so `localStorage` is stubbed. What these tests are
 * about is the read/write *contract* — round-trip, corrupt input, failures swallowed — not the
 * browser's own storage behaviour.
 */
function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  return store
}

const sections = (): Record<PromptSectionId, string> =>
  ({ system: 'S', summary: '', world: '', description: '', participants: '', persona: '', examples: '' })

describe('plugin grants (phase 3: a toggle survives a reload)', () => {
  it('round-trips a grant through storage', () => {
    const store = stubStorage()
    saveGrants({ 'harbour-tides': { 'prompt:write': true } })
    expect(store.get('rp.pluginGrants')).toBe('{"harbour-tides":{"prompt:write":true}}')
    expect(loadGrants()).toEqual({ 'harbour-tides': { 'prompt:write': true } })
  })

  it('treats corrupt or absent storage as "nothing granted" instead of throwing', () => {
    stubStorage({ 'rp.pluginGrants': 'not json{' })
    expect(loadGrants()).toEqual({})

    stubStorage({ 'rp.pluginGrants': '"a string, not a map"' })
    expect(loadGrants()).toEqual({})

    stubStorage()
    expect(loadGrants()).toEqual({})
  })

  it('keeps a failed write from breaking the toggle', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
    })
    expect(() => saveGrants({ a: { net: true } })).not.toThrow()
  })

  it('flips one toggle without disturbing the rest, and never mutates its input', () => {
    const before = { a: { 'prompt:write': true }, b: { net: true } }
    const after = withGrant(before, 'b', 'net', false)
    expect(after).toEqual({ a: { 'prompt:write': true }, b: { net: false } })
    expect(before.b.net).toBe(true)
    expect(hasGrant(after, 'a', 'prompt:write')).toBe(true)
    expect(hasGrant(after, 'b', 'net')).toBe(false)
  })

  // Asserted through behaviour: a replayed grant must be the difference between "does nothing" and
  // "edits the prompt", which is the only definition of a grant that matters.
  it('replays stored grants into a fresh registry on boot', () => {
    const registry = new PluginRegistry()
    registry.register({
      manifest: { id: 'demo', name: 'Demo', version: '1.0.0', capabilities: ['prompt:write'] },
      prompt: [{ id: 'p', transform: (_section, text) => `${text}!` }],
    })

    const before = registry.applyPromptHooks(sections(), { sections: ['system'] })
    expect(before.sections.system).toBe('S')

    applyGrants(registry, { demo: { 'prompt:write': true } })
    expect(registry.applyPromptHooks(sections(), { sections: ['system'] }).sections.system).toBe('S!')
  })

  it('ignores stored grants for capabilities nobody can grant', () => {
    const registry = new PluginRegistry()
    registry.register({
      manifest: { id: 'reader', name: 'Reader', version: '1.0.0', capabilities: ['prompt:read'] },
      prompt: [{ id: 'o', observe: () => {} }],
    })
    applyGrants(registry, { reader: { net: true } })
    // `net` was replayed, but nothing about an observer changes — the point is that no throw occurs
    // and `prompt:read` (not grantable) was never pushed.
    expect(registry.applyPromptHooks(sections(), { sections: ['system'] }).sections.system).toBe('S')
  })
})
