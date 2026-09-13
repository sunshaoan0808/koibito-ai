/**
 * Slash commands typed into the chat composer (DEVELOPMENT_PLAN P2-4).
 *
 * Everything in this file is pure: parsing, the command registry, the dice math, and the
 * dispatch all run without React, without the DOM, and without any API client, so the whole
 * surface is unit-testable in the node test environment. The composer owns only the wiring —
 * it recognises a leading "/", hands the line to `runSlashCommand`, and then applies the
 * returned outcome (a toast, a draft fill, a send, or a skip) through plumbing it already has.
 *
 * `/image` is injection-only on purpose: the text-to-image pipeline lands in P2-5 and no image
 * backend is configured on this host, so the command routes to a handler the caller injects
 * when one exists and otherwise answers with an explicit notice. It never calls a backend from
 * this module, and it never fails silently.
 */

/** Source of randomness for `/roll` — injectable, so the dice are deterministic in tests. */
export type SlashRng = () => number

/**
 * What a command asks the UI to do. The composer is the only place that knows how to perform
 * these; the module just decides which one applies.
 *   - `toast` — show a one-line notice, leave the draft untouched (the UI clears the command).
 *   - `fill`  — replace the draft (used to drop a template in for the player to finish).
 *   - `send`  — hand this text to the ordinary send path, as if the player had typed it.
 *   - `skip`  — advance the conversation with no new player line.
 */
export type SlashOutcome =
  | { kind: 'toast'; tone: 'info' | 'error'; message: string }
  | { kind: 'fill'; text: string }
  | { kind: 'send'; text: string }
  | { kind: 'skip' }

export interface SlashCommandDef {
  /** Primary name, lowercase, without the leading slash. */
  name: string
  /** Extra names that resolve to this command. */
  aliases: string[]
  /** Syntax shown in `/help` and on the composer's hint chips. */
  usage: string
  /** One-line description shown in `/help`. */
  summary: string
}

/** The registry, in the order `/help` and the hint chips display it. */
export const SLASH_COMMANDS: SlashCommandDef[] = [
  { name: 'image', aliases: ['img'], usage: '/image <描述>', summary: '按描述生成一张图（生图后端尚未接线）' },
  { name: 'skip', aliases: [], usage: '/skip', summary: '跳过你的回合，让角色把这段继续演下去' },
  { name: 'ooc', aliases: [], usage: '/ooc <内容>', summary: '以戏外旁白发送，不打断角色扮演' },
  { name: 'roll', aliases: ['r'], usage: '/roll [NdM+K]', summary: '掷骰并给出点数，默认一颗二十面骰' },
  { name: 'help', aliases: ['h', 'commands'], usage: '/help', summary: '列出全部可用命令' },
]

/** The draft a hint chip drops into the composer — the command itself, ready for its arguments. */
export function slashCommandDraft(command: SlashCommandDef): string {
  return `/${command.name} `
}

/** Multi-line `/help` body. One usage plus summary per registered command. */
export function slashHelpText(): string {
  return ['可用命令：', ...SLASH_COMMANDS.map((c) => `${c.usage} — ${c.summary}`)].join('\n')
}

// A leading "/" followed by a name, then free-form arguments on the same or following lines.
const COMMAND_PATTERN = /^\/([a-zA-Z][\w-]*)(?:\s+([\s\S]*))?$/

export interface ParsedSlashCommand {
  /** Lowercased name as typed, without the slash. Not necessarily a registered command. */
  name: string
  /** Everything after the name, trimmed. Empty when the command was typed bare. */
  args: string
  /** The trimmed input the command came from. */
  raw: string
}

/**
 * Structural parse: is this line shaped like a slash command at all? Returns `undefined` for
 * ordinary messages, including a bare "/" or a slash followed by punctuation, so the caller
 * can tell "not a command" from "a command I don't know".
 */
export function parseSlashCommand(input: string): ParsedSlashCommand | undefined {
  const raw = input.trim()
  const match = COMMAND_PATTERN.exec(raw)
  if (!match) return undefined
  return { name: match[1].toLowerCase(), args: (match[2] ?? '').trim(), raw }
}

/** True when the draft has been opened as a command — drives the composer's hint chips. */
export function isSlashInput(input: string): boolean {
  return input.trimStart().startsWith('/')
}

export function findSlashCommand(name: string): SlashCommandDef | undefined {
  const needle = name.toLowerCase()
  return SLASH_COMMANDS.find((c) => c.name === needle || c.aliases.includes(needle))
}

export interface ResolvedSlashCommand {
  command: SlashCommandDef
  args: string
  raw: string
}

/**
 * Parse and look the name up in the registry. `undefined` means the line should be treated as
 * an ordinary message — either it isn't slash-shaped, or its name isn't registered. A typo like
 * `/imgae` therefore sends as written rather than being swallowed, which keeps a message that
 * happens to start with a slash (a path, a fraction, emoticon-free markup) working as before.
 */
export function resolveSlashCommand(input: string): ResolvedSlashCommand | undefined {
  const parsed = parseSlashCommand(input)
  if (!parsed) return undefined
  const command = findSlashCommand(parsed.name)
  if (!command) return undefined
  return { command, args: parsed.args, raw: parsed.raw }
}

export interface DiceSpec {
  /** How many dice to roll. */
  count: number
  /** Faces per die. */
  sides: number
  /** Flat bonus added to the sum, may be negative. */
  modifier: number
}

export interface DiceRoll extends DiceSpec {
  /** One face value per die, in roll order. */
  rolls: number[]
  /** Sum of `rolls` plus `modifier`. */
  total: number
}

