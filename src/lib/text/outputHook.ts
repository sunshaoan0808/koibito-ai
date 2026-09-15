/**
 * User-authored scripting, Output hook first (TODO L387; ROADMAP section 15).
 *
 * Regex scripts are the stateless special case of this: find/replace over message text.
 * The Output hook is the stateful sibling — a user-authored `(text, state) => { text, state }`
 * function run after generation, sandboxed in a Web Worker with no fetch/DOM access, with a
 * test panel in Settings.
 *
 * This module is the pure, testable core: script validation, the worker message protocol, and
 * a runner whose worker factory is injectable so unit tests never spawn a real Worker
 * (`environment: 'node'` has no Worker at all).
 */
import type { OutputHookScript } from '@/lib/types'

/** Read-only scene snapshot handed to a hook as `state` — numbers and names only. */
export interface OutputHookState {
  affection: number
  stage: string
  flags: string[]
  day: number
  phaseIndex: number
}

export interface OutputHookResult {
  text: string
  /** Timeout, worker error, thrown exception, or a malformed return — the caller keeps the original text. */
  error?: string
}

/** Request posted to the worker. `script` is the user-authored function BODY (not wrapped). */
export interface OutputHookRequest {
  type: 'run-output-hook'
  id: number
  script: string
  text: string
  state: OutputHookState
}

/** Response posted back by the worker. */
export interface OutputHookResponse {
  type: 'output-hook-result'
  id: number
  ok: boolean
  text?: string
  error?: string
}

/** How long a hook may run before the runner gives up and keeps the original text. */
export const OUTPUT_HOOK_TIMEOUT_MS = 2000

/** Max script body length — a hook is a snippet, not a bundle. */
export const OUTPUT_HOOK_MAX_LENGTH = 5000

