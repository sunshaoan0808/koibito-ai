import { describe, expect, it, vi } from 'vitest'
import type { CastCandidate } from './detector'
import { candidateToCharacterInput, promoteCandidate, withPromotedParticipant } from './promote'

const candidate: CastCandidate = {
  name: '田中',
  firstSeenMessageId: 'm2',
  mentions: 3,
  sample: '田中さん说，今天的面包刚出炉。',
}

describe('candidateToCharacterInput', () => {
  it('uses the sentence the guest appeared in as the description', () => {
    const input = candidateToCharacterInput(candidate) as { card: Record<string, unknown> }
    expect(input.card.name).toBe('田中')
    expect(input.card.description).toBe('田中さん说，今天的面包刚出炉。')
  })

  it('falls back to the name and marks the card as a promoted guest', () => {
    const input = candidateToCharacterInput({ ...candidate, sample: '   ' }) as { card: Record<string, unknown> }
    expect(input.card.description).toBe('田中')
    expect(input.card.tags).toEqual(['dynamic-cast'])
    const extensions = input.card.extensions as Record<string, unknown>
    expect(extensions.dynamic_cast).toBe(true)
    expect(extensions.first_seen).toBe('m2')
    expect(extensions.mentions).toBe(3)
  })
})

describe('withPromotedParticipant', () => {
  it('appends the new id without mutating the roster it was given', () => {
    const before = ['a']
    expect(withPromotedParticipant(before, 'b')).toEqual(['a', 'b'])
    expect(before).toEqual(['a'])
  })

  it('never duplicates an id that is already on the roster', () => {
    expect(withPromotedParticipant(['a', 'b'], 'b')).toEqual(['a', 'b'])
  })
})

describe('promoteCandidate', () => {
  it('creates the character before it touches the chat roster', async () => {
    const order: string[] = []
    const createCharacter = vi.fn(async () => {
      order.push('create')
      return { id: 'c9' }
    })
    const updateChat = vi.fn(async (_chatId: string, patch: { participants: string[] }) => {
      order.push('update')
      expect(patch.participants).toEqual(['a', 'c9'])
    })

    const id = await promoteCandidate(candidate, 'chat1', ['a'], { createCharacter, updateChat })

    expect(id).toBe('c9')
    expect(order).toEqual(['create', 'update'])
    expect(createCharacter).toHaveBeenCalledTimes(1)
  })

  it('leaves the chat untouched when creation fails, so a failed promotion writes nothing', async () => {
    const updateChat = vi.fn(async () => undefined)

    await expect(
      promoteCandidate(candidate, 'chat1', ['a'], {
        createCharacter: async () => {
          throw new Error('creation refused')
        },
        updateChat,
      }),
    ).rejects.toThrow('creation refused')

    expect(updateChat).not.toHaveBeenCalled()
  })
})
