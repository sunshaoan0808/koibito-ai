import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_DICE,
  SLASH_COMMANDS,
  formatDiceNotation,
  formatDiceRoll,
  isSlashInput,
  parseDiceSpec,
  parseSlashCommand,
  resolveSlashCommand,
  rollDice,
  runSlashCommand,
  slashCommandDraft,
  slashHelpText,
  type SlashOutcome,
} from './slashCommands'

describe('parseSlashCommand', () => {
  it('ignores an ordinary message', () => {
    expect(parseSlashCommand('hello there')).toBeUndefined()
    expect(parseSlashCommand('')).toBeUndefined()
  })

  it('ignores a bare slash and a slash followed by punctuation', () => {
    expect(parseSlashCommand('/')).toBeUndefined()
    expect(parseSlashCommand('/ 2 of us')).toBeUndefined()
    expect(parseSlashCommand('/-')).toBeUndefined()
  })

  it('splits the name from the arguments and trims both', () => {
    expect(parseSlashCommand('  /roll   2d6+1  ')).toEqual({ name: 'roll', args: '2d6+1', raw: '/roll   2d6+1' })
  })

  it('lowercases the name but keeps the arguments as typed', () => {
    expect(parseSlashCommand('/OOC Wait, What?')).toEqual({ name: 'ooc', args: 'Wait, What?', raw: '/OOC Wait, What?' })
  })

  it('gives a bare command empty arguments', () => {
    expect(parseSlashCommand('/help')).toEqual({ name: 'help', args: '', raw: '/help' })
  })

  it('keeps arguments that wrap onto a second line', () => {
    expect(parseSlashCommand('/ooc first line\nsecond line')?.args).toBe('first line\nsecond line')
  })

  it('keeps non-ascii arguments intact', () => {
    expect(parseSlashCommand('/image 雨夜的天台')?.args).toBe('雨夜的天台')
  })
})

describe('isSlashInput', () => {
  it('is true once the draft opens with a slash, ignoring leading spaces', () => {
    expect(isSlashInput('/')).toBe(true)
    expect(isSlashInput('  /roll')).toBe(true)
  })

  it('is false for an empty draft or a mid-message slash', () => {
    expect(isSlashInput('')).toBe(false)
    expect(isSlashInput('either / or')).toBe(false)
  })
})

describe('resolveSlashCommand and the registry', () => {
  it('resolves a registered name', () => {
    expect(resolveSlashCommand('/skip')?.command.name).toBe('skip')
    expect(resolveSlashCommand('/roll 2d6')?.args).toBe('2d6')
  })

  it('resolves aliases to their command', () => {
    expect(resolveSlashCommand('/r d20')?.command.name).toBe('roll')
    expect(resolveSlashCommand('/img a sunset')?.command.name).toBe('image')
    expect(resolveSlashCommand('/h')?.command.name).toBe('help')
    expect(resolveSlashCommand('/commands')?.command.name).toBe('help')
  })

  it('is case-insensitive on the name', () => {
    expect(resolveSlashCommand('/HELP')?.command.name).toBe('help')
  })

  it('leaves an unregistered name unresolved so the line sends as written', () => {
    expect(resolveSlashCommand('/imgae a cat')).toBeUndefined()
    expect(resolveSlashCommand('just a message')).toBeUndefined()
  })

  it('keeps every name and alias unique', () => {
    const seen = new Set<string>()
    for (const command of SLASH_COMMANDS) {
      for (const name of [command.name, ...command.aliases]) {
        expect(seen.has(name)).toBe(false)
        seen.add(name)
      }
    }
  })

  it('makes every registered command reachable by name and alias', () => {
    for (const command of SLASH_COMMANDS) {
      expect(resolveSlashCommand(`/${command.name}`)?.command.name).toBe(command.name)
      for (const alias of command.aliases) {
        expect(resolveSlashCommand(`/${alias}`)?.command.name).toBe(command.name)
      }
    }
  })

  it('drops a ready-to-type draft for the composer hint chips', () => {
    for (const command of SLASH_COMMANDS) {
      expect(slashCommandDraft(command)).toBe(`/${command.name} `)
    }
  })

  it('lists every usage and summary in the help text', () => {
    const help = slashHelpText()
    for (const command of SLASH_COMMANDS) {
      expect(help).toContain(command.usage)
      expect(help).toContain(command.summary)
    }
  })
})

