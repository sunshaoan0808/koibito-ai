/**
 * Resolves a stored URL (a track, a world background, an avatar) against the current page, so a
 * relative `data/…` path works from any route. Moved here verbatim from `BgmPlayer` when the
 * gallery's music room needed the same thing — one implementation, two callers.
 *
 * `base` is injectable so the behaviour is testable without a real page: a test (or any non-DOM
 * caller) passes one, the app doesn't and gets the current location. With no usable base at all the
 * input comes back unchanged, which is also what a `URL()` that rejects falls back to.
 */
export function absoluteUrl(url: string, base?: string): string {
  const resolved = base ?? (typeof window === 'undefined' ? '' : window.location.href)
  try {
    return new URL(url, resolved).href
  } catch {
    return url
  }
}
