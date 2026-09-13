/**
 * A deterministic, shared "living world" clock. Everything here is a pure function of an absolute
 * day number (plus a seed id for weather/mood) — only `WorldCard.currentDay`/`currentPhaseIndex`
 * are actually stored; season, weekday, holiday, weather, and mood-of-day are all recomputed on
 * demand and always reproducible for the same inputs. Weather goes one level deeper than the date:
 * each phase of a day drifts from that day's own pick (`getPhaseWeather`), and tomorrow's outlook is
 * derived from the target day itself (`getTomorrowForecast`) — never from a clock read or an RNG.
 */

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export type Season = (typeof SEASONS)[number]

export const DAYS_PER_SEASON = 28
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS.length // 112

export const PHASES = ['morning', 'afternoon', 'evening', 'night'] as const
export type DayPhase = (typeof PHASES)[number]

export const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export type Weekday = (typeof WEEKDAYS)[number]

/** One fixed holiday per season, placed at each season's midpoint (day 14 of 28). */
const HOLIDAYS: Record<Season, { name: string; dayOfSeason: number }> = {
  spring: { name: 'First Bloom', dayOfSeason: 14 },
  summer: { name: 'Midsummer Night', dayOfSeason: 14 },
  autumn: { name: 'Lantern Festival', dayOfSeason: 14 },
  winter: { name: 'Long Night', dayOfSeason: 14 },
}

export interface CalendarInfo {
  /** Absolute day count, wrapped into the 112-day year. */
  day: number
  season: Season
  /** 1-28. */
  dayOfSeason: number
  weekday: Weekday
  holiday?: string
}

