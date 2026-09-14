import { describe, expect, it } from 'vitest'
import { PluginRegistry } from './registry'
import type { PromptSectionId } from './types'

const base = (): Record<PromptSectionId, string> => ({
  system: 'S',
  summary: '',
  world: 'W',
  description: 'D',
  participants: '',
  persona: 'P',
  examples: '',
})

const ctx = { sections: ['system'] as PromptSectionId[], chatId: 'c1' }

describe('PluginRegistry', () => {
  it('refuses a hook whose capability was not declared', () => {
    const registry = new PluginRegistry()
    expect(() =>
      registry.register({
        manifest: { id: 'sneaky', name: 'Sneaky', version: '1.0.0', capabilities: [] },
        prompt: [{ id: 'p', transform: (_section, text) => `${text}!` }],
      }),
    ).toThrow(/prompt:write/)
  })

  it('refuses a command that collides with a built-in, or with another plugin', () => {
    const registry = new PluginRegistry()
    const manifest = (id: string) => ({
      id,
      name: id,
      version: '1.0.0',
      capabilities: ['commands' as const],
    })
    expect(() =>
      registry.register({
        manifest: manifest('a'),
        commands: [{ name: 'roll', description: '', run: () => ({}) }],
      }),
    ).toThrow(/built-in/)

    registry.register({
      manifest: manifest('b'),
      commands: [{ name: 'weather', description: '', run: () => ({}) }],
    })
    expect(() =>
      registry.register({
        manifest: manifest('c'),
        commands: [{ name: 'weather', description: '', run: () => ({}) }],
      }),
    ).toThrow(/another plugin/)
  })

  it('isolates a throwing hook, counts it, and still applies the others', () => {
    const registry = new PluginRegistry()
    registry.register({
      manifest: { id: 'good', name: 'Good', version: '1.0.0', capabilities: ['prompt:write'], order: 1 },
      prompt: [{ id: 'ok', transform: (_section, text) => `${text} [good]` }],
    })
    registry.register({
      manifest: { id: 'bad', name: 'Bad', version: '1.0.0', capabilities: ['prompt:write'], order: 2 },
      prompt: [
        {
          id: 'boom',
          transform: () => {
            throw new Error('boom')
          },
        },
      ],
    })
    registry.setGrant('good', 'prompt:write', true)
    registry.setGrant('bad', 'prompt:write', true)

    const result = registry.applyPromptHooks(base(), ctx)
    expect(result.failed).toBe(1) // one broken hook…
    expect(result.sections.system).toBe('S [good]')
    const badStats = registry.stats().find((entry) => entry.pluginId === 'bad')
    expect(badStats?.calls).toBe(4) // …called once per non-empty section,
    expect(badStats?.failed).toBe(4) // and it threw on every one of them
    expect(registry.stats().find((entry) => entry.pluginId === 'good')?.failed).toBe(0)
  })

  it('orders write hooks by manifest.order, then by plugin id', () => {
    const registry = new PluginRegistry()
    const order: Array<[string, number]> = [
      ['zeta', 5],
      ['alpha', 5],
      ['first', 1],
    ]
    for (const [id, position] of order) {
      registry.register({
        manifest: { id, name: id, version: '1.0.0', capabilities: ['prompt:write'], order: position },
        prompt: [{ id, transform: (_section, text) => `${text}<${id}>` }],
      })
      registry.setGrant(id, 'prompt:write', true)
    }
    expect(registry.applyPromptHooks(base(), ctx).sections.system).toBe('S<first><alpha><zeta>')
  })

  // The design doc's mandatory negative: without the grant the edit must be inert — and the hook
  // must not even be called. "Ran but was discarded" would still leak the prompt to the plugin.
  it('never calls a write hook that was not granted', () => {
    const registry = new PluginRegistry()
    const calls: string[] = []
    registry.register({
      manifest: { id: 'demo', name: 'Demo', version: '1.0.0', capabilities: ['prompt:write'] },
      prompt: [
        {
          id: 'p',
          transform: (section, text) => {
            calls.push(section)
            return `${text} [edited]`
          },
        },
      ],
    })

    const baseline = base()
    const blocked = registry.applyPromptHooks(baseline, ctx)
    expect(blocked.sections).toEqual(baseline)
    expect(blocked.failed).toBe(0)
    expect(calls).toEqual([])

    registry.setGrant('demo', 'prompt:write', true)
    expect(registry.applyPromptHooks(baseline, ctx).sections.system).toBe('S [edited]')
    // Every non-empty section goes through the hook; blank ones are skipped, not passed in.
    expect([...calls].sort()).toEqual(['description', 'persona', 'system', 'world'])
  })

  it('runs observers only with prompt:read, and they never write', () => {
    const registry = new PluginRegistry()
    const seen: number[] = []
    registry.register({
      manifest: { id: 'watcher', name: 'Watcher', version: '1.0.0', capabilities: ['prompt:read'] },
      prompt: [
        {
          id: 'o',
          observe: (context) => {
            seen.push(context.sections.length)
          },
        },
      ],
    })

    expect(registry.runPromptObservers(ctx)).toBe(0)
    expect(seen).toEqual([1])
    expect(registry.applyPromptHooks(base(), ctx).sections.system).toBe('S')
  })

  it('keeps every section the hooks did nothing with exactly as it was', () => {
    const registry = new PluginRegistry()
    registry.register({
      manifest: { id: 'toucher', name: 'Toucher', version: '1.0.0', capabilities: ['prompt:write'], order: 1 },
      // Empty sections are skipped, not passed through the hook — a blank section must stay blank.
      prompt: [{ id: 't', transform: (section, text) => (section === 'world' ? `${text} (touched)` : undefined) }],
    })
    registry.setGrant('toucher', 'prompt:write', true)

    const result = registry.applyPromptHooks(base(), ctx)
    expect(result.sections.world).toBe('W (touched)')
    expect(result.sections.system).toBe('S')
    expect(result.sections.summary).toBe('')
  })
})
