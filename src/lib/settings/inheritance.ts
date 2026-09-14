/**
 * Inheritance reporting for the settings that cascade, so a control can say *where* its current
 * value came from instead of leaving the reader to work it out from hint prose.
 *
 * Not a generic N-layer cascade engine, deliberately. Every cascade in this app bottoms out at a
 * global Settings value — `resolveIntimacyLevel`'s `world ?? global`, the instruct-template
 * `character || global` chain, and `chat.assistOverrides?.[key] ?? global` — and each chain has its
 * own idea of "unset" (intimacy treats `null` and `undefined` alike; the assist flags treat only
 * `undefined` as unset). A shared engine would have to be handed all of that per call anyway, so
 * this reports the one layer the caller's own control writes to and names the fallback.
 */

/** The layers a cascading setting can come from, innermost first. */
export type InheritanceLayer = 'global' | 'world' | 'character' | 'chat'

/**
 * The layer a cascading value actually came from, as a badge should describe it: `null` when `layer`
 * itself set the value ("overridden here"), otherwise `'global'` — the layer every chain in this app
 * falls through to.
 *
 * @param value   The value at `layer` (e.g. `world.intimacyLevel`, `chat.assistOverrides?.autoTrackRelationship`).
 * @param layer   The layer the calling control writes to.
 * @param opts    `nullIsUnset` for chains where the wire format uses `null` to mean "inherit"
 *                (`WorldCard.intimacyLevel` does; the assist flags don't).
 */
export function inheritedFrom<T>(
  value: T | null | undefined,
  layer: InheritanceLayer,
  opts: { nullIsUnset?: boolean } = {},
): InheritanceLayer | null {
  const isUnset = value === undefined || (value === null && opts.nullIsUnset === true)
  return isUnset ? 'global' : null
}