describe('parseDiceSpec', () => {
  it('falls back to the default die for an empty spec', () => {
    expect(parseDiceSpec('')).toEqual(DEFAULT_DICE)
    expect(parseDiceSpec('   ')).toEqual(DEFAULT_DICE)
    expect(parseDiceSpec('')?.sides).toBe(20)
  })

  it('reads count, sides, and modifier', () => {
    expect(parseDiceSpec('2d6')).toEqual({ count: 2, sides: 6, modifier: 0 })
    expect(parseDiceSpec('d8')).toEqual({ count: 1, sides: 8, modifier: 0 })
    expect(parseDiceSpec('1D100')).toEqual({ count: 1, sides: 100, modifier: 0 })
    expect(parseDiceSpec('3d8+2')).toEqual({ count: 3, sides: 8, modifier: 2 })
    expect(parseDiceSpec('3d8-2')).toEqual({ count: 3, sides: 8, modifier: -2 })
  })

  it('reads a bare number as a single die with that many faces', () => {
    expect(parseDiceSpec('20')).toEqual({ count: 1, sides: 20, modifier: 0 })
  })

  it('rejects anything it cannot roll', () => {
    expect(parseDiceSpec('abc')).toBeUndefined()
    expect(parseDiceSpec('2d')).toBeUndefined()
    expect(parseDiceSpec('d')).toBeUndefined()
    expect(parseDiceSpec('0d6')).toBeUndefined()
    expect(parseDiceSpec('2d1')).toBeUndefined()
    expect(parseDiceSpec('101d6')).toBeUndefined()
    expect(parseDiceSpec('2d1001')).toBeUndefined()
    expect(parseDiceSpec('2d6+1001')).toBeUndefined()
    expect(parseDiceSpec('1')).toBeUndefined()
  })
})

