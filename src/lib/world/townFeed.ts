import {
  PHASES,
  describeWeather,
  getPhaseWeather,
  pickFrom,
  seededFraction,
  type ScheduleEntry,
  type WeatherKind,
} from '@/lib/world/calendar'
import { describeShift, shiftsForDay, type WorkShift } from '@/lib/world/workSchedule'
import { selectSocialReaction, type SocialConnectionLike } from '@/lib/world/ambientEvents'

/**
 * The town feed — what happened while the player was somewhere else.
 *
 * Self-designed: Front Porch has no equivalent (see `docs/design/town-feed.md`). Everything here is
 * derived from primitives the repo already has — the world clock (`calendar.ts`), shift tables
 * (`workSchedule.ts`) and the social graph (`ambientEvents.ts`) — rather than a second simulation
 * engine. No LLM either: phase 1 is template prose, so the whole module is a pure function of its
 * input. That is what makes it assertable and replayable.
 *
 * The feed is "things the player's character could hear about", not "things that happened in front
 * of them". It is deliberately never injected into a present-scene prompt — point-to-point contact is
 * `dating/outreach.ts`'s job, and keeping the two apart is what lets the knowledge fog (see
 * `@/lib/knowledge/claims`) treat the feed as an import rather than an intrusion.
 */

export type FeedKind = 'social' | 'weather' | 'work' | 'rumor' | 'cast'

/** A world-clock coordinate: absolute day plus phase index. Wall-clock time is never used here. */
export interface FeedAt {
  day: number
  phaseIndex: number
}

/** One line of town news. `headline` is for people, `detail` is the one that gets quoted. */
export interface FeedEntry {
  id: string
  worldId: string
  at: FeedAt
  kind: FeedKind
  headline: string
  detail: string
  /** The characters this is about — who can find out is decided by the graph, not by this list. */
  aboutIds: string[]
  /** Who was actually there. No witness means nobody knows, whatever the headline says. */
  witnessedByIds: string[]
  readAt?: number
}

/** What this module needs about a character — narrow on purpose, mirroring `ambientEvents`. */
export interface FeedCharacterLike {
  id: string
  name: string
  /** Shift table from `calendar.ts`. */
  schedule?: ScheduleEntry[]
  /** A by-name social graph, same shape `ambientEvents` uses. */
  connections?: SocialConnectionLike[]
}

export interface TownFeedInput {
  worldId: string
  /** The stretch the player was elsewhere: from the last settlement up to now, in world clock. */
  from: FeedAt
  to: FeedAt
  characters: FeedCharacterLike[]
  /** Cap on kept entries; the newest win. The feed is read by a person, and budgets are real. */
  maxEntries?: number
}

const DEFAULT_MAX_ENTRIES = 40
const PHASES_PER_DAY = PHASES.length
/** Odds that any given world-clock cell has something worth a line. */
const CELL_DENSITY = 0.35

/** Weather that is itself the news. Clear and overcast afternoons are not. */
const NEWSWORTHY_WEATHER: ReadonlySet<WeatherKind> = new Set<WeatherKind>(['rain', 'storm', 'snow', 'fog'])

/**
 * Generate the off-screen feed for a stretch of world clock.
 *
 * Deterministic: the same input always yields the same entries, field for field. Each cell yields at
 * most one entry, and cells are visited in world-clock order, so the result reads chronologically
 * until the cap trims the oldest away.
 */
export function generateTownFeed(input: TownFeedInput): FeedEntry[] {
  const max = Math.max(0, input.maxEntries ?? DEFAULT_MAX_ENTRIES)
  if (max === 0 || input.characters.length === 0) return []

  const fromCell = cellIndex(input.from)
  const toCell = cellIndex(input.to)
  // A backwards range means nothing happened "between" the two points.
  if (toCell < fromCell) return []

  const entries: FeedEntry[] = []
  for (let cell = fromCell; cell <= toCell; cell++) {
    const at: FeedAt = { day: Math.floor(cell / PHASES_PER_DAY), phaseIndex: cell % PHASES_PER_DAY }
    const entry = entryForCell(input.worldId, at, input.characters)
    if (entry) entries.push(entry)
  }

  // Newest win the cap; survivors keep world-clock order so the view can group them by day.
  return entries.slice(Math.max(0, entries.length - max))
}

