import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ImageBackendSettings } from '@/lib/api/createImageBackend'
import { appendImage, generateTurnImage, imageBackendBlocker, sceneSnapshotPrompt, TURN_IMAGE_DEFAULTS } from './turnImage'

const generateImage = vi.fn()
vi.mock('@/lib/api/createImageBackend', () => ({
  createImageBackend: vi.fn(() => ({ generateImage, listModels: async () => [] })),
}))

const { createImageBackend } = await import('@/lib/api/createImageBackend')

function settings(over: Partial<ImageBackendSettings> = {}): ImageBackendSettings {
  return {
    imageBackend: 'openai-images',
    imageBackendBaseUrl: 'https://gw.example/v1',
    imageBackendUsername: '',
    imageBackendPassword: '',
    imageBackendModel: 'grok-imagine-image-2.0',
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  generateImage.mockResolvedValue({ base64: 'QUJD', mimeType: 'image/png', seed: 7 })
})

describe('imageBackendBlocker', () => {
  it('accepts a configured OpenAI-compatible backend', () => {
    expect(imageBackendBlocker(settings())).toBeNull()
  })

  it('names the missing Server URL for the backends that need one', () => {
    for (const backend of ['a1111', 'comfyui', 'swarmui', 'openai-images'] as const) {
      expect(imageBackendBlocker(settings({ imageBackend: backend, imageBackendBaseUrl: '   ' }))).toMatch(/Server URL/)
    }
  })

  it('does not demand a Server URL from a hosted backend that has none', () => {
    expect(imageBackendBlocker(settings({ imageBackend: 'openmayhem', imageBackendBaseUrl: '', openMayhemApiKey: 'k' }))).toBeNull()
  })

  it('demands the API key of each hosted backend', () => {
    expect(imageBackendBlocker(settings({ imageBackend: 'openmayhem', openMayhemApiKey: '' }))).toMatch(/API key/)
    expect(imageBackendBlocker(settings({ imageBackend: 'novelai-image', imageBackendUsername: '' }))).toMatch(/API key/)
    expect(imageBackendBlocker(settings({ imageBackend: 'novelai-image', imageBackendUsername: 'k' }))).toBeNull()
  })
})

describe('generateTurnImage', () => {
  it('refuses to call the backend at all when unconfigured', async () => {
    await expect(generateTurnImage({ settings: settings({ imageBackendBaseUrl: '' }), prompt: 'x' })).rejects.toThrow(/Server URL/)
    expect(createImageBackend).not.toHaveBeenCalled()
    expect(generateImage).not.toHaveBeenCalled()
  })

  it('passes the turn defaults, a random seed, and omits a blank model', async () => {
    await generateTurnImage({ settings: settings({ imageBackendModel: '  ' }), prompt: 'a rooftop at dusk' })
    expect(generateImage).toHaveBeenCalledWith(
      { prompt: 'a rooftop at dusk', ...TURN_IMAGE_DEFAULTS, model: undefined, seed: -1 },
      undefined,
    )
  })

  it('returns a data URL built from the reported mime type', async () => {
    generateImage.mockResolvedValue({ base64: 'QUJD', mimeType: 'image/webp', seed: 3 })
    await expect(generateTurnImage({ settings: settings(), prompt: 'x' })).resolves.toEqual({
      dataUrl: 'data:image/webp;base64,QUJD',
      seed: 3,
    })
  })

  it('falls back to png when the backend reports no mime type', async () => {
    generateImage.mockResolvedValue({ base64: 'QUJD' })
    const result = await generateTurnImage({ settings: settings(), prompt: 'x' })
    expect(result.dataUrl).toBe('data:image/png;base64,QUJD')
  })

  it("surfaces the backend's own failure instead of swallowing it", async () => {
    generateImage.mockRejectedValue(new Error('Image generation failed (401): Invalid API key.'))
    await expect(generateTurnImage({ settings: settings(), prompt: 'x' })).rejects.toThrow(/401/)
  })
})

describe('appendImage', () => {
  it('appends without mutating the existing array', () => {
    const existing = ['data:image/png;base64,QQ==']
    const next = appendImage(existing, 'data:image/png;base64,Qg==')
    expect(next).toHaveLength(2)
    expect(existing).toHaveLength(1)
    expect(appendImage(undefined, 'x')).toEqual(['x'])
  })
})

describe('sceneSnapshotPrompt', () => {
  it('draws the newest character reply, prefixed as a picture rather than a continuation', () => {
    const prompt = sceneSnapshotPrompt([
      { role: 'user', text: '你在吗？' },
      { role: 'char', text: '*She looks up.* "I am here."' },
    ])
    expect(prompt).toBe('anime style illustration, cinematic lighting: *She looks up.* "I am here."')
  })

  it('takes the last character reply, not the first or the newest line overall', () => {
    const prompt = sceneSnapshotPrompt([
      { role: 'char', text: 'first' },
      { role: 'user', text: 'a later user line' },
      { role: 'char', text: 'second' },
    ])
    expect(prompt).toContain('second')
    expect(prompt).not.toContain('first')
    expect(prompt).not.toContain('a later user line')
  })

  it('skips a blank character reply instead of drawing an empty scene', () => {
    expect(sceneSnapshotPrompt([{ role: 'char', text: '   ' }, { role: 'char', text: 'real' }])).toContain('real')
  })

  it('returns null when the character has not spoken yet, so the caller can explain why', () => {
    expect(sceneSnapshotPrompt([])).toBeNull()
    expect(sceneSnapshotPrompt([{ role: 'user', text: 'hello?' }])).toBeNull()
    expect(sceneSnapshotPrompt([{ role: 'char' }])).toBeNull()
  })

  it('caps how much transcript reaches the backend', () => {
    const prompt = sceneSnapshotPrompt([{ role: 'char', text: 'x'.repeat(5000) }])
    // prefix + the capped scene, never the whole turn
    expect(prompt).toHaveLength('anime style illustration, cinematic lighting: '.length + 900)
  })
})
