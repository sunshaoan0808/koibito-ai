import { useMemo } from 'react'
import type { StoredMessage } from '@/lib/types'
import type { Character } from '@/lib/characters/cardSpec'
import type { Persona } from '@/lib/types'
import { useSettingsStore } from '@/lib/store/useSettingsStore'
import { parseSfxWordList } from '@/lib/text/messageSegments'
import { sfxConfigFor } from '@/lib/text/sfx'
import { speakerSeed, speakerTint } from '@/lib/text/speakerTint'
import { MessageBubble } from './MessageBubble'

interface MessageLogProps {
  messages: StoredMessage[]
  character?: Character
  persona?: Persona
  /** Other characters able to speak in this chat (group scenes) — [] for an ordinary single-character chat. */
  participantCharacters?: Character[]
  /** Give each speaker a colour stripe in the translucent log — the VN backlog asks for this (P3 Tier 6). */
  tintSpeakers?: boolean
  generatingMessageId: string | null
  streamingText: string
  /** Message id to briefly flash, set when the user jumps here from search or the pinned panel. */
  highlightedMessageId?: string | null
  onEdit: (id: string, text: string) => void
  onDelete: (id: string) => void
  onRewind: (id: string) => void
  onRegenerate: (id: string) => void
  /** Item 4's mid-scene correction — see `MessageBubble`'s own doc comment on the prop it forwards. */
  onSteer: (id: string, steerText: string) => void
  onSwipe: (id: string, dir: 'left' | 'right') => void
  onFork: (id: string) => void
  onTogglePin: (id: string) => void
}

/** The classic scrolling transcript — shared by the default chat view and the VN mode backlog drawer. */
export function MessageLog({
  messages,
  character,
  persona,
  participantCharacters = [],
  tintSpeakers = false,
  generatingMessageId,
  streamingText,
  highlightedMessageId,
  onEdit,
  onDelete,
  onRewind,
  onRegenerate,
  onSteer,
  onSwipe,
  onFork,
  onTogglePin,
}: MessageLogProps) {
  const sfxEnabled = useSettingsStore((s) => s.sfxBursts)
  const sfxWords = useSettingsStore((s) => s.sfxWords)
  const globalSfxWords = useMemo(() => parseSfxWordList(sfxWords), [sfxWords])

  // Precomputed once per real change to any of these deps, not once per message per render — the
  // per-message counterpart of `globalSfxWords` above, and the other half of what makes `memo` on
  // `MessageBubble` actually skip work: a per-token `streamingText` update leaves `messages`,
  // `character`, `participantCharacters`, `sfxEnabled`, and `globalSfxWords` all unchanged, so this
  // whole map is skipped and every bubble but the one actually streaming gets the exact same
  // `avatarDataUrl`/`sfx` object it had last render.
  const perMessage = useMemo(
    () =>
      new Map(
        messages.map((m) => {
          const avatarDataUrl =
            m.role !== 'char'
              ? persona?.avatarDataUrl
              : !m.speakerId
                ? character?.avatarDataUrl
                : (participantCharacters.find((c) => c.id === m.speakerId)?.avatarDataUrl ?? character?.avatarDataUrl)
          const sfx = sfxConfigFor(m, { enabled: sfxEnabled, globalWords: globalSfxWords, primary: character, participants: participantCharacters })
          // One colour per speaker, keyed by name so a rename follows the character and a reload
          // never shuffles the palette (see `text/speakerTint`). Only the VN backlog asks for it.
          const tint = tintSpeakers
            ? speakerTint(
                speakerSeed({
                  role: m.role,
                  speakerName: m.speakerId ? participantCharacters.find((c) => c.id === m.speakerId)?.card.name : undefined,
                  fallbackName: character?.card.name,
                }),
              )
            : undefined
          // Same speaker resolution the fields above already use: `assets` rides the per-speaker
          // derivation, so MessageBubble needs no new prop chain.
          const assets =
            m.role !== 'char'
              ? undefined
              : (!m.speakerId ? character : participantCharacters.find((c) => c.id === m.speakerId) ?? character)?.assets
          return [m.id, { avatarDataUrl, sfx, tint, assets }]
        }),
      ),
    [messages, persona, character, participantCharacters, sfxEnabled, globalSfxWords, tintSpeakers],
  )

  return (
    <div className="mx-auto max-w-chat backdrop-blur-chat">
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          avatarDataUrl={perMessage.get(m.id)?.avatarDataUrl}
          sfx={perMessage.get(m.id)?.sfx}
          assets={perMessage.get(m.id)?.assets}
          tint={perMessage.get(m.id)?.tint}
          isStreaming={generatingMessageId === m.id}
          // Only the bubble actually streaming needs the live text — handing every other bubble
          // the same ever-changing string would force all of them to re-render on every token
          // even though their own content never moved. `''` is a primitive literal, so it's
          // trivially the same value across renders for every non-streaming bubble.
          streamingText={generatingMessageId === m.id ? streamingText : ''}
          isHighlighted={highlightedMessageId === m.id}
          onEdit={onEdit}
          onDelete={onDelete}
          onRewind={onRewind}
          onRegenerate={onRegenerate}
          onSteer={onSteer}
          onSwipe={onSwipe}
          onFork={onFork}
          onTogglePin={onTogglePin}
        />
      ))}
      {messages.length === 0 && (
        <p className="text-center text-sm text-text-muted py-8">
          No messages yet. Say hello, or the character's first message will appear once you send one.
        </p>
      )}
    </div>
  )
}
