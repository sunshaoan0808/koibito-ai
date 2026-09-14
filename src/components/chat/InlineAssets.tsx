import type { ReactNode } from 'react'
import { hasInlineAssets, resolveInlineAsset, splitInlineAssets } from '@/lib/text/inlineAssets'

/**
 * Renders one plain run of message text, turning `{{image::name}}` into an image. A ref whose asset
 * is missing shows the name in a quiet chip instead of vanishing — a broken embed must never silently
 * disappear from the transcript (same rule the parser follows).
 */
export function InlineAssets({
  text,
  assets,
  keyPrefix,
}: {
  text: string
  assets?: Record<string, string>
  keyPrefix: string
}): ReactNode {
  if (!hasInlineAssets(text)) return text
  return splitInlineAssets(text).map((seg, i) => {
    if (seg.kind === 'text') return <span key={`${keyPrefix}t${i}`}>{seg.text}</span>
    const src = resolveInlineAsset(seg.name, assets)
    return src ? (
      <img key={`${keyPrefix}a${i}`} src={src} alt={seg.name} className="mt-1 max-h-64 rounded-xl" />
    ) : (
      <span key={`${keyPrefix}a${i}`} className="rounded bg-bg-sunken px-1 text-[11px] text-text-muted">
        {seg.name}
      </span>
    )
  })
}
