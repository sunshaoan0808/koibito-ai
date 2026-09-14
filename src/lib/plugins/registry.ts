import type { PromptSectionId } from '@/lib/prompt/builder'
import { SLASH_COMMANDS } from '@/lib/chat/slashCommands'
import type {
  CommandHook,
  PluginContribution,
  PluginGrants,
  PluginManifest,
  PromptHook,
  PromptHookContext,
  ViewHook,
} from './types'

export interface HookStats {
  pluginId: string
  hook: string
  calls: number
  failed: number
  /** Total time spent inside this hook, for the dev panel's 5ms warning. */
  totalMs: number
}

export interface ApplyPromptHooksResult {
  sections: Record<PromptSectionId, string>
  /** Hooks that threw. A broken plugin must not be able to fail the whole assembly. */
  failed: number
}

interface RegisteredPlugin {
  manifest: PluginManifest
  prompt: PromptHook[]
  commands: CommandHook[]
  views: ViewHook[]
}

/**
 * The plugin registry: a **static** in-repo registry. Nothing is loaded dynamically here, so
 * there is no `eval` and no supply-chain surface — phase 2 can add a directory, but it must bring
 * the capability prompt with it, because loading code means running code.
 *
 * Three rules it enforces, all of them by refusal rather than silent correction:
 * 1. A hook may only be registered if its manifest **declared** the capability for it.
 * 2. A command name may not collide with a built-in or with another plugin's — no shadowing.
 * 3. A write hook does nothing until `prompt:write` is granted, and when it is not granted it is
 *    **not called at all** (as opposed to being called and discarded).
 */
export class PluginRegistry {
  private registered = new Map<string, RegisteredPlugin>()
  private grants = new Map<string, PluginGrants>()
  private reserved: Set<string>
  private hookStats = new Map<string, HookStats>()
  private clock: () => number

  /** `clock` is injectable so tests can assert timings without sleeping. */
  constructor(options: { reservedCommandNames?: string[]; now?: () => number } = {}) {
    // Built-ins are reserved by construction — a plugin may never shadow `/roll` or `/help`.
    this.reserved = new Set(
      options.reservedCommandNames ??
        SLASH_COMMANDS.flatMap((command) => [command.name, ...command.aliases]),
    )
    this.clock = options.now ?? (() => (typeof performance === 'undefined' ? Date.now() : performance.now()))
  }

  register(contribution: PluginContribution): void {
    const { manifest } = contribution
    if (this.registered.has(manifest.id)) {
      throw new Error(`plugin "${manifest.id}" is already registered`)
    }

    const prompt = contribution.prompt ?? []
    const commands = contribution.commands ?? []
    const views = contribution.views ?? []

    // Rule 1: every hook must be covered by a declared capability.
    if (prompt.some((hook) => hook.transform) && !manifest.capabilities.includes('prompt:write')) {
      throw new Error(`plugin "${manifest.id}" has a transform hook without the "prompt:write" capability`)
    }
    if (prompt.some((hook) => hook.observe) && !manifest.capabilities.includes('prompt:read')) {
      throw new Error(`plugin "${manifest.id}" has an observe hook without the "prompt:read" capability`)
    }
    if (commands.length > 0 && !manifest.capabilities.includes('commands')) {
      throw new Error(`plugin "${manifest.id}" contributes commands without the "commands" capability`)
    }
    if (views.length > 0 && !manifest.capabilities.includes('views')) {
      throw new Error(`plugin "${manifest.id}" contributes views without the "views" capability`)
    }

    // Rule 2: command names are unique against built-ins and against every other plugin, aliases
    // included. Refusing beats silently picking a winner.
    for (const command of commands) {
      if (this.reserved.has(command.name)) {
        throw new Error(`command "/${command.name}" from plugin "${manifest.id}" collides with a built-in command`)
      }
      const taken = [...this.registered.values()].some((plugin) =>
        plugin.commands.some((existing) => existing.name === command.name),
      )
      if (taken) {
        throw new Error(`command "/${command.name}" from plugin "${manifest.id}" is already provided by another plugin`)
      }
    }

    const takenViews = new Set([...this.registered.values()].flatMap((plugin) => plugin.views.map((view) => view.id)))
    for (const view of views) {
      if (takenViews.has(view.id)) {
        throw new Error(`view "${view.id}" from plugin "${manifest.id}" is already provided by another plugin`)
      }
    }

    this.registered.set(manifest.id, { manifest, prompt, commands, views })
    this.grants.set(manifest.id, {})
  }

