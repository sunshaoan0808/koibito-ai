/**
 * A stable colour per speaker, for the VN backlog's translucent log.
 *
 * Deterministic on purpose: the same name always lands on the same hue, across reloads, sessions
 * and machines, so the reader learns "blue is Aoi" instead of watching the palette shuffle every
 * time the log re-renders. The hues are hand-picked and evenly spread so two characters in the same
 * scene stay tellable apart, and every one of them is legible as a thin stripe on a dark backdrop.
 */

/** Ten hues, ~36° apart, skipping the muddy yellow-greens; index by hash, never by list position. */
const SPEAKER_HUES = [352, 20, 42, 68, 96, 150, 176, 205, 245, 288] as const

/** FNV-1a, 32-bit. Small, stable, and not order-sensitive like a running sum would be. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The stripe colour for `seed` (a speaker name), as an `hsl()` string with the given alpha. */
export function speakerTint(seed: string, alpha = 0.85): string {
  const trimmed = seed.trim()
  const hue = trimmed ? SPEAKER_HUES[hashSeed(trimmed.toLowerCase()) % SPEAKER_HUES.length] : SPEAKER_HUES[0]
  const a = Math.min(1, Math.max(0, alpha))
  return `hsl(${hue} 70% 62% / ${a})`
}

/**
 * The seed for a message's speaker. The narrator and the user get fixed seeds so the log reads
 * consistently, while every character keys off its own name (not its id — a renamed character that
 * keeps its id shouldn't silently change colour, and a name is what the reader actually sees).
 */
export function speakerSeed(input: { role: string; speakerName?: string; fallbackName?: string }): string {
  if (input.role === 'user') return 'you'
  return input.speakerName?.trim() || input.fallbackName?.trim() || 'narrator'
}
