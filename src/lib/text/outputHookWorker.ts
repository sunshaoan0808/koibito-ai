/**
 * Output-hook Web Worker entry (TODO L387; ROADMAP section 15) — the C sandbox boundary.
 *
 * Loaded via `new Worker(new URL('./outputHookWorker.ts', import.meta.url), { type: 'module' })`
 * so Vite bundles it as a separate chunk (never inlined into the PWA app-shell precache as
 * application code). The worker has no imports: no fetch, no DOM, no app modules — just this
 * file's message handler plus the user-authored body compiled with `new Function` INSIDE the
 * worker, so user code can never touch the main thread's scope even if the static gate in
 * `outputHook.ts` missed something.
 *
 * Protocol: `{ type: 'run-output-hook', id, script, text, state }` in, `{ type:
 * 'output-hook-result', id, ok, text?, error? }` out. Any throw (compile or runtime) resolves
 * to `ok: false` — the runner keeps the original text.
 */
import type { OutputHookRequest, OutputHookResponse } from './outputHook'

type WorkerScope = {
  onmessage: ((ev: MessageEvent<OutputHookRequest>) => void) | null
  postMessage(msg: OutputHookResponse): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (ev: MessageEvent<OutputHookRequest>) => {
  const msg = ev.data
  if (!msg || msg.type !== 'run-output-hook') return
  const respond = (resp: Omit<OutputHookResponse, 'type' | 'id'>) =>
    scope.postMessage({ type: 'output-hook-result', id: msg.id, ...resp } satisfies OutputHookResponse)
  let fn: (text: string, state: unknown) => unknown
  try {
    // Compiled here, not on the main thread: user code lives and dies inside this worker.
    fn = new Function('text', 'state', msg.script) as (text: string, state: unknown) => unknown
  } catch (e) {
    respond({ ok: false, error: `Hook compile error: ${e instanceof Error ? e.message : String(e)}` })
    return
  }
  let raw: unknown
  try {
    raw = fn(msg.text, msg.state)
  } catch (e) {
    respond({ ok: false, error: e instanceof Error ? e.message : String(e) })
    return
  }
  const text = raw && typeof raw === 'object' ? (raw as { text?: unknown }).text : undefined
  if (typeof text !== 'string') {
    respond({ ok: false, error: 'Hook must return { text } — got no string text.' })
    return
  }
  respond({ ok: true, text })
}

export {}