function entryForCell(worldId: string, at: FeedAt, characters: FeedCharacterLike[]): FeedEntry | undefined {
  const id = `${worldId}:${at.day}:${at.phaseIndex}`

  // A day's first cell carries its most concrete news: who is on shift. One line per day, not four.
  if (at.phaseIndex === 0) {
    const onShift = firstShiftOfDay(characters, at.day)
    if (onShift) {
      const span = describeShift(onShift.shift)
      return {
        id,
        worldId,
        at,
        kind: 'work',
        headline: `${onShift.character.name} is on shift today — ${span}.`,
        detail: `${onShift.character.name} worked ${span} today.`,
        aboutIds: [onShift.character.id],
        witnessedByIds: [onShift.character.id],
      }
    }
  }

  // Sparse on purpose: a line for every cell would be a wall, not a feed.
  if (seededFraction(`town-feed:${id}`) >= CELL_DENSITY) return undefined

  const weather = getPhaseWeather(worldId, at.day, at.phaseIndex)
  const phase = PHASES[at.phaseIndex]

  if (NEWSWORTHY_WEATHER.has(weather)) {
    const witnesses = charactersOnShift(characters, at.day)
    // Nobody was out in it, so there is nothing for anyone to have seen.
    if (witnesses.length === 0) return undefined
    const description = describeWeather(weather)
    return {
      id,
      worldId,
      at,
      kind: 'weather',
      headline: `It was ${description} for most of the ${phase}.`,
      detail: `The ${phase} was ${description}; ${nameList(witnesses)} out in it.`,
      aboutIds: witnesses.map((c) => c.id),
      witnessedByIds: witnesses.map((c) => c.id),
    }
  }

  const actor = pickFrom(orderedBy(characters), `town-feed-actor:${id}`)
  if (!actor?.connections?.length) return undefined
  const reaction = selectSocialReaction({
    characterId: actor.id,
    // A shadow chat id: an off-screen reaction must not read or advance any real chat's state.
    chatId: `off-screen:${worldId}`,
    topic: `the ${phase}`,
    connections: actor.connections,
  })
  if (!reaction) return undefined

  const known = characters.find((c) => c.name === reaction.connectionName)
  // A name nobody registered stays a name. Inventing an id here would be inventing a character —
  // `cast/promote.ts` promotes one when the player actually meets them.
  const involved = known ? [actor.id, known.id] : [actor.id]
  return {
    id,
    worldId,
    at,
    kind: 'social',
    headline: `${actor.name} spent the ${phase} with ${reaction.connectionName} (${reaction.relation}).`,
    detail: `${actor.name} and ${reaction.connectionName} (${reaction.relation}) were together during the ${phase}.`,
    aboutIds: involved,
    witnessedByIds: involved,
  }
}

/** World-clock coordinates to a single index, so a range can be walked cell by cell. */
function cellIndex(at: FeedAt): number {
  return at.day * PHASES_PER_DAY + Math.min(Math.max(at.phaseIndex, 0), PHASES_PER_DAY - 1)
}

/** Sorted by name so the pick never depends on the order the caller happened to pass. */
function orderedBy(characters: FeedCharacterLike[]): FeedCharacterLike[] {
  return [...characters].sort((a, b) => a.name.localeCompare(b.name))
}

function firstShiftOfDay(
  characters: FeedCharacterLike[],
  day: number,
): { character: FeedCharacterLike; shift: WorkShift } | undefined {
  for (const character of orderedBy(characters)) {
    const shift = shiftsForDay(character.schedule, day)[0]
    if (shift) return { character, shift }
  }
  return undefined
}

