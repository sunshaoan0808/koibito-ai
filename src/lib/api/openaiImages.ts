import { uint8ArrayToBase64 } from './binaryUtils'
import { KoboldApiError } from './types'
import type { ImageBackend, ImageGenerateParams, ImageGenerateResult } from './imageBackend'

/** Sizes the OpenAI image shape actually accepts; anything else is nudged to the nearest one. */
const COMMON_SIZES: [number, number][] = [
  [256, 256],
  [512, 512],
  [768, 768],
  [1024, 1024],
  [1024, 1536],
  [1536, 1024],
]

/** Nearest common provider size — the OpenAI request shape takes a keyword, not pixel numbers. */
export function pickOpenAIImageSize(width: number, height: number): string {
  const ratio = width / Math.max(1, height)
  let best = COMMON_SIZES[0]
  let bestScore = Number.POSITIVE_INFINITY
  for (const size of COMMON_SIZES) {
    const sizeRatio = size[0] / size[1]
    // Match shape first, then land on the closest pixel budget: a 3:2 request should not come
    // back square just because 512x512 is numerically nearer.
    const score = Math.abs(sizeRatio - ratio) * 4 + Math.abs(size[0] * size[1] - width * height) / 1e6
    if (score < bestScore) {
      bestScore = score
      best = size
    }
  }
  return `${best[0]}x${best[1]}`
}

/**
 * Any OpenAI-compatible `/v1/images/generations` endpoint: a local relay, a hosted router, or a
 * vendor that mirrors the OpenAI shape.
 *
 * Every other client in this folder bakes in one vendor's protocol (sdapi, a ComfyUI workflow,
 * NovelAI's own fields) or one fixed host, so none of them can be pointed at "whatever image
 * service the operator actually has". This one takes a base URL and a bearer token instead, which
 * is what an operator with an OpenAI-shaped upstream needs.
 */
export class OpenAIImagesClient implements ImageBackend {
  constructor(
    private baseUrl: string,
    /** Bearer token. May be empty for a local relay that ignores auth. */
    private apiKey: string,
    /** Default model id; a per-call `params.model` wins when given. */
    private model: string,
  ) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}${path}`
  }

  private headers(): Record<string, string> {
    const key = this.apiKey.trim()
    return { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }
  }

  async generateImage(params: ImageGenerateParams, signal?: AbortSignal): Promise<ImageGenerateResult> {
    if (!this.baseUrl.trim()) {
      throw new KoboldApiError('Enter the image backend base URL in Settings first.')
    }
    const model = params.model || this.model
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      n: 1,
      size: pickOpenAIImageSize(params.width, params.height),
      response_format: 'b64_json',
      ...(model ? { model } : {}),
      ...(params.seed !== undefined && params.seed >= 0 ? { seed: params.seed } : {}),
    }
    let res: Response
    try {
      res = await fetch(this.url('/v1/images/generations'), {
        method: 'POST',
        headers: this.headers(),
        signal,
        body: JSON.stringify(body),
      })
    } catch (e) {
      if (signal?.aborted) throw e
      throw new KoboldApiError(`Could not reach the image backend at ${this.baseUrl}. Is it running?`)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new KoboldApiError(`Image generation failed (${res.status}): ${text.slice(0, 300)}`, res.status)
    }
    const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
    const first = data.data?.[0] ?? {}
    if (first.b64_json) return { base64: first.b64_json }
    if (first.url) {
      // Some relays answer with a link even when base64 was requested. Fetch it so callers always
      // get bytes: messages store base64 with no `data:` prefix.
      const image = await fetch(first.url, { signal })
      if (!image.ok) throw new KoboldApiError(`The returned image URL could not be fetched (${image.status}).`, image.status)
      const bytes = new Uint8Array(await image.arrayBuffer())
      return { base64: uint8ArrayToBase64(bytes), mimeType: image.headers.get('Content-Type') ?? undefined }
    }
    throw new KoboldApiError('The image backend answered without an image.')
  }

  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(this.url('/v1/models'), { headers: this.headers() })
      if (!res.ok) return []
      const data = (await res.json()) as { data?: { id?: string }[] }
      return (data.data ?? []).map((m) => m.id ?? '').filter(Boolean)
    } catch {
      return []
    }
  }
}
