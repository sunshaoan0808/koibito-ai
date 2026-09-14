import type { PluginContribution } from './types'

/**
 * The design doc's worked example: a plugin that edits one prompt section, contributed from inside
 * the repo, without the engine knowing it exists.
 *
 * It ships **registered but ungranted**. The panel lists it, the toggle decides whether it does
 * anything at all, and with the toggle off a build that has this plugin loaded is byte-identical to
 * one that has no plugins — that equivalence is asserted in `integration.test.ts`.
 */
export const harbourTidesPlugin: PluginContribution = {
  manifest: {
    id: 'harbour-tides',
    name: 'Harbour tides',
    version: '1.0.0',
    capabilities: ['prompt:write'],
    order: 10,
  },
  prompt: [
    {
      id: 'append-tides',
      // Returning `undefined` means "leave this section alone" — a plugin that only cares about one
      // section must not be handed the others as a temptation.
      transform: (section, text) =>
        section === 'world' ? `${text}\nTide tables are posted at the inn.` : undefined,
    },
  ],
}
