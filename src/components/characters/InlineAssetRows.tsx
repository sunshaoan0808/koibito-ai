import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

/**
 * Row editor for `Character.assets`. Rows (not a Record) because renaming a key in a Record loses
 * the input's identity mid-typing; the author-side shape is converted to the stored Record on save
 * (`rowsToAssets`). `{{image::name}}` embeds resolve against the saved map.
 */
export function InlineAssetRows({
  rows,
  onChange,
}: {
  rows: { name: string; url: string }[]
  onChange: (rows: { name: string; url: string }[]) => void
}): ReactNode {
  const patch = (index: number, next: Partial<{ name: string; url: string }>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...next } : row)))

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={row.name}
            onChange={(e) => patch(i, { name: e.target.value })}
            placeholder="photo.png"
            className="w-40 shrink-0 rounded-lg bg-bg-sunken px-2 py-1 text-xs outline-none"
          />
          <input
            value={row.url}
            onChange={(e) => patch(i, { url: e.target.value })}
            placeholder="https://… or data:image/…"
            className="min-w-0 flex-1 rounded-lg bg-bg-sunken px-2 py-1 text-xs outline-none"
          />
          <button
            type="button"
            title="Remove"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="shrink-0 px-1 text-xs text-text-muted transition-colors hover:text-text"
          >
            ×
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => onChange([...rows, { name: '', url: '' }])}>
        Add asset
      </Button>
    </div>
  )
}
