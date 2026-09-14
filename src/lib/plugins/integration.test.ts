import { describe, expect, it } from 'vitest'
import type { CharacterCardData } from '@/lib/characters/cardSpec'
import { getInstructTemplate } from '@/lib/prompt/instructTemplates'
import { buildPrompt, type PromptBuildInput } from '@/lib/prompt/builder'
import { allSlashCommandDefs, runSlashCommand, slashHelpText } from '@/lib/chat/slashCommands'
import { PluginRegistry, pluginRegistry } from './registry'

const template = getInstructTemplate('plain-chat')

function character(overrides: Partial<CharacterCardData> & { name: string }): CharacterCardData {
  return {
    description: '',
    personality: '',
    scenario: '',
    first_mes: '',
    mes_example: '',
    ...overrides,
  }
}

function baseInput(plugins: PluginRegistry, overrides: Partial<PromptBuildInput> = {}): PromptBuildInput {
  return {
    character: character({ name: 'Aria', description: 'A lighthouse keeper.', mes_example: 'Keep the lamp lit.' }),
    personaName: 'You',
    personaDescription: '',
    worldDescription: 'The harbour town of Vell.',
    history: [],
    lorebooks: [],
    template,
    contextBudget: 4000,
    scanDepth: 8,
    countTokens: async (text: string) => Math.ceil(text.length / 4),
    plugins,
    ...overrides,
  }
}

/** The example the design doc asks for: a plugin edits one section, in-repo, engine untouched. */
function harbourNote(registry: PluginRegistry): void {
  registry.register({
    manifest: { id: 'harbour-note', name: 'Harbour note', version: '1.0.0', capabilities: ['prompt:write'] },
    prompt: [
      {
        id: 'append',
        transform: (section, text) =>
          section === 'world' ? `${text}\nTide tables are posted at the inn.` : undefined,
      },
    ],
  })
}

describe('plugins × buildPrompt (phase 2 acceptance)', () => {
  it('lets a plugin edit a section without the engine knowing about it', async () => {
    const registry = new PluginRegistry()
    harbourNote(registry)
    registry.setGrant('harbour-note', 'prompt:write', true)

    const { prompt } = await buildPrompt(baseInput(registry))
    expect(prompt).toContain('Tide tables are posted at the inn.')
    expect(prompt).toContain('The harbour town of Vell.')
  })

  // The design doc's strongest assertion: with the plugin disabled the result is not "close to" the
  // baseline, it *is* the baseline. Compared as serialised bytes, not by looking for a substring.
  it('is byte-identical to the baseline when the plugin was registered but never granted', async () => {
    const registry = new PluginRegistry()
    harbourNote(registry)
    const blocked = await buildPrompt(baseInput(registry))
    const baseline = await buildPrompt(baseInput(new PluginRegistry()))
    expect(JSON.stringify(blocked)).toBe(JSON.stringify(baseline))
  })

  it('is byte-identical when nothing is registered at all', async () => {
    const withEmpty = await buildPrompt(baseInput(new PluginRegistry()))
    const withInjected = await buildPrompt(baseInput(new PluginRegistry(), { plugins: undefined }))
    expect(JSON.stringify(withInjected)).toBe(JSON.stringify(withEmpty))
  })

  it('keeps a throwing hook out of the way of the rest of the prompt', async () => {
    const registry = new PluginRegistry()
    registry.register({
      manifest: { id: 'broken', name: 'Broken', version: '1.0.0', capabilities: ['prompt:write'] },
      prompt: [
        {
          id: 'boom',
          transform: () => {
            throw new Error('boom')
          },
        },
      ],
    })
    registry.setGrant('broken', 'prompt:write', true)

    const { prompt } = await buildPrompt(baseInput(registry))
    expect(prompt).toContain('The harbour town of Vell.')
  })
})

describe('plugins × slash commands (phase 2)', () => {
  // The slash layer reads the app-wide registry by design, so this block registers into it once,
  // under a name nothing else uses, and drives the error branch through an argument instead of a
  // second registration (re-registering would throw).
  pluginRegistry.register({
    manifest: { id: 'test-weather', name: 'Test weather', version: '1.0.0', capabilities: ['commands'] },
    commands: [
      {
        name: 'test-weather',
        description: '查一下镇上的天气',
        run: (args) => {
          if (args === 'boom') throw new Error('nope')
          return { insert: `晴朗 ${args}`.trim() }
        },
      },
    ],
  })

  it('shows a plugin command in the lookup and in /help, like a built-in', () => {
    expect(allSlashCommandDefs().some((command) => command.name === 'test-weather')).toBe(true)
    expect(slashHelpText()).toContain('/test-weather')
    expect(slashHelpText()).toContain('查一下镇上的天气')
  })

  it('routes a plugin command through the same outcome pipeline', () => {
    expect(runSlashCommand('/test-weather 明天')).toEqual({ kind: 'fill', text: '晴朗 明天' })
  })

  it('contains a plugin command that throws', () => {
    expect(runSlashCommand('/test-weather boom')).toEqual({ kind: 'toast', tone: 'error', message: 'nope' })
  })

  it('still ignores a name nobody registered', () => {
    expect(runSlashCommand('/imgae')).toBeUndefined()
  })
})
