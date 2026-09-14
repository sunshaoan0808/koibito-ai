import { createContext, useContext } from 'react'

/**
 * The active settings-search query, or `''` for "not filtering".
 *
 * The default is `''` on purpose: `Section` is also used by modals and plugin panels that have no
 * search box, so an unset context has to mean "render normally" rather than "hide". That keeps the
 * filter switch in exactly one place (`SettingsView`) instead of a prop threaded through every card.
 */
export const SettingsFilterContext = createContext('')

/** Reads the settings-search query. Outside `SettingsView` this is always `''`, i.e. no filtering. */
export function useSettingsFilter(): string {
  return useContext(SettingsFilterContext)
}
