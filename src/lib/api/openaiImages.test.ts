import { describe, expect, it, vi, afterEach } from 'vitest'
import { OpenAIImagesClient, pickOpenAIImageSize } from './openaiImages'

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  } as unknown as Response
}

describe('pickOpenAIImageSize', () => {
  it('snaps to the keywords the OpenAI image shape accepts', () => {
    expect(pickOpenAIImageSize(1024, 1024)).toBe('1024x1024')
    // Portrait/landscape requests land on the gpt-image-1 pair (the set current relays accept);
    // the old dall-e-3 1792 pair is deliberately not emitted.
    expect(pickOpenAIImageSize(768, 1344)).toBe('1024x1536')
    expect(pickOpenAIImageSize(1344, 768)).toBe('1536x1024')
    // An exact hit stays exact — small requests are not inflated to the largest square.
    expect(pickOpenAIImageSize(512, 512)).toBe('512x512')
  })
})

describe('OpenAIImagesClient', () => {
  it('posts a b64_json request to the configured base URL', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ b64_json: 'QUJD' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new OpenAIImagesClient('https://gw.example/v1/', 'sekret', 'grok-imagine-image-2.0')
    const result = await client.generateImage({ prompt: 'a quiet street', width: 1024, height: 1792, steps: 28, cfgScale: 7, seed: 42 })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://gw.example/v1/v1/images/generations')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sekret')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({ model: 'grok-imagine-image-2.0', prompt: 'a quiet street', n: 1, size: '1024x1536', response_format: 'b64_json', seed: 42 })
    expect(result.base64).toBe('QUJD')
  })

  it('omits the Authorization header and a random seed for a keyless local relay', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [{ b64_json: 'QQ==' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new OpenAIImagesClient('http://127.0.0.1:8080', '', '')
    await client.generateImage({ prompt: 'x', width: 512, height: 512, steps: 20, cfgScale: 7, seed: -1 })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
    const body = JSON.parse(String(init.body))
    expect(body.seed).toBeUndefined()
    expect(body.model).toBeUndefined()
  })

  it('fetches a URL answer into base64 so callers always get bytes', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/v1/images/generations')) return jsonResponse({ data: [{ url: 'https://cdn.example/a.png' }] })
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([65, 66, 67]).buffer,
        headers: new Headers({ 'Content-Type': 'image/webp' }),
      } as unknown as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = new OpenAIImagesClient('http://relay.local', '', 'm')
    const result = await client.generateImage({ prompt: 'x', width: 1024, height: 1024, steps: 20, cfgScale: 7 })
    expect(result.base64).toBe('QUJD')
    expect(result.mimeType).toBe('image/webp')
  })

  it('refuses to call out without a base URL instead of guessing one', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const client = new OpenAIImagesClient('  ', '', 'm')
    await expect(client.generateImage({ prompt: 'x', width: 1024, height: 1024, steps: 20, cfgScale: 7 })).rejects.toThrow(/base URL/i)
  })

  it('surfaces the upstream error body and status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'Invalid API key.', headers: new Headers() } as unknown as Response)))
    const client = new OpenAIImagesClient('http://relay.local', 'bad', 'm')
    await expect(client.generateImage({ prompt: 'x', width: 1024, height: 1024, steps: 20, cfgScale: 7 })).rejects.toThrow(/401/)
  })

  it('treats an answer with no image as a failure, not an empty success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [] })))
    const client = new OpenAIImagesClient('http://relay.local', '', 'm')
    await expect(client.generateImage({ prompt: 'x', width: 1024, height: 1024, steps: 20, cfgScale: 7 })).rejects.toThrow(/without an image/)
  })

  it('reports a friendly error when the host is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))))
    const client = new OpenAIImagesClient('http://10.0.0.9:9999', '', 'm')
    await expect(client.generateImage({ prompt: 'x', width: 1024, height: 1024, steps: 20, cfgScale: 7 })).rejects.toThrow(/Could not reach/)
  })

  it('returns an empty model list rather than throwing when introspection fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, headers: new Headers() } as unknown as Response)))
    const client = new OpenAIImagesClient('http://relay.local', '', 'm')
    await expect(client.listModels()).resolves.toEqual([])
  })
})
