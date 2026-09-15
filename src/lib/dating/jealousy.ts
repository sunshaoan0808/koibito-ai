/**
 * 331's jealousy beat — the missing mechanical half of the `jealousy` scene flag.
 *
 * What already existed: the classifier can SET the flag (`relationshipAssist.ts` glossary),
 * a rival's tone deepens once it's set (`participantArchetype.ts`), and whoever else is
 * present is named to the judge (`presentParticipants`). What didn't exist: any numeric
 * consequence — the flag sat in `sceneFlags` and moved nobody's meter ("isn't mechanically
 * wired", TODO L331).
 *
 * This closes that gap with one small deterministic nudge: when a jealousy beat lands in
 * front of witnesses, the speaker's own track takes +2 tension. Light by design — it's a
 * scene beat, not a breakup event — and folded into the turn's deltas before clamping so the
 * whole downstream merge (clamps, risk, stage) treats it like any other tension movement.
 */

/** How much tension a witnessed jealousy beat adds. Small on purpose — see above. */
export const JEALOUSY_TENSION_NUDGE = 2

export interface JealousyBeatInput {
  /** Whether `jealousy` was newly set this turn (classifier verdict or trigger `set_flag`). */
  jealousySetThisTurn: boolean
  /** Names of everyone else actually in the scene besides the speaker. Empty = no witnesses. */
  witnessNames: string[]
}

/**
 * The tension nudge for this turn's jealousy beat: +2 when a jealousy flag was set this
 * turn AND someone else was there to see it, else 0. Pure — no I/O, no randomness.
 */
export function jealousyTensionNudge(input: JealousyBeatInput): number {
  if (!input.jealousySetThisTurn) return 0
  const hasWitness = input.witnessNames.some((name) => name.trim().length > 0)
  return hasWitness ? JEALOUSY_TENSION_NUDGE : 0
}