export function getCalendarInfo(day: number): CalendarInfo {
  const wrapped = ((day % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR
  const seasonIndex = Math.floor(wrapped / DAYS_PER_SEASON)
  const season = SEASONS[seasonIndex]
  const dayOfSeason = (wrapped % DAYS_PER_SEASON) + 1
  // Every season starts on a Monday (28 is divisible by 7), so this realigns each season, not just once a year.
  const weekday = WEEKDAYS[(dayOfSeason - 1) % 7]
  const holiday = HOLIDAYS[season].dayOfSeason === dayOfSeason ? HOLIDAYS[season].name : undefined
  return { day: wrapped, season, dayOfSeason, weekday, holiday }
}

/** Every named holiday's fixed day-of-year (0–111), derived from `HOLIDAYS` — exported so a
 *  calendar view can list them without recomputing the season/day math itself. */
export const ALL_HOLIDAYS: { name: string; dayOfYear: number }[] = SEASONS.map((season, i) => ({
  name: HOLIDAYS[season].name,
  dayOfYear: i * DAYS_PER_SEASON + (HOLIDAYS[season].dayOfSeason - 1),
}))

/** Days from `day` until the next occurrence of `targetDayOfYear` (a day-of-year, 0–111) — `0`
 *  means today, wrapping forward through the year otherwise. Shared by birthdays, commitment
 *  anniversaries, and holidays alike — each is just "a day-of-year to count down to." */
export function daysUntilAnnualDate(day: number, targetDayOfYear: number): number {
  const todayOfYear = getCalendarInfo(day).day
  return (targetDayOfYear - todayOfYear + DAYS_PER_YEAR) % DAYS_PER_YEAR
}

export const WEATHER_KINDS = ['clear', 'rain', 'storm', 'overcast', 'snow', 'wind', 'fog'] as const
export type WeatherKind = (typeof WEATHER_KINDS)[number]

/**
 * A season's ordered weather cycle. Repeating an entry biases the pick toward it — a cheap weighting
 * without a separate weight table — and the *order* is what the phase walk below steps along, so the
 * only kinds a day can drift between are cycle neighbours (see `getPhaseWeather`).
 */
export const SEASON_WEATHER_CYCLE: Record<Season, readonly WeatherKind[]> = {
  spring: ['clear', 'rain', 'rain', 'overcast', 'wind'],
  summer: ['clear', 'clear', 'clear', 'storm', 'overcast'],
  autumn: ['clear', 'wind', 'rain', 'fog', 'overcast'],
  winter: ['clear', 'clear', 'snow', 'storm', 'fog'],
}

const WEATHER_DESCRIPTIONS: Record<WeatherKind, string> = {
  clear: 'clear and mild',
  rain: 'raining steadily',
  storm: 'stormy',
  overcast: 'gray and overcast',
  snow: 'snowing',
  wind: 'blustery and windy',
  fog: 'thick with fog',
}

export function describeWeather(kind: WeatherKind): string {
  return WEATHER_DESCRIPTIONS[kind]
}

/** A tiny deterministic hash -> [0,1) generator, so the same seed always produces the same pick. */
export function seededFraction(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 100000) / 100000
}

/** Exported for `world/ambientEvents.ts` — the same "deterministic seeded pick" primitive, shared rather than re-implemented. */
export function pickFrom<T>(options: T[], seed: string): T {
  const idx = Math.min(options.length - 1, Math.floor(seededFraction(seed) * options.length))
  return options[idx]
}

/** Index into a bounded weather cycle for a seed — the same primitive `pickFrom` uses, split out so
 *  the phase walk can start from the day's own pick rather than re-rolling it. */
function cycleIndex(cycle: readonly WeatherKind[], seed: string): number {
  return Math.min(cycle.length - 1, Math.floor(seededFraction(seed) * cycle.length))
}

/** Deterministic per-world-per-day weather — same day always reads the same, browsable ahead of time.
 *  This is the day's *anchor* kind: its morning phase reads exactly this, and the rest of the day
 *  drifts from here (see `getPhaseWeather`). */
export function getWeather(worldId: string, day: number): WeatherKind {
  const info = getCalendarInfo(day)
  const cycle = SEASON_WEATHER_CYCLE[info.season]
  return cycle[cycleIndex(cycle, `weather:${worldId}:${info.day}`)]
}

/** How likely a phase is to simply hold the previous phase's weather. Well above half on purpose:
 *  a day should read as weather *changing* once or twice, not as four independent rolls that happen
 *  to be adjacent — that keeps the phase-to-phase walk legible in the prompt. */
const PHASE_HOLD_CHANCE = 0.55

/**
 * Hour-scale (phase-scale) weather: the morning phase is exactly the day's own `getWeather`, and each
 * later phase either holds or drifts one rung along the season's cycle. Deterministic on
 * `(worldId, day, phaseIndex)` alone — no clock reads, no RNG — so the same moment always reads the
 * same, and consecutive phases are never more than one cycle step apart.
 */
export function getPhaseWeather(worldId: string, day: number, phaseIndex: number): WeatherKind {
  const info = getCalendarInfo(day)
  const cycle = SEASON_WEATHER_CYCLE[info.season]
  let idx = cycleIndex(cycle, `weather:${worldId}:${info.day}`)
  // NaN (an unset phase index) fails the comparison below and falls back to the morning anchor.
  const lastStep = clampPhaseIndex(phaseIndex)
  for (let step = 1; step <= lastStep; step++) {
    if (seededFraction(`weather-hold:${worldId}:${info.day}:${step}`) < PHASE_HOLD_CHANCE) continue
    // Direction is its own seeded coin, and the ends of the cycle bounce inward rather than wrapping —
    // winter never drifts from snow straight into a wind-free heatwave.
    const dir = seededFraction(`weather-drift:${worldId}:${info.day}:${step}`) < 0.5 ? -1 : 1
    idx = Math.max(0, Math.min(cycle.length - 1, idx + dir))
  }
  return cycle[idx]
}

export interface PhaseWeatherSlice {
  phase: DayPhase
  phaseIndex: number
  kind: WeatherKind
  /** The English, model-facing description (`describeWeather`) — what a UI or prompt shows. */
  description: string
}

/** The whole day at phase granularity, morning first — the strip the world clock renders and what
 *  the continuity tests walk. */
export function getDayPhaseWeather(worldId: string, day: number): PhaseWeatherSlice[] {
  return PHASES.map((phase, phaseIndex) => {
    const kind = getPhaseWeather(worldId, day, phaseIndex)
    return { phase, phaseIndex, kind, description: describeWeather(kind) }
  })
}

/** Whether two kinds sit on the same or a neighbouring rung of a season's cycle — the only change
 *  `getPhaseWeather` is allowed to make between consecutive phases. A repeated entry in the cycle
 *  counts at every index it occupies. */
export function isWeatherDrift(season: Season, from: WeatherKind, to: WeatherKind): boolean {
  const cycle = SEASON_WEATHER_CYCLE[season]
  const fromIdx = cycle.flatMap((kind, i) => (kind === from ? [i] : []))
  const toIdx = cycle.flatMap((kind, i) => (kind === to ? [i] : []))
  return fromIdx.some((a) => toIdx.some((b) => Math.abs(a - b) <= 1))
}

/** How often a next-day forecast should actually match the day it named. High enough to be worth
 *  acting on, below 1 so an occasional forecast is honestly wrong — a foresight that is never wrong
 *  is not a forecast, it is a spoiler. */
const FORECAST_HIT_CHANCE = 0.8

export interface WeatherForecast {
  /** The day being forecast, already wrapped into the year — so `day + 1` past the year's end reads
   *  as day 0, exactly as the clock's own rollover will. */
  day: number
  kind: WeatherKind
  description: string
  /** 0-1, deterministic per world/day — a display hint for how much to trust this call, not a live
   *  measurement. */
  confidence: number
}

/**
 * Tomorrow's outlook, asked for from `day`. Deterministic on `(worldId, day)` and mostly right by
 * construction: usually the kind the day will actually read as in the morning, otherwise a single
 * cycle step off — the classic "close, but the weather turned". Callers asking from the same day
 * always get the same forecast; the same *target* day forecast from two different todays may
 * legitimately differ, which is what makes it a forecast rather than a lookup.
 */
export function getTomorrowForecast(worldId: string, day: number): WeatherForecast {
  const target = getCalendarInfo(day + 1)
  const cycle = SEASON_WEATHER_CYCLE[target.season]
  const actualIdx = cycleIndex(cycle, `weather:${worldId}:${target.day}`)
  const confident = seededFraction(`forecast:${worldId}:${getCalendarInfo(day).day}:${target.day}`) < FORECAST_HIT_CHANCE
  let idx = actualIdx
  if (!confident) {
    const dir = seededFraction(`forecast-drift:${worldId}:${target.day}`) < 0.5 ? -1 : 1
    idx = Math.max(0, Math.min(cycle.length - 1, actualIdx + dir))
  }
  const kind = cycle[idx]
  // A confident call still reads as confident weather, not as a promise: the band stays under 1.
  const confidence = confident
    ? 0.82 + seededFraction(`forecast-confidence:${worldId}:${target.day}`) * 0.13
    : 0.55 + seededFraction(`forecast-confidence:${worldId}:${target.day}`) * 0.13
  return { day: target.day, kind, description: describeWeather(kind), confidence }
}

const MOODS = [
  'upbeat',
  'tired',
  'a little anxious',
  'content',
  'irritable',
  'wistful',
  'restless',
  'unusually cheerful',
]

/** Deterministic per-character-per-day mood — nudges tone, never dictates it (see ROADMAP.md 10a). */
export function getMoodOfDay(characterId: string, day: number): string {
  const info = getCalendarInfo(day)
  return pickFrom(MOODS, `mood:${characterId}:${info.day}`)
}

/** Whether a phase index reads as "night" for lighting purposes (evening counts as night too — dusk
 *  is closer to a night scene than a daylit one). Undefined/out-of-range defaults to day, matching a
 *  world that's never advanced its clock. */
export function isNightPhase(phaseIndex: number | undefined): boolean {
  const phase = PHASES[phaseIndex ?? -1]
  return phase === 'evening' || phase === 'night'
}

/** Advances the clock by one phase, rolling over to the next day after night. */
export function advancePhase(day: number, phaseIndex: number): { day: number; phaseIndex: number } {
  const next = phaseIndex + 1
  if (next >= PHASES.length) return { day: day + 1, phaseIndex: 0 }
  return { day, phaseIndex: next }
}

/** The day's action pool — 3 actions on a weekday, 4 on a weekend. Never stored, derived on demand. */
export function getMaxEnergyForDay(day: number): number {
  const { weekday } = getCalendarInfo(day)
  return weekday === 'saturday' || weekday === 'sunday' ? 4 : 3
}

/** How many actions are left today — floors at 0 rather than going negative once the day's spent. */
export function getEnergyRemaining(day: number, phaseIndex: number): number {
  return Math.max(0, getMaxEnergyForDay(day) - phaseIndex)
}

export interface EnergySpendResult {
  day: number
  phaseIndex: number
  /** True when this spend used the day's last action and the clock rolled straight to next morning ("Sleep"). */
  slept: boolean
}

/** Spends one action: steps the phase forward, then rolls straight to next morning if that step used up today's last action, rather than leaving the world sitting at a phase with nothing left to do. */
export function spendEnergy(day: number, phaseIndex: number): EnergySpendResult {
  const stepped = advancePhase(day, phaseIndex)
  if (stepped.day !== day) return { ...stepped, slept: true }
  if (getEnergyRemaining(stepped.day, stepped.phaseIndex) > 0) return { ...stepped, slept: false }
  return { ...advancePhase(stepped.day, stepped.phaseIndex), slept: true }
}

/** Where an action taken *right now* actually happens, as distinct from `spendEnergy`'s return value, which jumps straight to next morning once a day's last action forces a rollover. */
export function activityPhase(day: number, phaseIndex: number): { day: number; phaseIndex: number } {
  const stepped = advancePhase(day, phaseIndex)
  // Day already wrapped — the activity happened in the original phase, not the next-morning value `stepped` jumped to.
  if (stepped.day !== day) return { day, phaseIndex }
  return stepped
}

export interface WeatherPreferences {
  loves?: WeatherKind[]
  hates?: WeatherKind[]
}

/** A short, deterministic, model-facing line describing "right now" in this world for this character.
 *  Weather is read at phase granularity (`getPhaseWeather`), so the line changes as the clock moves
 *  inside a day rather than only when the date does, and it closes with tomorrow's outlook — the one
 *  forward-looking weather fact a character could plausibly have heard on a forecast. */
export function describeWorldMoment(opts: {
  worldId: string
  characterId: string
  day: number
  phaseIndex: number
  weatherPreferences?: WeatherPreferences
}): string {
  const info = getCalendarInfo(opts.day)
  const phase = PHASES[Math.max(0, Math.min(PHASES.length - 1, opts.phaseIndex))]
  const weather = getPhaseWeather(opts.worldId, opts.day, opts.phaseIndex)
  const mood = getMoodOfDay(opts.characterId, opts.day)
  const holidayNote = info.holiday ? ` — today is ${info.holiday}` : ''
  const weatherNote = opts.weatherPreferences?.loves?.includes(weather)
    ? ' (a kind of weather {{char}} loves)'
    : opts.weatherPreferences?.hates?.includes(weather)
      ? ' (a kind of weather {{char}} dislikes)'
      : ''
  const forecast = getTomorrowForecast(opts.worldId, opts.day)
  return `It's ${phase} on a ${info.season} ${info.weekday}${holidayNote}. The weather is ${describeWeather(weather)}${weatherNote}. Tomorrow looks ${describeWeather(forecast.kind)}. {{char}} is feeling ${mood} today.`
}

export type PresenceStatus = 'available' | 'busy' | 'sleeping' | 'traveling'

/** One routine slot in a character's week — a flat list of slots, no recurrence rules beyond "every day" vs specific weekdays. */
export interface ScheduleEntry {
  id: string
  /** Which weekdays this applies to — unset/empty means every day. */
  days?: Weekday[]
  phase: DayPhase
  status: PresenceStatus
  activity: string
  location?: string
}

/** What a character is doing right now: a day-specific entry beats an "every day" one; no schedule or no matching slot defaults to available. */
export function getCurrentActivity(
  schedule: ScheduleEntry[] | undefined,
  day: number,
  phaseIndex: number,
): { status: PresenceStatus; activity?: string; location?: string } {
  if (!schedule?.length) return { status: 'available' }
  const info = getCalendarInfo(day)
  const phase = PHASES[Math.max(0, Math.min(PHASES.length - 1, phaseIndex))]
  const forPhase = schedule.filter((e) => e.phase === phase)
  const entry = forPhase.find((e) => e.days?.includes(info.weekday)) ?? forPhase.find((e) => !e.days?.length)
  if (!entry) return { status: 'available' }
  return { status: entry.status, activity: entry.activity, location: entry.location }
}

/** Time-of-day words in narration, mapped to a phase — longest/most-specific patterns first so
 *  "late at night" beats "late". Only whole-phrase matches on word boundaries count. */
const PHASE_CUES: { re: RegExp; phase: DayPhase }[] = [
  { re: /\b(?:the )?(?:next|following) morning\b/i, phase: 'morning' },
  { re: /\b(?:that|the) (?:same )?night\b/i, phase: 'night' },
  { re: /\b(?:later )?that evening\b/i, phase: 'evening' },
  { re: /\b(?:the )?(?:next|following) day\b/i, phase: 'morning' },
  { re: /\bearly (?:the )?next\b/i, phase: 'morning' },
  { re: /\b(?:at )?(?:day ?break|dawn|sunrise|first light)\b/i, phase: 'morning' },
  { re: /\b(?:this |early |mid[- ]?|late )?morning\b/i, phase: 'morning' },
  { re: /\b(?:before|after) (?:first )?class(?:es)?\b/i, phase: 'morning' },
  { re: /\b(?:at |around |over )?(?:lunch(?:time)?|noon|midday)\b/i, phase: 'afternoon' },
  { re: /\b(?:this |early |mid[- ]?|late )?afternoon\b/i, phase: 'afternoon' },
  { re: /\bafter (?:school|work|classes?)\b/i, phase: 'afternoon' },
  { re: /\b(?:at |around )?(?:dusk|sunset|sundown|nightfall|twilight)\b/i, phase: 'evening' },
  { re: /\b(?:this |early |mid[- ]?|late )?evening\b/i, phase: 'evening' },
  { re: /\b(?:at |around |by )?(?:night ?time|midnight|the small hours)\b/i, phase: 'night' },
  { re: /\b(?:this |late |deep in the )?night\b/i, phase: 'night' },
  { re: /\bafter (?:dark|midnight)\b/i, phase: 'night' },
]

/** A time-of-day the text explicitly narrates ("the next morning", "at lunch", "that night"), or
 *  undefined when nothing time-anchoring is said. First-match wins on the ordered list above, so a
 *  message that only mentions time once resolves cleanly; a rambling one takes its earliest cue. */
export function detectNarratedPhase(text: string | null | undefined): DayPhase | undefined {
  return detectNarratedPhaseMatch(text)?.phase
}

/** `detectNarratedPhase` plus where in the text the cue sat — `deriveElapsedPhases` needs the index
 *  to decide whether a day-skip cue or a phase cue came first. */
export function detectNarratedPhaseMatch(
  text: string | null | undefined,
): { index: number; phase: DayPhase; cue: string } | undefined {
  if (!text?.trim()) return undefined
  let earliest: { index: number; phase: DayPhase; cue: string } | undefined
  for (const { re, phase } of PHASE_CUES) {
    const m = text.match(re)
    if (m?.index !== undefined && (!earliest || m.index < earliest.index)) {
      earliest = { index: m.index, phase, cue: m[0].trim() }
    }
  }
  return earliest
}

/**
 * Time cues that skip whole days rather than moving the clock inside one ("the next morning",
 * "tomorrow", "a week later"). Kept separate from `PHASE_CUES` because a day skip changes the date,
 * not just the hour — ordered longest-first so "the day after tomorrow" can't read as "tomorrow".
 */
const DAY_SKIP_CUES: { re: RegExp; days: number; landOnPhase?: DayPhase }[] = [
  { re: /\bthe day after tomorrow\b/i, days: 2 },
  { re: /\b(?:a few|several|couple of) days later\b/i, days: 3 },
  { re: /\b(?:a|the next|the following) week (?:later|after)\b/i, days: 7 },
  { re: /\b(?:the )?(?:next|following) morning\b/i, days: 1, landOnPhase: 'morning' },
  { re: /\b(?:the )?(?:next|following) day\b/i, days: 1, landOnPhase: 'morning' },
  { re: /\btomorrow\b/i, days: 1 },
]

/** Cues that point at *today's* clock rather than ahead of it ("this morning", "today") — the only
 *  ones that can legitimately name a phase the scene has already left. Every other cue ("that
 *  night", "late at night", "at dawn") reads forward by nature, however far forward that is. */
const SAME_DAY_CUE = /^(?:early |late |mid[- ]?)?this\b|^today\b/i

/** A whole-day skip beyond a week reads as a scene change, not a clock step — clamp rather than let
 *  one line of prose throw the calendar years forward. */
export const MAX_DERIVED_DAYS = 7

/**
 * How much time a single turn's narration says passed. Two independent legs on purpose:
 *  - `days`  — whole days an explicit skip cue named ("tomorrow", "a week later")
 *  - `phases` — intra-day steps, only used when `days` is 0
 * Never both, so "the next morning" can't be double-counted as a day skip *and* a phase walk.
 */
export interface ElapsedTime {
  /** 0-3 phases to step forward inside the current day. */
  phases: number
  /** 0-7 whole days to skip. */
  days: number
  /** Phase to land on when skipping days; undefined keeps whatever phase the clock is already at. */
  landOnPhase?: DayPhase
  /** One readable clause saying why — surfaced to the player and asserted in tests. */
  reason: string
  /** The exact phrase that caused the move, when there was one. */
  cue?: string
}

function earliestDaySkip(text: string): { index: number; days: number; landOnPhase?: DayPhase; cue: string } | undefined {
  let best: { index: number; days: number; landOnPhase?: DayPhase; cue: string } | undefined
  for (const { re, days, landOnPhase } of DAY_SKIP_CUES) {
    const m = text.match(re)
    if (m?.index === undefined) continue
    if (!best || m.index < best.index) best = { index: m.index, days, landOnPhase, cue: m[0].trim() }
  }
  return best
}

function clampPhaseIndex(phaseIndex: number): number {
  return Math.max(0, Math.min(PHASES.length - 1, phaseIndex))
}

/**
 * Reads how far the world clock should move from one turn of narration, so a shared clock can keep
 * up with a scene that says "the next morning" instead of sitting frozen until someone clicks a
 * button. Deliberately conservative — the default answer is "no time passed":
 *  - an explicit day-skip cue wins, and lands on the phase that cue names (else keeps the current one)
 *  - otherwise a named time-of-day walks forward to it, 1-2 phases
 *  - a cue naming the phase the clock is already at, or exactly one phase *back* ("this morning"
 *    said in the afternoon), reads as a same-day reference and moves nothing: the per-chat
 *    `scene.timePhase` override already grounds the prompt on it, and jumping the calendar forward
 *    to reach it would claim time the scene never spent.
 */
export function deriveElapsedPhases(opts: { text?: string | null; day: number; phaseIndex: number }): ElapsedTime {
  const text = opts.text ?? ''
  if (!text.trim()) return { phases: 0, days: 0, reason: 'nothing narrated, so the clock stays put' }
  const current = clampPhaseIndex(opts.phaseIndex)
  const skip = earliestDaySkip(text)
  const phaseCue = detectNarratedPhaseMatch(text)
  // Earliest cue wins, matching `detectNarratedPhase`'s own rule.
  if (skip && (!phaseCue || skip.index <= phaseCue.index)) {
    const days = Math.min(MAX_DERIVED_DAYS, Math.max(1, skip.days))
    const land = skip.landOnPhase ?? (phaseCue?.phase as DayPhase | undefined)
    return {
      phases: 0,
      days,
      landOnPhase: land,
      cue: skip.cue,
      reason:
        days === 1
          ? `"${skip.cue}" skips to the next day`
          : `"${skip.cue}" skips ${days} days`,
    }
  }
  if (!phaseCue) return { phases: 0, days: 0, reason: 'no time cue in the narration' }
  const target = PHASES.indexOf(phaseCue.phase)
  const delta = (target - current + PHASES.length) % PHASES.length
  if (delta === 0) {
    return { phases: 0, days: 0, cue: phaseCue.cue, reason: `"${phaseCue.cue}" names the phase the clock is already at` }
  }
  if (SAME_DAY_CUE.test(phaseCue.cue) && target < current) {
    return { phases: 0, days: 0, cue: phaseCue.cue, reason: `"${phaseCue.cue}" reads as a same-day reference, not a skip` }
  }
  return {
    phases: delta,
    days: 0,
    cue: phaseCue.cue,
    reason: `"${phaseCue.cue}" moves the clock ${delta} phase${delta === 1 ? '' : 's'} forward`,
  }
}

export interface AdvancedClock {
  day: number
  phaseIndex: number
  /** True when the move crossed midnight (the date changed). */
  slept: boolean
  /** How many phases the clock actually stepped. */
  phasesMoved: number
  /** One readable clause explaining the move, for a toast or a log line. */
  note: string
}

/**
 * Applies an `ElapsedTime` to the clock: whole days first when the narration named them, otherwise a
 * straight phase walk that rolls the date over whenever it passes night. Pure — the caller owns
 * persisting the result, so this stays testable without a server.
 */
export function reasonedAdvance(day: number, phaseIndex: number, elapsed: ElapsedTime): AdvancedClock {
  const start = clampPhaseIndex(phaseIndex)
  if (elapsed.days > 0) {
    const days = Math.min(MAX_DERIVED_DAYS, Math.max(0, Math.round(elapsed.days)))
    const land = elapsed.landOnPhase ? PHASES.indexOf(elapsed.landOnPhase) : start
    return {
      day: day + days,
      phaseIndex: clampPhaseIndex(land),
      slept: true,
      phasesMoved: ((land - start + PHASES.length) % PHASES.length) + days * PHASES.length,
      note: `${elapsed.reason} — ${days} day${days === 1 ? '' : 's'} later, now ${PHASES[clampPhaseIndex(land)]}`,
    }
  }
  const steps = Math.max(0, Math.min(MAX_DERIVED_PHASES, Math.round(elapsed.phases)))
  let cursor = { day, phaseIndex: start }
  for (let i = 0; i < steps; i++) cursor = advancePhase(cursor.day, cursor.phaseIndex)
  const slept = cursor.day !== day
  return {
    ...cursor,
    slept,
    phasesMoved: steps,
    note: steps === 0 ? elapsed.reason : `${elapsed.reason} — now ${PHASES[cursor.phaseIndex]}`,
  }
}

/** Upper bound on a single turn's intra-day phase walk — a narration cue names one of four phases,
 *  so three is the furthest it can legitimately land from where the clock already sits. */
export const MAX_DERIVED_PHASES = PHASES.length - 1

/** Case-insensitive, whitespace-tolerant "these name the same place" check — an exact match or
 *  either string containing the other ("Library" vs "School Library"). */
function locationsOverlap(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

/**
 * Presence for the prompt, reconciling the frozen world clock against an already-established scene.
 * `WorldCard.currentDay`/`currentPhaseIndex` only ever advance by explicit user action, so a chat
 * that opens with a greeting placing the character somewhere would otherwise be prompted the whole
 * session with a schedule slot ("busy — in class", or "free at her apartment") that contradicts the
 * scene the greeting set. The established scene owns *where* the character is; the schedule only
 * still owns their status/activity, and only when it doesn't fight the scene:
 *  - clock slot's own location matches the scene → keep it wholesale (its activity is real colour)
 *  - scene sits at a spot some other `available` slot covers → use that slot instead
 *  - scene is somewhere the schedule doesn't describe → keep only the status, drop the stale
 *    activity/location (a genuine busy/asleep/traveling conflict still surfaces as friction)
 */
export function resolveScheduledPresence(
  schedule: ScheduleEntry[] | undefined,
  day: number,
  phaseIndex: number,
  sceneLocation: string | null | undefined,
): { status: PresenceStatus; activity?: string; location?: string } {
  const clockActivity = getCurrentActivity(schedule, day, phaseIndex)
  const loc = sceneLocation?.trim()
  if (!loc || !schedule?.length) return clockActivity
  if (clockActivity.location && locationsOverlap(clockActivity.location, loc)) return clockActivity
  const sceneSlot = schedule.find((e) => e.status === 'available' && e.location && locationsOverlap(e.location, loc))
  if (sceneSlot) return { status: 'available', activity: sceneSlot.activity, location: sceneSlot.location }
  return { status: clockActivity.status }
}

const PRESENCE_LABELS: Record<PresenceStatus, string> = {
  available: 'free',
  busy: 'busy',
  sleeping: 'asleep',
  traveling: 'traveling',
}

export function presenceLabel(status: PresenceStatus): string {
  return PRESENCE_LABELS[status]
}

/** A short, deterministic, model-facing line describing what a character is doing right now — merged alongside describeWorldMoment's weather/mood line, not a replacement for it. */
export function describePresence(presence: { status: PresenceStatus; activity?: string; location?: string }): string {
  const where = presence.location ? ` at ${presence.location}` : ''
  if (!presence.activity) return `{{char}} is currently ${presenceLabel(presence.status)}.`
  return `{{char}} is currently ${presenceLabel(presence.status)} — ${presence.activity}${where}.`
}

/**
 * Realism Engine absorption (Front Porch-style vitality): a deterministic, model-facing line about
 * the character's day-energy and sleepiness, derived purely from the world clock — no judge call.
 * Only emitted when it would actually color the reply (night phases or the day's energy nearly
 * spent); a fresh morning with a full action pool says nothing, to keep prompts lean.
 */
export function describeVitality(day: number, phaseIndex: number): string {
  const phase = PHASES[Math.max(0, Math.min(PHASES.length - 1, phaseIndex))]
  const remaining = getEnergyRemaining(day, phaseIndex)
  const max = getMaxEnergyForDay(day)
  const spent = max - remaining
  if (phase === 'night') {
    const spentNote = spent >= max - 1 ? " Today's energy is fully spent." : ''
    return `It's late — {{char}} is winding down for sleep, and low on energy. Replies trend shorter and softer; she may yawn, trail off, or cut things short unless something genuinely holds her attention.${spentNote}`
  }
  if (phase === 'evening' && spent >= max - 1) {
    return `It's evening and {{char}} has used up almost all of today's energy. She is winding down: slower to start new things, content to stay somewhere quiet, noticeably less up for anything demanding.`
  }
  if (remaining <= 0) {
    return `{{char}}'s energy for today is spent — she is running on fumes. Replies are shorter and lower-effort, and she steers toward wrapping up rather than starting anything new.`
  }
  return ''
}
