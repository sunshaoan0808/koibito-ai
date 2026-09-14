/**
 * RisuAI-style inline asset embeds — `{{image::name}}` anywhere in a message, so a character can
 * "send a photo" mid-chat. Pure parsing only: no I/O, no React, no knowledge of where an asset
 * physically lives. The render site (`text/messageText.tsx`) and the export path both walk these
 * segments, so both agree on what a message contains.
 */

/** `{{ image :: name }}` — spaces and casing are tolerated, the name runs to the first `}`. */
const INLINE_ASSET = /\{\{\s*image\s*::\s*([^}]+?)\s*\}\}/gi

export interface InlineAssetSegment {
  kind: 'text' | 'asset'
  /** Present on `text` segments; the raw run between embeds. */
  text: string
  /** Present on `asset` segments; the name exactly as written (trimmed). */
  name: string
}

/**
 * Splits `text` into alternating text/asset segments. A syntactically valid ref whose asset is
 * missing still becomes an `asset` segment — resolving is the renderer's job, so a miss can be shown
 * honestly (a placeholder) instead of silently vanishing from the transcript.
 */
export function splitInlineAssets(text: string): InlineAssetSegment[] {
  const segments: InlineAssetSegment[] = []
  let cursor = 0
  INLINE_ASSET.lastIndex = 0
  for (let match = INLINE_ASSET.exec(text); match; match = INLINE_ASSET.exec(text)) {
    if (match.index > cursor) segments.push({ kind: 'text', text: text.slice(cursor, match.index), name: '' })
    segments.push({ kind: 'asset', text: '', name: match[1].trim() })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor), name: '' })
  return segments
}

/** Names referenced by the text, in order, de-duped case-insensitively (first spelling wins). */
export function extractInlineAssets(text: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const segment of splitInlineAssets(text)) {
    if (segment.kind !== 'asset') continue
    const key = segment.name.toLowerCase()
    if (!segment.name || seen.has(key)) continue
    seen.add(key)
    names.push(segment.name)
  }
  return names
}

/** Whether the text carries any embed at all — the cheap check the render path can branch on. */
export function hasInlineAssets(text: string): boolean {
  INLINE_ASSET.lastIndex = 0
  return INLINE_ASSET.test(text)
}

/** `name` → asset reference, case-insensitive. Missing/blank assets resolve to `null`, never ''. */
export function resolveInlineAsset(name: string, assets: Record<string, string> | undefined): string | null {
  const wanted = name.trim().toLowerCase()
  if (!wanted || !assets) return null
  for (const [key, value] of Object.entries(assets)) {
    if (key.trim().toLowerCase() === wanted) return value || null
  }
  return null
}
