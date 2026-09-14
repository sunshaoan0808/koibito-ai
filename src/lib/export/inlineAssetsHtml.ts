import { urlToDataUrl } from '@/lib/characters/pack'
import { resolveInlineAsset, splitInlineAssets } from '@/lib/text/inlineAssets'

/**
 * Export-side inline assets (`{{image::name}}`). The transcript/EPUB exports promise to be
 * self-contained — avatars are already inlined as data URLs for exactly that reason — so assets are
 * inlined too, **once up front**, which keeps the per-message render functions synchronous.
 */
export async function resolveAssetMap(assets: Record<string, string> | undefined): Promise<Record<string, string>> {
  if (!assets) return {}
  const pairs = await Promise.all(
    Object.entries(assets).map(async ([name, url]) => [name, (await urlToDataUrl(url)) ?? ''] as const),
  )
  return Object.fromEntries(pairs.filter(([, url]) => !!url))
}

/** One plain run of text → HTML, with `{{image::name}}` as an inline image. A miss keeps the name
 *  visible (same rule as the app: a broken embed must not silently vanish). `escape` is injected so
 *  callers keep their own escaping (each export has its own). */
export function inlineAssetsHtml(
  content: string,
  assets: Record<string, string> | undefined,
  escape: (value: string) => string,
): string {
  return splitInlineAssets(content)
    .map((part) => {
      if (part.kind === 'text') return escape(part.text)
      const src = resolveInlineAsset(part.name, assets)
      if (!src) {
        return `<span style="display:inline-block;border-radius:4px;padding:0 4px;font-size:0.85em">${escape(part.name)}</span>`
      }
      return `<img style="max-height:16rem;border-radius:12px;margin:4px 0" src="${escape(src)}" alt="${escape(part.name)}">`
    })
    .join('')
}
