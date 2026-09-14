import type { PluginRegistry } from './registry'
import type { PluginGrants } from './types'

/**
 * Grants are the one piece of plugin state that has to outlive a reload — phase 3's acceptance says
 * a toggle must survive a refresh. They live in localStorage beside the rest of the app's UI
 * preferences (`rp.*`), and they are the *only* thing persisted: capability declarations and hook
 * failures stay in memory, where they belong.
 */
const STORAGE_KEY = 'rp.pluginGrants'

export type GrantMap = Record<string, PluginGrants>

/** The capabilities a user can actually decide about. Declarations alone are never grants. */
export const GRANTABLE: (keyof PluginGrants)[] = ['prompt:write', 'net']

function isGrants(value: unknown): value is PluginGrants {
  return typeof value === 'object' && value !== null
}

/**
 * Read the stored map. Anything unreadable yields `{}` — a corrupt or absent entry must never stop
 * the app from booting, and "no grants" is the safe direction to fail in.
 */
export function loadGrants(): GrantMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: GrantMap = {}
    for (const [pluginId, grants] of Object.entries(parsed as Record<string, unknown>)) {
      if (isGrants(grants)) out[pluginId] = grants
    }
    return out
  } catch {
    return {}
  }
}

/** Persist the map. Storage failures (quota, private mode) are swallowed — UI state, not data. */
export function saveGrants(grants: GrantMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(grants))
  } catch {
    /* nothing to do: the toggle still works for this session */
  }
}

/** Push stored grants into a registry. Called once at boot, before any prompt is built. */
export function applyGrants(registry: PluginRegistry, grants: GrantMap): void {
  for (const [pluginId, pluginGrants] of Object.entries(grants)) {
    for (const capability of GRANTABLE) {
      if (pluginGrants[capability]) registry.setGrant(pluginId, capability, true)
    }
  }
}

/** Flip one toggle and return a **new** map, so callers can persist exactly what they rendered. */
export function withGrant(
  grants: GrantMap,
  pluginId: string,
  capability: keyof PluginGrants,
  on: boolean,
): GrantMap {
  const current = grants[pluginId] ?? {}
  return { ...grants, [pluginId]: { ...current, [capability]: on } }
}

/** Convenience for the panel: is this capability currently granted to this plugin? */
export function hasGrant(grants: GrantMap, pluginId: string, capability: keyof PluginGrants): boolean {
  return grants[pluginId]?.[capability] === true
}