/** Caps, so a pasted `/roll 9999d1000` can't spin the tab. */
export const MAX_DICE_COUNT = 100
export const MAX_DICE_SIDES = 1000
export const MIN_DICE_SIDES = 2
export const MAX_DICE_MODIFIER = 1000

/** Default when `/roll` is typed bare — one twenty-sided die. */
export const DEFAULT_DICE: DiceSpec = { count: 1, sides: 20, modifier: 0 }

const DICE_PATTERN = /^(\d*)[dD](\d+)(?:([+-])(\d+))?$/
const BARE_SIDES_PATTERN = /^(\d+)$/

function validSides(sides: number): boolean {
  return Number.isInteger(sides) && sides >= MIN_DICE_SIDES && sides <= MAX_DICE_SIDES
}

/**
 * Accepts an empty string (the default die), `NdM`, `dM`, `NdM+K`, `NdM-K`, and a bare number
 * (`20`, read as one twenty-sided die). Returns `undefined` for anything else, so the caller can
 * answer with the usage line instead of rolling nonsense.
 */
export function parseDiceSpec(spec: string): DiceSpec | undefined {
  const trimmed = spec.trim()
  if (!trimmed) return { ...DEFAULT_DICE }

  const bare = BARE_SIDES_PATTERN.exec(trimmed)
  if (bare) {
    const sides = Number(bare[1])
    return validSides(sides) ? { count: 1, sides, modifier: 0 } : undefined
  }

  const match = DICE_PATTERN.exec(trimmed)
  if (!match) return undefined
  const count = match[1] ? Number(match[1]) : 1
  const sides = Number(match[2])
  const modifier = match[4] ? (match[3] === '-' ? -1 : 1) * Number(match[4]) : 0
  if (!Number.isInteger(count) || count < 1 || count > MAX_DICE_COUNT) return undefined
  if (!validSides(sides)) return undefined
  if (Math.abs(modifier) > MAX_DICE_MODIFIER) return undefined
  return { count, sides, modifier }
}

/**
 * Rolls the spec. `rng` defaults to `Math.random` and may return anything in [0, 1]; the sample
 * is clamped so an rng that returns exactly 1 (or a stub that overshoots) can never produce a
 * face above `sides`. Passing a stub makes every roll reproducible in tests.
 */
export function rollDice(spec: DiceSpec, rng: SlashRng = Math.random): DiceRoll {
  const rolls: number[] = []
  for (let i = 0; i < spec.count; i += 1) {
    const sample = Math.min(Math.max(rng(), 0), 0.999999999)
    rolls.push(Math.floor(sample * spec.sides) + 1)
  }
  const total = rolls.reduce((sum, face) => sum + face, 0) + spec.modifier
  return { ...spec, rolls, total }
}

/** `2d6+1`, `d20`, `3d8-2` — the count is dropped when it's 1. */
export function formatDiceNotation(spec: DiceSpec): string {
  const base = `${spec.count > 1 ? spec.count : ''}d${spec.sides}`
  if (spec.modifier === 0) return base
  return `${base}${spec.modifier > 0 ? '+' : '-'}${Math.abs(spec.modifier)}`
}

/** `掷骰 2d6+1：4 + 3 + 1 = 8`, or `掷骰 d20：13` for a single unmodified die. */
export function formatDiceRoll(roll: DiceRoll): string {
  const notation = formatDiceNotation(roll)
  if (roll.rolls.length === 1 && roll.modifier === 0) return `掷骰 ${notation}：${roll.total}`
  const modifierPart = roll.modifier > 0 ? ` + ${roll.modifier}` : roll.modifier < 0 ? ` - ${-roll.modifier}` : ''
  return `掷骰 ${notation}：${roll.rolls.join(' + ')}${modifierPart} = ${roll.total}`
}

export interface SlashCommandHandlers {
  /** Injection point for P2-5's image pipeline; the module never imports an image backend itself. */
  image?: (prompt: string) => SlashOutcome | Promise<SlashOutcome>
  /** Deterministic dice for tests — defaults to `Math.random`. */
  rng?: SlashRng
}

const IMAGE_NOT_WIRED = '生图后端尚未接线（P2-5），这条 /image 已记下但没有执行。'

/** What `/ooc` wraps a line in, matching the asides `text/slop.ts` already recognises. */
const OOC_PREFIX = '(OOC: '

/**
 * Dispatch one line. Returns `undefined` when the line isn't a registered command, which tells
 * the caller to send it as an ordinary message. A handler may be async (the image one will be
 * once P2-5 wires it); the caller resolves the returned value either way.
 */
export function runSlashCommand(
  input: string,
  handlers: SlashCommandHandlers = {},
): SlashOutcome | Promise<SlashOutcome> | undefined {
  const resolved = resolveSlashCommand(input)
  if (!resolved) return undefined
  const { command, args } = resolved

  switch (command.name) {
    case 'help':
      return { kind: 'toast', tone: 'info', message: slashHelpText() }

    case 'image':
      if (!args) return { kind: 'toast', tone: 'error', message: `用法：${command.usage}` }
      if (!handlers.image) return { kind: 'toast', tone: 'info', message: IMAGE_NOT_WIRED }
      return handlers.image(args)

    case 'skip':
      return { kind: 'skip' }

    case 'ooc':
      return args
        ? { kind: 'send', text: `${OOC_PREFIX}${args})` }
        : { kind: 'fill', text: `${OOC_PREFIX})` }

    case 'roll': {
      const spec = parseDiceSpec(args)
      if (!spec) return { kind: 'toast', tone: 'error', message: `掷骰格式无法识别，用法：${command.usage}` }
      return { kind: 'toast', tone: 'info', message: formatDiceRoll(rollDice(spec, handlers.rng ?? Math.random)) }
    }
  }

  return undefined
}
