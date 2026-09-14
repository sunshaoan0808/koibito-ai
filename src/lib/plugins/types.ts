import type { ReactNode } from 'react'
import type { PromptSectionId } from '@/lib/prompt/builder'

export type { PromptSectionId }

/**
 * Declarative capabilities. Nothing is sandboxed — every plugin runs in-process with full
 * privileges — so this list is a **contract**, not a security boundary: the registry refuses to
 * register a hook whose capability was not declared, and the user separately grants the two
 * capabilities that can change behaviour (`prompt:write`, `net`) before they do anything.
 *
 * Say it plainly in any UI built on this: installing a third-party plugin is trusting its code.
 */
export type PluginCapability = 'prompt:read' | 'prompt:write' | 'commands' | 'views' | 'net'

export interface PluginManifest {
  id: string
  name: string
  version: string
  capabilities: PluginCapability[]
  /** Serial order for write hooks. Equal orders fall back to plugin id, so runs are reproducible. */
  order?: number
}

export interface PromptHookContext {
  /** Sections the engine is about to assemble. Read-only by construction. */
  sections: PromptSectionId[]
  chatId: string
  characterId?: string
}

/**
 * L1 — prompt sections. `observe` may read, `transform` may edit one section's text.
 * Returning `undefined` from `transform` means "leave it alone"; it is not the same as returning
 * an empty string, which would blank the section.
 */
export interface PromptHook {
  id: string
  observe?(ctx: PromptHookContext): void
  transform?(section: PromptSectionId, text: string, ctx: PromptHookContext): string | undefined
}

/** L2 — slash commands. `run` gets the args and returns what to insert; it does no I/O of its own. */
export interface CommandContext {
  chatId?: string
  characterId?: string
}

export interface CommandResult {
  /** Text to place into the composer. */
  insert?: string
  /** Human-readable failure; the composer shows it instead of inserting anything. */
  error?: string
}

export interface CommandHook {
  /** Without the leading slash. Must not collide with a built-in or another plugin's command. */
  name: string
  description: string
  run(args: string, ctx: CommandContext): CommandResult
}

/** L3 — views. `render` must build on the existing components; the registry cannot enforce that. */
export interface ViewHook {
  id: string
  label: string
  render(): ReactNode
}

/** What one plugin contributes. `manifest.capabilities` must cover every hook that is present. */
export interface PluginContribution {
  manifest: PluginManifest
  prompt?: PromptHook[]
  commands?: CommandHook[]
  views?: ViewHook[]
}

/** Grants are per plugin and default to off for everything that changes behaviour. */
export interface PluginGrants {
  'prompt:write'?: boolean
  net?: boolean
}