function charactersOnShift(characters: FeedCharacterLike[], day: number): FeedCharacterLike[] {
  return orderedBy(characters).filter((c) => shiftsForDay(c.schedule, day).length > 0)
}

function nameList(characters: FeedCharacterLike[]): string {
  const names = characters.map((c) => c.name)
  if (names.length === 1) return `${names[0]} was`
  if (names.length === 2) return `${names[0]} and ${names[1]} were`
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length - 2 === 1 ? '' : 's'} were`
}

/** A chat's stored feed state — the only fields settlement cares about. */
export interface FeedSettlementState {
  id: string
  townFeed?: FeedEntry[]
  townFeedSettledAt?: FeedAt
}

export interface SettlementPlan {
  chatId: string
  /** Only what is new since this chat last settled. */
  entries: FeedEntry[]
  settledAt: FeedAt
}

/**
 * Merge entries into a stored feed.
 *
 * Entries are keyed by id, and an id is a world-clock cell (`<worldId>:<day>:<phase>`), so merging
 * the same stretch twice cannot double up. Order is world-clock ascending and the cap drops the
 * oldest, matching what `generateTownFeed` leaves behind.
 */
export function mergeFeedEntries(existing: FeedEntry[], added: FeedEntry[], maxEntries?: number): FeedEntry[] {
  const byId = new Map<string, FeedEntry>()
  for (const entry of [...existing, ...added]) byId.set(entry.id, entry)
  const ordered = [...byId.values()].sort((a, b) => cellIndex(a.at) - cellIndex(b.at))
  const max = Math.max(0, maxEntries ?? DEFAULT_MAX_ENTRIES)
  return ordered.slice(Math.max(0, ordered.length - max))
}

/**
 * What each chat has to generate to bring its feed up to `now`.
 *
 * World-level generation, chat-level storage: the feed belongs to the world, but a chat row is the
 * only home phase 1 can offer it without a schema migration. Only chats that are behind get a plan,
 * and the resume point is exclusive — the settled cell is never regenerated.
 *
 * A chat whose resume point is *ahead* of `now` (a world or timeline switch) is resettled to `now`
 * with nothing generated: winding the clock back must not fabricate news from the future.
 */
export function planSettlement(params: {
  worldId: string
  characters: FeedCharacterLike[]
  now: FeedAt
  chats: FeedSettlementState[]
  maxEntries?: number
}): SettlementPlan[] {
  const plans: SettlementPlan[] = []
  const nowCell = cellIndex(params.now)

  for (const chat of params.chats) {
    const settled = chat.townFeedSettledAt

    if (!settled) {
      // Never settled: start at this day's first cell rather than generating a 112-day backlog.
      plans.push({
        chatId: chat.id,
        entries: generateTownFeed({
          worldId: params.worldId,
          from: { day: params.now.day, phaseIndex: 0 },
          to: params.now,
          characters: params.characters,
          maxEntries: params.maxEntries,
        }),
        settledAt: params.now,
      })
      continue
    }

    const settledCell = cellIndex(settled)
    if (settledCell > nowCell) {
      plans.push({ chatId: chat.id, entries: [], settledAt: params.now })
      continue
    }
    if (settledCell === nowCell) continue

    plans.push({
      chatId: chat.id,
      entries: generateTownFeed({
        worldId: params.worldId,
        from: nextCell(settled),
        to: params.now,
        characters: params.characters,
        maxEntries: params.maxEntries,
      }),
      settledAt: params.now,
    })
  }

  return plans
}

/** The cell after `at` — settlement resumes here, never at the settled cell itself. */
function nextCell(at: FeedAt): FeedAt {
  const cell = cellIndex(at) + 1
  return { day: Math.floor(cell / PHASES_PER_DAY), phaseIndex: cell % PHASES_PER_DAY }
}