describe('rollDice', () => {
  it('rolls the minimum faces when the source returns 0', () => {
    expect(rollDice({ count: 3, sides: 6, modifier: 2 }, () => 0)).toEqual({
      count: 3,
      sides: 6,
      modifier: 2,
      rolls: [1, 1, 1],
      total: 5,
    })
  })

  it('rolls the maximum faces when the source approaches 1', () => {
    expect(rollDice({ count: 2, sides: 20, modifier: 0 }, () => 0.999999)).toEqual({
      count: 2,
      sides: 20,
      modifier: 0,
      rolls: [20, 20],
      total: 40,
    })
  })

  it('clamps a source that overshoots, never landing above the highest face', () => {
    const roll = rollDice({ count: 1, sides: 6, modifier: 0 }, () => 1)
    expect(roll.rolls).toEqual([6])
  })

  it('clamps a negative source to the lowest face', () => {
    const roll = rollDice({ count: 1, sides: 6, modifier: 0 }, () => -3)
    expect(roll.rolls).toEqual([1])
  })

  it('maps each sample to one face, reproducibly', () => {
    // Mid-face samples: 0.5 of a d6 is the 4th face (floor(0.5 * 6) + 1).
    const samples = [0, 0.5, 0.999999]
    let i = 0
    const roll = rollDice({ count: 3, sides: 6, modifier: 1 }, () => samples[i++])
    expect(roll.rolls).toEqual([1, 4, 6])
    expect(roll.total).toBe(12)
  })

  it('never touches Math.random once a source is injected', () => {
    const spy = vi.spyOn(Math, 'random')
    try {
      rollDice({ count: 2, sides: 10, modifier: 0 }, () => 0.25)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('rolls exactly as many dice as asked', () => {
    const roll = rollDice({ count: 7, sides: 4, modifier: 0 }, () => 0.5)
    expect(roll.rolls).toHaveLength(7)
  })
})

describe('dice formatting', () => {
  it('omits the count when there is only one die', () => {
    expect(formatDiceNotation({ count: 1, sides: 20, modifier: 0 })).toBe('d20')
    expect(formatDiceNotation({ count: 2, sides: 6, modifier: 1 })).toBe('2d6+1')
    expect(formatDiceNotation({ count: 3, sides: 8, modifier: -2 })).toBe('3d8-2')
  })

  it('shows a single unmodified die as just the total', () => {
    expect(formatDiceRoll({ count: 1, sides: 20, modifier: 0, rolls: [13], total: 13 })).toBe('掷骰 d20：13')
  })

  it('shows every face and the modifier for a multi-die roll', () => {
    expect(formatDiceRoll({ count: 2, sides: 6, modifier: 1, rolls: [4, 3], total: 8 })).toBe(
      '掷骰 2d6+1：4 + 3 + 1 = 8',
    )
  })

  it('subtracts a negative modifier rather than showing a plus-minus', () => {
    expect(formatDiceRoll({ count: 2, sides: 6, modifier: -1, rolls: [4, 3], total: 6 })).toBe(
      '掷骰 2d6-1：4 + 3 - 1 = 6',
    )
  })
})

describe('runSlashCommand', () => {
  it('leaves ordinary text and unknown commands to the normal send path', () => {
    expect(runSlashCommand('hello')).toBeUndefined()
    expect(runSlashCommand('/imgae a cat')).toBeUndefined()
    expect(runSlashCommand('/')).toBeUndefined()
  })

  it('answers /help with the full command list', () => {
    const outcome = runSlashCommand('/help') as SlashOutcome
    expect(outcome.kind).toBe('toast')
    if (outcome.kind !== 'toast') return
    expect(outcome.tone).toBe('info')
    for (const command of SLASH_COMMANDS) expect(outcome.message).toContain(command.usage)
  })

  it('reports an unwired /image instead of failing silently', () => {
    const outcome = runSlashCommand('/image a rainy rooftop') as SlashOutcome
    expect(outcome.kind).toBe('toast')
    if (outcome.kind !== 'toast') return
    expect(outcome.message).toContain('/image')
    expect(outcome.message).toContain('未接线')
  })

  it('asks for a description when /image is typed bare', () => {
    const outcome = runSlashCommand('/image') as SlashOutcome
    expect(outcome.kind).toBe('toast')
    if (outcome.kind !== 'toast') return
    expect(outcome.tone).toBe('error')
    expect(outcome.message).toContain('/image <描述>')
  })

  it('routes /image to the injected handler once one exists', () => {
    const handler = vi.fn((prompt: string): SlashOutcome => ({ kind: 'send', text: `[image] ${prompt}` }))
    const outcome = runSlashCommand('/image   rain, neon  ', { image: handler })
    expect(handler).toHaveBeenCalledWith('rain, neon')
    expect(outcome).toEqual({ kind: 'send', text: '[image] rain, neon' })
  })

  it('passes an async handler through unchanged', async () => {
    const outcome = await runSlashCommand('/image dusk', { image: async () => ({ kind: 'toast', tone: 'info', message: 'queued' }) })
    expect(outcome).toEqual({ kind: 'toast', tone: 'info', message: 'queued' })
  })

  it('turns /skip into a skip with no player line', () => {
    expect(runSlashCommand('/skip')).toEqual({ kind: 'skip' })
  })

  it('sends /ooc arguments as an in-band aside', () => {
    expect(runSlashCommand('/ooc can we rewind that?')).toEqual({ kind: 'send', text: '(OOC: can we rewind that?)' })
  })

  it('drops the aside template into the draft when /ooc is typed bare', () => {
    expect(runSlashCommand('/ooc')).toEqual({ kind: 'fill', text: '(OOC: )' })
  })

  it('rolls /roll through the injected source', () => {
    const outcome = runSlashCommand('/roll 2d6+1', { rng: () => 0.5 }) as SlashOutcome
    expect(outcome).toEqual({ kind: 'toast', tone: 'info', message: '掷骰 2d6+1：4 + 4 + 1 = 9' })
  })

  it('rolls the default twenty-sided die for a bare /roll', () => {
    const outcome = runSlashCommand('/roll', { rng: () => 0.5 }) as SlashOutcome
    expect(outcome.kind).toBe('toast')
    if (outcome.kind !== 'toast') return
    expect(outcome.message).toBe('掷骰 d20：11')
  })

  it('answers a malformed roll with the usage line', () => {
    const outcome = runSlashCommand('/roll 2d') as SlashOutcome
    expect(outcome.kind).toBe('toast')
    if (outcome.kind !== 'toast') return
    expect(outcome.tone).toBe('error')
    expect(outcome.message).toContain('/roll [NdM+K]')
  })
})
