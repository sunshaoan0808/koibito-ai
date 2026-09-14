import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetHandoverForTest, watchForUpdates } from './autoReload'

type Listener = () => void

/**
 * The node test environment has neither a service worker nor a document, so both are stubbed. What
 * is under test is the *policy* (when a reload is justified), not the browser's event delivery.
 */
function harness(visibility: 'visible' | 'hidden') {
  const listeners: Record<string, Listener[]> = {}
  const reloads: string[] = []
  const doc = {
    visibilityState: visibility,
    addEventListener: (type: string, fn: Listener) => void (listeners[type] ??= []).push(fn),
  }
  const sw = {
    addEventListener: (type: string, fn: Listener) => void (listeners[`sw:${type}`] ??= []).push(fn),
  }
  vi.stubGlobal('navigator', { serviceWorker: sw })
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { location: { reload: () => reloads.push('reload') } })
  return {
    reloads,
    swEvent: (type: string) => (listeners[`sw:${type}`] ?? []).forEach((fn) => fn()),
    docEvent: (type: string) => (listeners[type] ?? []).forEach((fn) => fn()),
    goHidden: () => void (doc.visibilityState = 'hidden'),
  }
}

afterEach(() => {
  resetHandoverForTest()
  vi.unstubAllGlobals()
})

describe('pwa update handoff', () => {
  it('reloads a backgrounded tab as soon as the new worker takes control', () => {
    const h = harness('hidden')
    watchForUpdates()
    expect(h.reloads).toHaveLength(0) // booting hidden is not itself a reason to reload
    h.swEvent('controllerchange')
    expect(h.reloads).toHaveLength(1)
  })

  it('waits for a foregrounded tab to be left behind, then reloads exactly once', () => {
    const h = harness('visible')
    watchForUpdates()
    h.swEvent('controllerchange')
    expect(h.reloads).toHaveLength(0) // a reply may be streaming; do not throw it away
    h.goHidden()
    h.docEvent('visibilitychange')
    expect(h.reloads).toHaveLength(1)
  })

  it('never reloads a tab that has simply been hidden without a handover', () => {
    const h = harness('visible')
    watchForUpdates()
    h.goHidden()
    h.docEvent('visibilitychange')
    expect(h.reloads).toHaveLength(0)
  })

  it('does not loop when a worker claims clients twice', () => {
    const h = harness('hidden')
    watchForUpdates()
    h.swEvent('controllerchange')
    h.swEvent('controllerchange')
    h.docEvent('visibilitychange')
    expect(h.reloads).toHaveLength(1)
  })

  it('is a no-op where there is no service worker (plain browsers, tests in CI)', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {} })
    vi.stubGlobal('window', { location: { reload: () => { throw new Error('must not reload') } } })
    expect(() => watchForUpdates()).not.toThrow()
  })
})