  /** Registered plugins, in registration order. */
  plugins(): PluginManifest[] {
    return [...this.registered.values()].map((plugin) => plugin.manifest)
  }

  commands(): CommandHook[] {
    return [...this.registered.values()].flatMap((plugin) => plugin.commands)
  }

  views(): ViewHook[] {
    return [...this.registered.values()].flatMap((plugin) => plugin.views)
  }

  grantsFor(pluginId: string): PluginGrants {
    return { ...(this.grants.get(pluginId) ?? {}) }
  }

  setGrant(pluginId: string, capability: 'prompt:write' | 'net', granted: boolean): void {
    if (!this.registered.has(pluginId)) throw new Error(`unknown plugin "${pluginId}"`)
    const current = this.grants.get(pluginId) ?? {}
    this.grants.set(pluginId, { ...current, [capability]: granted })
  }

  stats(): HookStats[] {
    return [...this.hookStats.values()]
  }

  /** Read-only hooks, for logging and counters. Return values are discarded by design. */
  runPromptObservers(ctx: PromptHookContext): number {
    let failed = 0
    for (const { manifest, hook } of this.promptHooks((plugin, h) => Boolean(h.observe) && plugin.manifest.capabilities.includes('prompt:read'))) {
      const started = this.clock()
      let threw = false
      try {
        hook.observe?.(ctx)
      } catch {
        threw = true
        failed += 1
      }
      this.record(manifest.id, hook.id, started, threw)
    }
    return failed
  }

  /**
   * Rule 3: only granted write hooks run, each in its own try/catch, in `manifest.order` then
   * plugin-id order. `failed` counts hooks that threw — the caller decides what to do about it,
   * but it can always use the returned sections: a broken plugin cannot take the turn down.
   */
  applyPromptHooks(
    sections: Record<PromptSectionId, string>,
    ctx: PromptHookContext,
  ): ApplyPromptHooksResult {
    const out = { ...sections }
    let failed = 0
    const hooks = this.promptHooks(
      (plugin, hook) =>
        Boolean(hook.transform) &&
        plugin.manifest.capabilities.includes('prompt:write') &&
        this.grantsFor(plugin.manifest.id)['prompt:write'] === true,
    )

    for (const { manifest, hook } of hooks) {
      let hookThrew = false
      for (const section of Object.keys(out) as PromptSectionId[]) {
        const text = out[section]
        if (!text) continue
        const started = this.clock()
        let callThrew = false
        try {
          const next = hook.transform?.(section, text, ctx)
          if (typeof next === 'string') out[section] = next
        } catch {
          callThrew = true
          hookThrew = true
        }
        this.record(manifest.id, hook.id, started, callThrew)
      }
      // One broken hook counts once, however many sections it fell over on: the number the caller
      // acts on is "how many hooks are misbehaving", not "how many calls failed". Per-call detail
      // is still in `stats()`.
      if (hookThrew) failed += 1
    }

    return { sections: out, failed }
  }

  /** Prompt hooks that pass `allow`, ordered by `manifest.order` then plugin id (reproducible). */
  private promptHooks(
    allow: (plugin: RegisteredPlugin, hook: PromptHook) => boolean,
  ): Array<{ manifest: PluginManifest; hook: PromptHook }> {
    return [...this.registered.values()]
      .sort((a, b) => (a.manifest.order ?? 0) - (b.manifest.order ?? 0) || a.manifest.id.localeCompare(b.manifest.id))
      .flatMap((plugin) => plugin.prompt.filter((hook) => allow(plugin, hook)).map((hook) => ({ manifest: plugin.manifest, hook })))
  }

  private record(pluginId: string, hookId: string, started: number, threw: boolean): void {
    const key = `${pluginId}:${hookId}`
    const previous = this.hookStats.get(key) ?? { pluginId, hook: hookId, calls: 0, failed: 0, totalMs: 0 }
    this.hookStats.set(key, {
      ...previous,
      calls: previous.calls + 1,
      failed: previous.failed + (threw ? 1 : 0),
      totalMs: previous.totalMs + (this.clock() - started),
    })
  }
}
