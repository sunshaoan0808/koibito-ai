/**
 * PWA update handoff.
 *
 * `registerType: 'autoUpdate'` already installs a new service worker the moment it is fetched and
 * activates it immediately (`skipWaiting` + `clientsClaim` are both in the generated `sw.js`) — but
 * the page in front of you is still the *old* bundle, because reloading a document the user is
 * typing into is not something a service worker may do on its own. What that produced, before this
 * file existed, was a stale UI with no way to tell: the new worker owned the cache while the
 * document kept running the previous build, and the only way out was to clear the worker by hand.
 * (That is literally how a deployment looked broken here once.)
 *
 * One reload when control changes makes the two agree again. Two details matter:
 *
 * - **Backgrounded tabs reload at once.** Nobody is looking, so the upgrade costs nothing.
 * - **Foreground tabs wait for the moment the user leaves.** Reloading mid-turn would throw away a
 *   reply the model is streaming into the composer — a far worse failure than a stale tab.
 *
 * Both the "have we had a handover" flag and the "is a handover already in progress" flag are set
 * before the reload, so a worker that claims clients twice cannot put the page in a reload loop.
 */

let handedOver = false
let controlChanged = false

/** True once a reload has been scheduled or performed. Exported for tests, not for app code. */
export function hasHandedOver(): boolean {
  return handedOver
}

/** Reset the module-level guards. Tests only — a module flag would otherwise leak between cases. */
export function resetHandoverForTest(): void {
  handedOver = false
  controlChanged = false
}

function isHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden'
}

export function watchForUpdates(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  const handOver = () => {
    if (handedOver) return
    handedOver = true
    window.location.reload()
  }

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Only a real handover justifies a reload: a backgrounded tab that has simply been sitting there
    // must not reload itself on boot just because it is hidden.
    controlChanged = true
    if (isHidden()) handOver()
  })

  document.addEventListener('visibilitychange', () => {
    if (controlChanged && isHidden()) handOver()
  })
}
