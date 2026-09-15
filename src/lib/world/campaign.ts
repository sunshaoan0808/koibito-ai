/**
 * 336's route/campaign structure — Mystic Messenger-style arc with a goal and a deadline.
 *
 * A world may carry an optional `campaign`: a premise, a day count, and a list of endings,
 * each with its own win condition (reach a stage, hold N flags). The campaign gives a run a
 * shape and an ending beyond "keep chatting" — the model gets the premise + days-left in its
 * prompt, and the UI derives won/expired live from the world clock + this chat's stage/flags.
 *
 * Everything here is pure: no I/O, no randomness, no Date.now(). The clock (`currentDay`) and
 * the chat state (stage, flags) are passed in; the caller decides where they come from.
 * Unset campaign = disabled, byte-for-byte the old behavior.
 */
import type { RelationshipStage, SceneFlag } from '@/lib/types'

/** Stage ladder, lowest first — mirrors `stage.ts`'s RELATIONSHIP_MILESTONES order. */
const STAGE_RANK: RelationshipStage[] = [
  'near_strangers',
  'acquaintances',
  'warming_up',
  'getting_close',
  'close',
  'sweethearts',
]

export type CampaignWinKind = 'stage' | 'flags'

/** One ending of a campaign — the first satisfied ending (in list order) is the run's ending. */
export interface CampaignEnding {
  id: string
  /** Player-facing ending name, e.g. "Confession under the fireworks". */
  label: string
  /** What this ending means — read to the player on unlock and to the model as the goal. */
  description: string
  /** Win condition kind: reach (at least) a relationship stage, or hold flag(s). */
  winKind: CampaignWinKind
  /** For `stage`: the minimum stage. For `flags`: the required flag ids (ALL must hold). */
  winStage?: RelationshipStage
  winFlags?: SceneFlag[]
}

export interface CampaignDef {
  /** Story premise — injected into the prompt so the model plays toward it. */
  premise: string
  /** Arc length in world days (Mystic Messenger's 11 is the reference, not a cap). */
  dayCount: number
  /** World day the arc starts on — days-left counts down from `startDay + dayCount`. */
  startDay: number
  /** Ordered endings; first satisfied wins. Empty = a deadline with no win condition. */
  endings: CampaignEnding[]
}

export type CampaignStatus = 'disabled' | 'active' | 'won' | 'expired'

export interface CampaignEvaluation {
  status: CampaignStatus
  /** Remaining world days (deadline − currentDay); negative means overdue. */
  daysLeft: number
  /** The won ending, when `status === 'won'`. */
  ending?: CampaignEnding
}

/** A campaign counts only when it has a premise and a positive day count. */
export function isCampaignEnabled(campaign: CampaignDef | undefined): boolean {
  return !!campaign && campaign.premise.trim().length > 0 && campaign.dayCount > 0
}

function stageAtLeast(stage: RelationshipStage, minimum: RelationshipStage): boolean {
  return STAGE_RANK.indexOf(stage) >= STAGE_RANK.indexOf(minimum)
}

function endingSatisfied(
  ending: CampaignEnding,
  stage: RelationshipStage,
  flags: Set<string>,
): boolean {
  if (ending.winKind === 'stage') {
    return !!ending.winStage && stageAtLeast(stage, ending.winStage)
  }
  const need = (ending.winFlags ?? []).filter((f) => f.trim().length > 0)
  return need.length > 0 && need.every((f) => flags.has(f))
}

export function evaluateCampaign(
  campaign: CampaignDef | undefined,
  input: { currentDay: number; stage: RelationshipStage; flags: Iterable<string> },
): CampaignEvaluation {
  if (!isCampaignEnabled(campaign)) return { status: 'disabled', daysLeft: 0 }
  const def = campaign as CampaignDef
  const daysLeft = def.startDay + def.dayCount - input.currentDay
  const flagSet = new Set(input.flags)
  const ending = def.endings.find((e) => endingSatisfied(e, input.stage, flagSet))
  if (ending) return { status: 'won', daysLeft, ending }
  if (daysLeft <= 0) return { status: 'expired', daysLeft }
  return { status: 'active', daysLeft }
}

/** Days elapsed/total for the progress display — clamped to [0, total]. */
export function campaignProgress(
  campaign: CampaignDef,
  currentDay: number,
): { elapsed: number; total: number } {
  const total = Math.max(1, campaign.dayCount)
  const elapsed = Math.min(total, Math.max(0, currentDay - campaign.startDay))
  return { elapsed, total }
}

/** The prompt line carrying premise + deadline + goal, so the model plays toward the arc. */
export function campaignPromptLine(
  campaign: CampaignDef | undefined,
  currentDay: number,
): string {
  if (!isCampaignEnabled(campaign)) return ''
  const def = campaign as CampaignDef
  const daysLeft = def.startDay + def.dayCount - currentDay
  const goals = def.endings
    .map((e) => {
      const cond =
        e.winKind === 'stage' && e.winStage
          ? `reach ${e.winStage.replace(/_/g, ' ')}`
          : `hold ${(e.winFlags ?? []).join(', ')}`
      return `${e.label} (${cond})`
    })
    .join('; ')
  const countdown =
    daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'the deadline has passed'
  return [
    `Campaign arc: ${def.premise.trim()}`,
    `Deadline: ${countdown} of a ${def.dayCount}-day arc.`,
    ...(goals ? [`Endings: ${goals}.` ] : []),
  ].join(' ')
}
