// FP-absorption: voice input via the browser's Web Speech API (SpeechRecognition).
// Zero server cost, no key — Android Chrome/Edge ship Chinese recognition; desktop Chrome uses
// cloud-backed recognition under the same API. `sttSupported()` is false on Firefox, where the
// mic button hides. The app's own `voice/stt.ts` (KoboldCpp Whisper upload) remains available
// for a future gateway transcription channel; this client-side path needs neither.

export interface DictationHandle {
  stop(): void
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function ctor(): SpeechRecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/** Whether this browser can do speech input at all. */
export function sttSupported(): boolean {
  return !!ctor()
}

function friendlyError(error: string): string {
  if (error === 'not-allowed' || error === 'service-not-allowed') return '麦克风权限被拒绝'
  if (error === 'network') return '语音识别服务不可用'
  if (error === 'no-speech') return '没有听到说话'
  return `语音识别错误：${error}`
}

/**
 * Starts one dictation pass. `onText` fires with the full draft-so-far (final + interim) as it
 * streams; `onEnd` always fires when recognition stops for any reason, including after `stop()`
 * or a silent timeout. The caller owns restart logic; a single pass that auto-stops on silence is
 * the natural composer interaction (tap mic → talk → tap again or pause).
 */
export function startDictation(opts: {
  lang?: string
  onText?: (fullDraft: string, isFinal: boolean) => void
  onEnd?: () => void
  onError?: (message: string) => void
}): DictationHandle | undefined {
  const Ctor = ctor()
  if (!Ctor) {
    opts.onError?.('此浏览器不支持语音输入')
    return undefined
  }
  const rec = new Ctor()
  rec.lang = opts.lang ?? 'zh-CN'
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1
  let finalText = ''
  let interimText = ''
  let stopped = false

  rec.onresult = (e) => {
    interimText = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i]
      const transcript = result[0]?.transcript ?? ''
      if (result.isFinal) finalText += transcript
      else interimText += transcript
    }
    opts.onText?.((finalText + interimText).trim(), interimText === '')
  }
  rec.onerror = (e) => {
    if (e.error === 'aborted') return
    opts.onError?.(friendlyError(e.error))
  }
  rec.onend = () => {
    if (!stopped) opts.onEnd?.()
  }
  rec.start()
  return {
    stop() {
      stopped = true
      try {
        rec.stop()
      } catch {
        /* already stopped */
      }
      opts.onEnd?.()
    },
  }
}
