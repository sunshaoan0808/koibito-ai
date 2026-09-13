/**
 * First-class i18n for RP Suite (patched build).
 *
 * `t()` translates an exact English UI string into the active locale, falling back to the input.
 * Dictionaries live next to this file (`zh.ts`, `en.ts`); the active locale is persisted in
 * localStorage under `rp.locale` and switchable in Settings (top bar) — changing it reloads the
 * page so module-scope translations (nav labels, status maps) pick it up too.
 *
 * English is the source of truth: components keep their stock English literals wrapped in t(),
 * and a missing dictionary entry simply renders English. To add a language, create a dictionary
 * file, register it in `LOCALES`, and add the option to `LANGUAGES`.
 */
import { ZH } from './zh'
import { EN } from './en'

export type LocaleId = 'zh' | 'en'

export interface Locale {
  id: LocaleId
  label: string
  dict: Record<string, string>
}

export const LOCALES: Record<LocaleId, Locale> = {
  zh: { id: 'zh', label: '中文（简体）', dict: ZH },
  en: { id: 'en', label: 'English', dict: EN },
}

export const LANGUAGES: LocaleId[] = ['zh', 'en']

const STORAGE_KEY = 'rp.locale'
const DEFAULT_LOCALE: LocaleId = 'zh'

let current: LocaleId = readStoredLocale()

function readStoredLocale(): LocaleId {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v && v in LOCALES ? (v as LocaleId) : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

/** The active locale id. */
export function getLocale(): LocaleId {
  return current
}

/** Persist a new locale and reload, so module-scope translated constants refresh as well. */
export function setLocale(id: LocaleId): void {
  if (id === current) return
  current = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* private mode etc. — locale just won't persist */
  }
  window.location.reload()
}

/**
 * Translate an exact English UI string into the active locale. Interpolation uses `{name}` slots:
 * pass replacements as the second argument, e.g. `t('Chat with {name}', { name: 'Sumire' })`.
 */
export function t(en: string, vars?: Record<string, string | number>): string {
  const locale = LOCALES[current]
  let out = (locale.dict[en] ?? en) as string
  if (vars) {
    for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  }
  return out
}
