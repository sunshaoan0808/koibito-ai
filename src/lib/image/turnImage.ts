import { createImageBackend, type ImageBackendSettings } from '@/lib/api/createImageBackend'
import type { ImageBackendId } from '@/lib/api/imageBackend'

/**
 * The image pipeline behind `/image` (P2-5): settings → backend → bytes → a data URL the message's
 * attachment slot can hold. Kept out of the components so the "not configured yet" path is unit-
 * testable — the whole point of this module is that a missing backend reads as an explicit error
 * rather than a button that quietly does nothing.
 */

/** One square 1024 image: a message attachment renders at thumbnail size, and the OpenAI image shape only accepts keyword sizes anyway. */
export const TURN_IMAGE_DEFAULTS = { width: 1024, height: 1024, steps: 28, cfgScale: 7 } as const

/** Backends that can't do anything until an operator fills the Server URL. */
const NEEDS_BASE_URL: ReadonlySet<ImageBackendId> = new Set(['a1111', 'comfyui', 'swarmui', 'openai-images'])
/** Backends whose base URL is fixed but which need a credential (`imageBackendUsername` doubles as the key, matching NovelAI's precedent). */
const NEEDS_KEY: ReadonlySet<ImageBackendId> = new Set(['novelai-image'])

/**
 * Why image generation can't run right now, or `null` when it can. Checked before the request is
 * fired, so an unconfigured deployment says so instead of sending a call that can only fail.
 */
export function imageBackendBlocker(settings: ImageBackendSettings): string | null {
  if (NEEDS_BASE_URL.has(settings.imageBackend) && !settings.imageBackendBaseUrl.trim()) {
    return 'Image backend not configured: set its Server URL in Settings → Image generation.'
  }
  if (settings.imageBackend === 'openmayhem' && !(settings.openMayhemApiKey ?? '').trim()) {
    return 'OpenMayhem image generation needs its API key (Settings → Image generation).'
  }
  if (NEEDS_KEY.has(settings.imageBackend) && !settings.imageBackendUsername.trim()) {
    return 'Image backend not configured: this one needs its API key in Settings → Image generation.'
  }
  return null
}

export interface TurnImageRequest {
  settings: ImageBackendSettings
  prompt: string
  signal?: AbortSignal
}

export interface TurnImage {
  /** `data:` URL — exactly what `message.images` entries are rendered as. */
  dataUrl: string
  /** The seed the backend actually used, when it reports one. */
  seed?: number
}

/**
 * Generates one image for a chat turn. Throws (with the blocker's message) instead of resolving to
 * an empty result, so callers can surface the reason verbatim.
 */
export async function generateTurnImage(req: TurnImageRequest): Promise<TurnImage> {
  const blocker = imageBackendBlocker(req.settings)
  if (blocker) throw new Error(blocker)

  const backend = createImageBackend(req.settings)
  const { base64, mimeType, seed } = await backend.generateImage(
    {
      prompt: req.prompt,
      ...TURN_IMAGE_DEFAULTS,
      // Empty means "whatever the backend has loaded", so it's omitted rather than sent blank.
      model: req.settings.imageBackendModel.trim() || undefined,
      // -1 is this app's "pick a random seed" convention.
      seed: -1,
    },
    req.signal,
  )
  return { dataUrl: `data:${mimeType || 'image/png'};base64,${base64}`, seed }
}

/** Appends to whatever a message already carries — one turn can gather several images. */
export function appendImage(existing: string[] | undefined, dataUrl: string): string[] {
  return [...(existing ?? []), dataUrl]
}

/**
 * The slice of a transcript entry the snapshot builder needs. Structural rather than the full
 * message type, so this stays a pure text-in/text-out step that a unit test can drive directly.
 */
export interface SnapshotMessage {
  role: string
  text?: string
}

/**
 * The scene text is roleplay prose ("*She does not look up…*"), so the model has to be told it is
 * drawing a picture rather than continuing the conversation.
 */
const SNAPSHOT_STYLE_PREFIX = 'anime style illustration, cinematic lighting: '

/**
 * How much transcript to keep. Measured against the live backend: 900 characters of scene finished
 * in ~20 s and still read as one moment; feeding the whole turn just dilutes it.
 */
const SNAPSHOT_SCENE_LIMIT = 900

/**
 * Builds the prompt for an on-demand in-chat scene snapshot (AI Dungeon's "See"): the image shows
 * *what is happening right now*, so the newest character reply **is** the scene — the writer
 * clicks once and gets the moment drawn, with no description to type.
 *
 * Returns `null` when there is no character reply to draw, so the caller can say why rather than
 * firing a request with an empty prompt. Deliberately no LLM summarisation step in between: that
 * would turn a one-click action into a second, slower model round-trip for no gain.
 */
export function sceneSnapshotPrompt(messages: readonly SnapshotMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'char') continue
    const scene = (message.text ?? '').trim()
    if (!scene) continue
    return SNAPSHOT_STYLE_PREFIX + scene.slice(0, SNAPSHOT_SCENE_LIMIT)
  }
  return null
}
