import { useEffect, useState } from 'react'
import { useApiQuery } from '@/lib/hooks/useApiQuery'
import { charactersApi } from '@/lib/api/client'
import type { Character } from '@/lib/characters/cardSpec'
import { CharacterList } from './CharacterList'
import { CharacterEditor } from './CharacterEditor'

export function CharactersView({
  initialCharacterId,
  onConsumedInitial,
  onNavigateToWorld,
}: {
  /** Deep-link into this character's editor on mount (the command palette's "jump to a character"). */
  initialCharacterId?: string | null
  onConsumedInitial?: () => void
  /** Deep-link into a world's editor tab — backs the Visual novel tab's "no scene backgrounds yet" note. */
  onNavigateToWorld?: (worldId: string, tab?: string) => void
} = {}) {
  const [selected, setSelected] = useState<Character | null | 'new'>(null)
  const characters = useApiQuery('characters', () => charactersApi.list(), []) ?? []

  useEffect(() => {
    if (!initialCharacterId) return
    const match = characters.find((c) => c.id === initialCharacterId)
    if (!match) return
    setSelected(match)
    onConsumedInitial?.()
    // Only re-run when the target id changes (or the list finishes loading) — not on every
    // `characters` refetch, which would otherwise snap back open every time this save happens.
  }, [initialCharacterId, characters.length])

  if (selected === null) {
    return <CharacterList onSelect={(c) => setSelected(c)} onCreateNew={() => setSelected('new')} />
  }

  return (
    <CharacterEditor
      character={selected === 'new' ? null : selected}
      onSaved={() => setSelected(null)}
      onDeleted={() => setSelected(null)}
      onNavigateToWorld={onNavigateToWorld}
    />
  )
}
