import { describe, expect, it, vi } from 'vitest'
import {
  applyOutputHooks,
  isRunnableOutputHook,
  runOutputHook,
  validateOutputHookScript,
  type OutputHookRequest,
  type OutputHookState,
  type OutputHookWorkerLike,
} from './outputHook'

const STATE: OutputHookState = { affection: 10, stage: 'close', flags: ['first_kiss'], day: 3, phaseIndex: 1 }

/** A fake worker that executes the hook body synchronously via `new Function` — the same shape
 *  the real worker evaluates, minus the thread boundary (which node-test envs don't have). */
function fakeWorker(exec?: (script: string, text: string, state: OutputHookState) => unknown): OutputHookWorkerLike {
  const w: OutputHookWorkerLike = {
    onmessage: null,
    postMessage(msg: OutputHookRequest) {
      setTimeout(() => {
        try {
          const fn = new Function('text', 'state', msg.script) as (t: string, s: OutputHookState) => unknown
          const raw = exec ? exec(msg.script, msg.text, msg.state) : fn(msg.text, msg.state)
          const text = raw && typeof raw === 'object' ? (raw as { text?: unknown }).text : undefined
          w.onmessage?.({
            data:
              typeof text === 'string'
                ? { type: 'output-hook-result', id: msg.id, ok: true, text }
                : { type: 'output-hook-result', id: msg.id, ok: false, error: 'Hook must return { text }.' },
          })
        } catch (e) {
          w.onmessage?.({ data: { type: 'output-hook-result', id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) } })
        }
      }, 0)
    },
    terminate() {},
  }
  return w
}

describe('validateOutputHookScript', () => {
  it('rejects empty scripts', () => {
    expect(validateOutputHookScript('   ').ok).toBe(false)
  })

  it('rejects overlong scripts', () => {
    expect(validateOutputHookScript('return { text };'.padEnd(5001, ' ')).ok).toBe(false)
  })

  it('accepts a plain text transform', () => {
    expect(validateOutputHookScript('return { text: text.toUpperCase() };').ok).toBe(true)
  })

  it('blocks network tokens', () => {
    for (const body of ['fetch("https://x")', 'new XMLHttpRequest()', 'new WebSocket("wss://x")', 'import("fs")']) {
      expect(validateOutputHookScript(`return { text: (${body}, text) };`).ok).toBe(false)
    }
  })

  it('blocks DOM/worker-escape tokens', () => {
    for (const body of ['document.title', 'window.location', 'new Worker("x")', 'importScripts("x")', 'eval("1")', 'Function("x")', 'globalThis.x', 'process.env']) {
      expect(validateOutputHookScript(`return { text: (${body}, text) };`).ok).toBe(false)
    }
  })

  it('reports syntax errors without running anything', () => {
    const r = validateOutputHookScript('return { text: text..toUpperCase( };')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Syntax/i)
  })
})

describe('isRunnableOutputHook', () => {
  it('needs enabled + valid', () => {
    expect(isRunnableOutputHook({ enabled: true, body: 'return { text };' })).toBe(true)
    expect(isRunnableOutputHook({ enabled: false, body: 'return { text };' })).toBe(false)
    expect(isRunnableOutputHook({ enabled: true, body: 'fetch("x")' })).toBe(false)
  })
})

describe('runOutputHook', () => {
  it('returns the transformed text', async () => {
    const r = await runOutputHook(() => fakeWorker(), 'return { text: text + "!" };', 'hi', STATE)
    expect(r).toEqual({ text: 'hi!' })
  })

  it('keeps the original text on a thrown exception, with an error', async () => {
    const r = await runOutputHook(() => fakeWorker(), 'throw new Error("boom")', 'hi', STATE)
    expect(r.text).toBe('hi')
    expect(r.error).toMatch(/boom/)
  })

  it('keeps the original text when the hook returns no text', async () => {
    const r = await runOutputHook(() => fakeWorker(), 'return {};', 'hi', STATE)
    expect(r.text).toBe('hi')
    expect(r.error).toBeTruthy()
  })

  it('times out a hanging hook and keeps the original text', async () => {
    const hanging: OutputHookWorkerLike = { onmessage: null, postMessage() {}, terminate() {} }
    const r = await runOutputHook(() => hanging, 'return { text };', 'hi', STATE, 20)
    expect(r.text).toBe('hi')
    expect(r.error).toMatch(/timed out/)
  })

  it('keeps the original text when the worker factory throws', async () => {
    const r = await runOutputHook(
      () => {
        throw new Error('no workers here')
      },
      'return { text };',
      'hi',
      STATE,
    )
    expect(r.text).toBe('hi')
    expect(r.error).toMatch(/Could not start/)
  })
})

describe('applyOutputHooks', () => {
  const runOne = (script: string, text: string, state: OutputHookState) =>
    runOutputHook(() => fakeWorker(), script, text, state)

  it('is a no-op without scripts', async () => {
    expect(await applyOutputHooks(runOne, undefined, 'hi', STATE)).toEqual({ text: 'hi', errors: [] })
    expect(await applyOutputHooks(runOne, [], 'hi', STATE)).toEqual({ text: 'hi', errors: [] })
  })

  it('runs enabled hooks in order', async () => {
    const r = await applyOutputHooks(
      runOne,
      [
        { id: 'a', name: 'A', body: 'return { text: text + "1" };', target: 'display', enabled: true },
        { id: 'b', name: 'B', body: 'return { text: text + "2" };', target: 'display', enabled: true },
      ],
      'hi',
      STATE,
    )
    expect(r).toEqual({ text: 'hi12', errors: [] })
  })

  it('skips disabled and invalid hooks, keeps going after a failure', async () => {
    const runOneSpy = vi.fn(runOne)
    const r = await applyOutputHooks(
      runOneSpy,
      [
        { id: 'off', name: 'Off', body: 'return { text: "X" };', target: 'display', enabled: false },
        { id: 'bad', name: 'Bad', body: 'fetch("x")', target: 'display', enabled: true },
        { id: 'boom', name: 'Boom', body: 'throw new Error("bang")', target: 'display', enabled: true },
        { id: 'ok', name: 'Ok', body: 'return { text: text + "!" };', target: 'display', enabled: true },
      ],
      'hi',
      STATE,
    )
    expect(runOneSpy).toHaveBeenCalledTimes(2)
    expect(r.text).toBe('hi!')
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain('Boom')
  })
})