const BANNED_TOKENS: { token: RegExp; why: string }[] = [
  { token: /\bimport\s*\(/, why: 'dynamic import()' },
  { token: /\bimport\s+[^'"]*from\b/, why: 'import statements' },
  { token: /\brequire\s*\(/, why: 'require()' },
  { token: /\bfetch\s*\(/, why: 'fetch()' },
  { token: /\bXMLHttpRequest\b/, why: 'XMLHttpRequest' },
  { token: /\bWebSocket\b/, why: 'WebSocket' },
  { token: /\bWorker\s*\(/, why: 'spawning Workers' },
  { token: /\bdocument\b/, why: 'document' },
  { token: /\bwindow\b/, why: 'window' },
  { token: /\bself\s*\.\s*(?:fetch|importScripts|postMessage)\b/, why: 'worker escape hatches' },
  { token: /\bimportScripts\s*\(/, why: 'importScripts()' },
  { token: /\beval\s*\(/, why: 'eval()' },
  { token: /\bFunction\s*\(/, why: 'Function()' },
  { token: /\bprocess\b/, why: 'process' },
  { token: /\bglobalThis\b/, why: 'globalThis' },
]

/**
 * Static gate for a user-authored hook body: rejects empty scripts, overlong scripts, and
 * bodies containing tokens that reach outside the sandbox (network, DOM, code loading).
 * Conservative by design — a false positive just means the user rewrites the snippet.
 */
export function validateOutputHookScript(script: string): { ok: boolean; error?: string } {
  if (!script.trim()) return { ok: false, error: 'Script body is empty.' }
  if (script.length > OUTPUT_HOOK_MAX_LENGTH) {
    return { ok: false, error: `Script body is over the ${OUTPUT_HOOK_MAX_LENGTH}-character limit.` }
  }
  for (const { token, why } of BANNED_TOKENS) {
    if (token.test(script)) return { ok: false, error: `Blocked: ${why} is not available in the hook sandbox.` }
  }
  // Must at least parse as a function body — `new Function` throws on syntax errors here in
  // the main thread, before anything is ever posted to the worker.
  try {
    new Function('text', 'state', script)
  } catch (e) {
    return { ok: false, error: `Syntax error: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { ok: true }
}

/** True when the hook is enabled and passes the static gate — the only hooks ever run. */
export function isRunnableOutputHook(script: Pick<OutputHookScript, 'enabled' | 'body'>): boolean {
  return script.enabled && validateOutputHookScript(script.body).ok
}

export interface OutputHookWorkerLike {
  postMessage(msg: OutputHookRequest): void
  onmessage: ((ev: { data: OutputHookResponse }) => void) | null
  terminate(): void
}

/**
 * Spawns the real worker as a separate chunk (`outputHookWorker.ts` sits next to this file,
 * so the relative URL survives the build) — never inline, never in the PWA precache as
 * application code. Call only in the browser; tests inject fakes instead.
 */
export function createOutputHookWorker(): OutputHookWorkerLike {
  const raw = new Worker(new URL('./outputHookWorker.ts', import.meta.url), { type: 'module' })
  const shaped: OutputHookWorkerLike = {
    postMessage: (msg) => raw.postMessage(msg),
    onmessage: null,
    terminate: () => raw.terminate(),
  }
  raw.onmessage = (ev: MessageEvent<OutputHookResponse>) => shaped.onmessage?.({ data: ev.data })
  return shaped
}

/**
 * Runs one hook body over `text` in a worker from `createWorker`, with a timeout. Any failure
 * (timeout, worker error, thrown exception, malformed return) resolves to the ORIGINAL text
 * plus an `error` — a hook can never blank or corrupt a reply, same guarantee the regex
 * scripts make ("one typo can't blank a message").
 */
export function runOutputHook(
  createWorker: () => OutputHookWorkerLike,
  script: string,
  text: string,
  state: OutputHookState,
  timeoutMs = OUTPUT_HOOK_TIMEOUT_MS,
): Promise<OutputHookResult> {
  return new Promise((resolve) => {
    let worker: OutputHookWorkerLike
    try {
      worker = createWorker()
    } catch (e) {
      return resolve({ text, error: `Could not start the hook worker: ${e instanceof Error ? e.message : String(e)}` })
    }
    const id = 1
    const timer = setTimeout(() => {
      try {
        worker.terminate()
      } catch {
        /* already gone */
      }
      resolve({ text, error: `Hook timed out after ${timeoutMs}ms — original text kept.` })
    }, timeoutMs)
    worker.onmessage = (ev) => {
      if (!ev.data || ev.data.id !== id) return
      clearTimeout(timer)
      try {
        worker.terminate()
      } catch {
        /* already gone */
      }
      if (!ev.data.ok) {
        resolve({ text, error: ev.data.error ?? 'Hook failed — original text kept.' })
        return
      }
      resolve(typeof ev.data.text === 'string' ? { text: ev.data.text } : { text, error: 'Hook returned no text — original kept.' })
    }
    try {
      worker.postMessage({ type: 'run-output-hook', id, script, text, state })
    } catch (e) {
      clearTimeout(timer)
      resolve({ text, error: `Could not post to the hook worker: ${e instanceof Error ? e.message : String(e)}` })
    }
  })
}

/**
 * Runs every enabled, valid hook in order over `text` — the async sibling of
 * `applyRegexScripts`. Collects per-hook errors without stopping: a failing hook keeps the
 * text-so-far and the next hook still runs. Pure orchestration; the worker factory decides
 * where code actually executes (real Worker in the app, fake in tests).
 */
export async function applyOutputHooks(
  runOne: (script: string, text: string, state: OutputHookState) => Promise<OutputHookResult>,
  scripts: OutputHookScript[] | undefined,
  text: string,
  state: OutputHookState,
): Promise<{ text: string; errors: string[] }> {
  if (!text || !scripts?.length) return { text, errors: [] }
  const errors: string[] = []
  let out = text
  for (const script of scripts) {
    if (!isRunnableOutputHook(script)) continue
    const result = await runOne(script.body, out, state)
    out = result.text
    if (result.error) errors.push(`${script.name}: ${result.error}`)
  }
  return { text: out, errors }
}
