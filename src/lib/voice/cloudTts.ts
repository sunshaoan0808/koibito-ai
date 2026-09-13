/**
 * FP-absorption: cloud TTS — reads a character reply aloud via the server-side LLM proxy
 * (`/api/llm/v1/audio/speech` → the gateway's TTS channel). Model/voice come from localStorage
 * (`rp.ttsModel` / `rp.ttsVoice`); a future settings panel can edit them. One module-level
 * <audio> player: pressing play on another message stops the previous one.
 *
 * The gateway's TTS channel may be unavailable (503) — errors surface as a readable message.
 */

let currentAudio: HTMLAudioElement | undefined
let currentMessageId: string | undefined

export function stopSpeaking(): void {
  currentAudio?.pause()
  currentAudio = undefined
  currentMessageId = undefined
}

export function speakingMessageId(): string | undefined {
  return currentMessageId
}

export function ttsConfig(): { model: string; voice: string } {
  return {
    model: localStorage.getItem('rp.ttsModel') ?? 'minimax-tts-speech-2.8-turbo',
    voice: localStorage.getItem('rp.ttsVoice') ?? 'alloy',
  }
}

/** Plays `text` for `messageId`; resolves true when playback started, false when stopped. */
export async function speakMessage(
  messageId: string,
  text: string,
  onChange: () => void,
): Promise<boolean> {
  if (currentMessageId === messageId) {
    stopSpeaking()
    onChange()
    return false
  }
  stopSpeaking()
  const { model, voice } = ttsConfig()
  const res = await fetch('/api/llm/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, voice, input: text }),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160)
    throw new Error(`语音生成失败 (${res.status})${detail ? `：${detail}` : ''}`)
  }
  const blob = await res.blob()
  if (!blob.size) throw new Error('语音生成返回了空音频')
  const audio = new Audio(URL.createObjectURL(blob))
  currentAudio = audio
  currentMessageId = messageId
  audio.onended = () => {
    if (currentAudio === audio) {
      currentAudio = undefined
      currentMessageId = undefined
      onChange()
    }
  }
  onChange()
  await audio.play()
  return true
}
