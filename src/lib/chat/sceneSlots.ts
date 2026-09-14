/** Slots are `{{key}}` in an opener; deduped, order preserved. */
export function slotsFrom(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/\{\{([^}]+)\}\}/g)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** Replaces filled slots; unfilled keep the literal `{{key}}` — same rule as broken `{{image::…}}` refs. */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (whole: string, key: string) => {
    const v = values[key]
    return v && v.trim() ? v : whole
  })
}
