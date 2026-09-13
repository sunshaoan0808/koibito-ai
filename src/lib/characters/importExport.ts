import { extractCardAssets, normalizeCardJson, wrapCardV2, type CharacterCardData } from './cardSpec'
import { withGrowth, type GrowthSnapshot } from './exportWithGrowth'
import { byafFlatCard, imageMimeFromPath, isByafFlatCard, isZipArchive, parseByafArchive } from './byaf'
import { uint8ArrayToBase64 } from '@/lib/api/binaryUtils'
import type { CustomExpression } from '@/lib/vn/expressions'
import { readCharacterFromPng, writeCharacterToPng } from './png'

export async function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export interface ImportResult {
  card: CharacterCardData
  avatarDataUrl?: string
  /** Character Card V3 `emotion` assets, mapped to expression ids — empty for a plain V1/V2 card. */
  sprites?: Record<string, string>
  /** Expression ids from V3 assets that aren't in the built-in set. */
  customExpressions?: CustomExpression[]
}

/**
 * Imports a card from a .png (embedded metadata), .json, or Backyard AI (BYAF) file.
 *
 * The BYAF branches come before the plain JSON one and are keyed off the file's own content, not
 * its extension: a zip is a BYAF archive, and a flat JSON is BYAF only when it carries BYAF-only
 * field names (see `isByafFlatCard`) — so the existing V1/V2/V3 paths keep their old behavior.
 */
export async function importCharacterFile(file: File): Promise<ImportResult> {
  if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
    const raw = await readCharacterFromPng(file)
    const card = normalizeCardJson(raw)
    const assets = extractCardAssets(raw)
    // The PNG's own pixels are the portrait (a V3 `icon` asset is usually `ccdefault:` = "this image").
    const avatarDataUrl = await fileToDataUrl(file)
    return { card, avatarDataUrl, sprites: assets.sprites, customExpressions: assets.customExpressions }
  }
  // BYAF archives are zips; sniff the local-header signature rather than trusting the name, since
  // the same card also travels as `.zip` / `.byaf` / a bare `.dat`.
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  if (isZipArchive(signature)) {
    const archive = await parseByafArchive(new Uint8Array(await file.arrayBuffer()))
    const portrait = archive.images[0]
    return {
      card: archive.card,
      avatarDataUrl: portrait
        ? `data:${imageMimeFromPath(portrait.path)};base64,${uint8ArrayToBase64(portrait.bytes)}`
        : undefined,
    }
  }
  const text = await file.text()
  const raw = JSON.parse(text)
  if (isByafFlatCard(raw)) return { card: byafFlatCard(raw as Record<string, unknown>) }
  const card = normalizeCardJson(raw)
  const assets = extractCardAssets(raw)
  return {
    card,
    avatarDataUrl: assets.avatarDataUrl,
    sprites: assets.sprites,
    customExpressions: assets.customExpressions,
  }
}

export function downloadJson(card: CharacterCardData) {
  const blob = new Blob([JSON.stringify(wrapCardV2(card), null, 2)], { type: 'application/json' })
  triggerDownload(blob, `${sanitizeFilename(card.name)}.json`)
}

/** P1-1 成长回写：带成长导出（把年轮/关系/心结烘焙进 `extensions.rp_growth`）。 */
export function downloadJsonWithGrowth(card: CharacterCardData, snap: GrowthSnapshot) {
  const blob = new Blob([JSON.stringify(wrapCardV2(withGrowth(card, snap)), null, 2)], {
    type: 'application/json',
  })
  triggerDownload(blob, `${sanitizeFilename(card.name)}.json`)
}

export async function downloadPng(card: CharacterCardData, avatarDataUrl?: string) {
  const avatarBlob = avatarDataUrl
    ? await (await fetch(avatarDataUrl)).blob()
    : await blankAvatarBlob()
  const pngBlob = await writeCharacterToPng(avatarBlob, wrapCardV2(card))
  triggerDownload(pngBlob, `${sanitizeFilename(card.name)}.png`)
}

/** P1-1 成长回写：带成长导出（PNG，成长走 tEXt chunk，ST 侧未知键忽略）。 */
export async function downloadPngWithGrowth(
  card: CharacterCardData,
  snap: GrowthSnapshot,
  avatarDataUrl?: string,
) {
  const avatarBlob = avatarDataUrl
    ? await (await fetch(avatarDataUrl)).blob()
    : await blankAvatarBlob()
  const pngBlob = await writeCharacterToPng(avatarBlob, wrapCardV2(withGrowth(card, snap)))
  triggerDownload(pngBlob, `${sanitizeFilename(card.name)}.png`)
}

function sanitizeFilename(name: string): string {
  return (name || 'character').replace(/[^a-z0-9-_ ]/gi, '').trim() || 'character'
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function blankAvatarBlob(): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 600
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
}
