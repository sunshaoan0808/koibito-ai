/**
 * The portrait veto gate — the part of Front Porch's avatar run that this codebase did not have.
 *
 * Absorbed from `avatar_creation_controller.dart`, whose `run()` generates the base portrait, then
 * *pauses* at `AvatarRunStage.portraitReview` before the expression pass, with `regeneratePortrait()`
 * staying paused so one look can be vetoed any number of times, and `continueFromReview(withPack:)`
 * as the only way into the expensive pass. The economics are the whole point: the portrait is one
 * generation, the expression set is one per expression, so approving a single cheap image first is
 * what stops a wrong look from burning the whole batch.
 *
 * Kept pure and separate from the dialog for the same reason `branchTree` and `server/saveSlots` are:
 * the rules below are the interesting part, and they are worth asserting on instead of eyeballing.
 *
 * Invariants, each of them covered by a test:
 * - The pack stage is never entered before a human passes the gate (`packSpend` returns 0 until then).
 * - Regenerating keeps the run at the gate — a veto is not a one-shot.
 * - A failed regenerate does not cost the portrait already on screen; the run stays where it was.
 * - Stopping only ever leaves finished images in place; no stage rolls work back.
 */
export type PortraitRunStage = 'idle' | 'portrait' | 'review' | 'pack' | 'done'

/** What the modal's primary button is for at a given stage. */
export type PortraitRunAction = 'start' | 'stop' | 'continue'

export interface PortraitRunInput {
  /** Whether the base portrait was produced (or kept from an earlier attempt). */
  hasPortrait: boolean
  /** Whether the user still wants the expression pass after approving the portrait. */
  packWanted: boolean
  /** Whether the backend is configured well enough to run that pass at all. */
  packPossible: boolean
  /** Whether a stop was requested while the portrait was in flight. */
  stopped: boolean
}

/**
 * Where the run lands once the base portrait has been attempted. With a pack pending it stops at the
 * gate; without one there is nothing to protect, so it finishes. A stop here is the pre-gate
 * short-circuit: nothing was generated, nothing is owed.
 */
export function nextStageAfterPortrait(input: PortraitRunInput): PortraitRunStage {
  if (!input.hasPortrait) return 'portrait'
  if (input.stopped) return 'done'
  if (input.packWanted && input.packPossible) return 'review'
  return 'done'
}

/**
 * Where a regenerate at the gate lands. Success stays at the gate (keep vetoing). Failure keeps the
 * previous portrait and therefore also stays at the gate — the user is never left worse off for
 * having tried. A stop mid-regenerate settles the run and keeps whatever exists.
 */
export function nextStageAfterRegenerate(input: {
  ok: boolean
  hasPortrait: boolean
  stopped: boolean
}): PortraitRunStage {
  if (input.stopped) return 'done'
  if (input.hasPortrait) return 'review'
  return 'portrait'
}

/** The human's answer at the gate: run the pack, or take the portrait and stop. */
export function nextStageAfterReview(input: { withPack: boolean; packPossible: boolean }): PortraitRunStage {
  return input.withPack && input.packPossible ? 'pack' : 'done'
}

export function gateIsOpen(stage: PortraitRunStage): boolean {
  return stage === 'review'
}

export function canRegenerate(stage: PortraitRunStage): boolean {
  return stage === 'review'
}

export function canContinue(stage: PortraitRunStage): boolean {
  return stage === 'review'
}

/** The only stage allowed to spend expression generations. */
export function isSpendingPack(stage: PortraitRunStage): boolean {
  return stage === 'pack'
}

export function primaryAction(stage: PortraitRunStage): PortraitRunAction {
  if (stage === 'portrait' || stage === 'pack') return 'stop'
  if (stage === 'review') return 'continue'
  return 'start'
}

/**
 * How many expression generations entering the current stage spends: the selection size during the
 * pack stage, and nothing at all anywhere else — the gate's guarantee, stated as a number.
 */
export function packSpend(stage: PortraitRunStage, selectedCount: number): number {
  return isSpendingPack(stage) ? Math.max(0, selectedCount) : 0
}
