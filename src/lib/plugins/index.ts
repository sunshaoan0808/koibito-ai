import { harbourTidesPlugin } from './example'
import { applyGrants, loadGrants } from './grants'
import { pluginRegistry } from './registry'

/**
 * The single registration point, imported once from `main.tsx`.
 *
 * Nothing else in the app registers plugins — which is the whole point of the plugin API: adding
 * one is adding a file here, not editing the engine. Registration is idempotent so a hot reload
 * cannot double-register and trip the registry's own collision checks.
 */
export function registerBuiltInPlugins(): void {
  if (pluginRegistry.plugins().length === 0) {
    pluginRegistry.register(harbourTidesPlugin)
  }
  // Grants are replayed on every boot: the registry starts empty, memory is not state.
  applyGrants(pluginRegistry, loadGrants())
}
