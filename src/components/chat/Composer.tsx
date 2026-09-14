import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronsRight, FileText, Mic, MicOff, Paperclip, RefreshCw, Send, Square, Undo2, Wand2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { readAttachment, type PendingAttachment } from '@/lib/attachments'
import { startDictation, sttSupported, type DictationHandle } from '@/lib/voice/dictation'
import { t } from '@/lib/i18n'
import { toastError, toastInfo } from '@/lib/store/useToastStore'
import { SLASH_COMMANDS, isSlashInput, runSlashCommand, slashCommandDraft, type SlashCommandHandlers, type SlashOutcome } from '@/lib/chat/slashCommands'

interface ComposerProps {
  value: string
  onChangeValue: (v: string) => void
  disabled: boolean
  isGenerating: boolean
  canContinue: boolean
  onSend: (text: string, attachments: PendingAttachment[]) => void
  onAbort: () => void
  onContinue: () => void
  onImpersonate: () => Promise<string>
  /** P2-5's `/image` pipeline, injected from the chat window (which owns settings + the message list). Omitted means `/image` reports itself as unwired instead of guessing. */
  onImageCommand?: SlashCommandHandlers['image']
  /** Whether the last message has a "Continue" segment that can be undone/regenerated — hides both controls when false. */
  canUndoLastContinue?: boolean
  onUndoLastContinue?: () => void
  onRegenerateLastContinueSegment?: () => void
  /** Group-scene characters who can reply besides the primary — omitted/empty hides the "reply as" picker entirely. */
  replyAsOptions?: { id: string; name: string }[]
  replyAsId?: string | null
  onChangeReplyAs?: (id: string | null) => void
  /** Section 4/12's Scene entity: a non-'manual' turn policy replaces the "reply as" picker with this read-only pill instead — there's nothing to manually pick once the scene is deciding automatically. */
  turnPolicyHint?: string
  /** A row that belongs *to* the message being composed (10b's intent chips) — sits inside the card, above the textarea, so it reads as part of writing the line rather than a separate bar. */
  intentSlot?: ReactNode
  /** 'vn' strips its own chrome (border/background/margin) to sit bare inside the glass dialogue box it's nested in, and switches text/icon colors for a photo backdrop instead of the app surface. */
  variant?: 'default' | 'vn'
  /** VN inline input: fills the dialogue box's fixed height instead of hugging its content, so the box never resizes as the draft grows. */
  fillHeight?: boolean
}

/** `*…*` is this app's action/narration markup — `messageText` renders it as `<em>` and the model
 *  reads it that way. So "Do" is just a wrap on send: no prompt change, no new per-turn channel. */
function wrapAction(text: string): string {
  const body = text.trim()
  if (!body || (body.startsWith('*') && body.endsWith('*'))) return text
  return `*${body}*`
}

export function Composer({
  value,
  onChangeValue,
  disabled,
  isGenerating,
  canContinue,
  onSend,
  onAbort,
  onContinue,
  onImpersonate,
  onImageCommand,
  canUndoLastContinue = false,
  onUndoLastContinue,
  onRegenerateLastContinueSegment,
  replyAsOptions = [],
  replyAsId,
  onChangeReplyAs,
  turnPolicyHint,
  intentSlot,
  variant = 'default',
  fillHeight = false,
}: ComposerProps) {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [composerError, setComposerError] = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState(false)
  // Voice dictation (FP-absorption): Web Speech API — live transcript lands in the draft, mic
  // toggles; hidden entirely on browsers without SpeechRecognition.
  const [dictating, setDictating] = useState(false)
  const dictationRef = useRef<DictationHandle | undefined>(undefined)
  const dictationBaseRef = useRef('')
  const sttAvailable = sttSupported()
  // VN mode only, mobile only (see the `sm:hidden` / `hidden sm:block` split below) — intent chips
  // compete with the sprite/dialogue box for the little vertical room a phone has, so they start
  // collapsed there. Desktop VN keeps them always visible, no toggle chrome at all.
  const [showIntentMobile, setShowIntentMobile] = useState(false)
  // Do/Say mode. "Do" wraps what you send in `*…*` (see `wrapAction`); it resets after each send so
  // a momentary toggle can't silently turn the next straight line of dialogue into an action.
  const [actionMode, setActionMode] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const vn = variant === 'vn'
  /** Hint chips show once the draft opens with "/" — the registry decides what's listed. */
  const showSlashHints = isSlashInput(value) && !disabled

  const isEmpty = !value.trim() && attachments.length === 0

  // Slash commands (P2-4): the parsing and the registry live in `lib/chat/slashCommands`, which
  // hands back an outcome; this component only performs it with the plumbing it already has —
  // toasts, the draft, or the ordinary send path. A line that isn't a registered command
  // (`resolveSlashCommand` returns undefined) falls through to a normal send untouched.
  const applySlashOutcome = (outcome: SlashOutcome) => {
    switch (outcome.kind) {
      case 'toast':
        if (outcome.tone === 'error') toastError(outcome.message)
        else toastInfo(outcome.message)
        onChangeValue('')
        break
      case 'fill':
        onChangeValue(outcome.text)
        textRef.current?.focus()
        break
      case 'send':
        onSend(outcome.text, [])
        onChangeValue('')
        setAttachments([])
        break
      case 'skip':
        if (canContinue) onContinue()
        else toastInfo('现在没有可以续写的回复。')
        onChangeValue('')
        break
    }
  }

  /** Returns true when the draft was consumed as a slash command. */
  const runSlashInput = (raw: string): boolean => {
    const outcome = runSlashCommand(raw, { image: onImageCommand })
    if (!outcome) return false
    // Only the injected image handler can be async (P2-5's pipeline) — every other command resolves synchronously.
    if (outcome instanceof Promise) {
      onChangeValue('')
      outcome.then(applySlashOutcome, (e) => setComposerError(e instanceof Error ? e.message : String(e)))
    } else {
      applySlashOutcome(outcome)
    }
    return true
  }

  const submit = () => {
    if (disabled) return
    if (isSlashInput(value) && runSlashInput(value)) return
    if (isEmpty) {
      if (canContinue) onContinue()
      return
    }
    onSend(actionMode ? wrapAction(value) : value, attachments)
    onChangeValue('')
    setActionMode(false)
    setAttachments([])
    textRef.current?.focus()
  }

  const handleImpersonate = async () => {
    if (disabled || isGenerating || impersonating) return
    setImpersonating(true)
    setComposerError(null)
    try {
      const suggestion = await onImpersonate()
      if (suggestion) onChangeValue(suggestion)
    } catch (e) {
      setComposerError(e instanceof Error ? e.message : String(e))
    } finally {
      setImpersonating(false)
    }
  }

  const stopDictation = () => {
    dictationRef.current?.stop()
    dictationRef.current = undefined
    setDictating(false)
  }

  const toggleDictation = () => {
    if (dictating) {
      stopDictation()
      return
    }
    setComposerError(null)
    dictationBaseRef.current = value.trim() ? value.trimEnd() + ' ' : ''
    const handle = startDictation({
      onText: (draft) => onChangeValue(dictationBaseRef.current + draft),
      onError: (message) => setComposerError(message),
      onEnd: () => {
        dictationRef.current = undefined
        setDictating(false)
      },
    })
    if (handle) {
      dictationRef.current = handle
      setDictating(true)
    }
  }

  const addFiles = async (files: FileList) => {
    setComposerError(null)
    for (const file of Array.from(files)) {
      try {
        const attachment = await readAttachment(file)
        setAttachments((prev) => [...prev, attachment])
      } catch (e) {
        setComposerError(e instanceof Error ? e.message : String(e))
      }
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }

  const iconBtnClass = vn
    ? 'text-white/70 hover:bg-white/15 hover:text-white'
    : 'text-text-muted hover:bg-bg-elevated hover:text-text'
  const attachmentChipClass = vn ? 'bg-white/10 text-white' : 'bg-bg-elevated text-text'
  const attachmentRemoveClass = vn
    ? 'bg-black/50 text-white/70 hover:text-danger'
    : 'bg-bg-elevated text-text-muted hover:text-danger'

  return (
    <div className={vn ? `w-full ${fillHeight ? 'flex h-full min-h-0 flex-col' : ''}` : 'border-t border-border/50 bg-bg-elevated p-3'}>
      <div
        className={
          vn
            ? `w-full ${fillHeight ? 'flex min-h-0 flex-1 flex-col' : ''}`
            : 'mx-auto max-w-chat rounded-2xl bg-bg-sunken p-3 ring-1 ring-transparent transition-shadow focus-within:ring-accent/30'
        }
      >
        {composerError && <p className="mb-2 px-1.5 text-xs text-danger">{composerError}</p>}
        <div className="mb-1.5 flex items-center gap-1 px-1.5 text-[11px]">
          {[false, true].map((isDo) => (
            <button key={String(isDo)} type="button" onClick={() => setActionMode(isDo)} className={isDo === actionMode ? 'rounded-full bg-accent/15 px-2 py-0.5 text-accent' : 'rounded-full px-2 py-0.5 text-text-muted hover:text-text'}>
              {isDo ? t('Do') : t('Say')}
            </button>
          ))}
        </div>
      {intentSlot && !vn && (
          <div className="mb-2.5 border-b border-border/50 px-1.5 pb-2.5">{intentSlot}</div>
        )}
        {intentSlot && vn && (
          <>
            {/* Desktop VN: always visible, same as before. */}
            <div className="mb-2.5 hidden border-b border-white/10 px-1.5 pb-2.5 sm:block">{intentSlot}</div>
            {/* Mobile VN: collapsed by default — the sprite/dialogue box need the vertical room more. */}
            <div className="mb-2.5 border-b border-white/10 pb-2.5 sm:hidden">
              <button
                type="button"
                onClick={() => setShowIntentMobile((v) => !v)}
                className="flex items-center gap-1 px-1.5 text-xs text-white/60 transition-colors hover:text-white"
              >
                <ChevronDown size={12} strokeWidth={2} className={`transition-transform ${showIntentMobile ? 'rotate-180' : ''}`} />
                Intent
              </button>
              {showIntentMobile && <div className="mt-2 px-1.5">{intentSlot}</div>}
            </div>
          </>
        )}
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2 px-1">
            {attachments.map((a, i) => (
              <div key={i} className="group relative">
                {a.kind === 'image' ? (
                  <img src={a.dataUrl} alt={a.name} className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <div className={`flex h-14 max-w-[10rem] items-center gap-1.5 rounded-lg px-2.5 text-xs ${attachmentChipClass}`}>
                    <FileText size={14} strokeWidth={1.75} className="shrink-0 opacity-70" />
                    <span className="truncate">{a.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(i)}
                  title="Remove"
                  aria-label={`Remove attachment ${a.name}`}
                  className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 ${attachmentRemoveClass}`}
                >
                  <X size={12} strokeWidth={2.5} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Slash-command hint chips (P2-4): shown while the draft opens with "/" so the commands
            are discoverable instead of memorised. Clicking one drops its usage into the draft,
            ready for arguments; the list and the wording both come from the pure registry. */}
        {showSlashHints && (
          <div className={`mb-2 flex flex-wrap items-center gap-1.5 border-b px-1.5 pb-2 ${vn ? 'border-white/10' : 'border-border/50'}`}>
            {SLASH_COMMANDS.map((command) => (
              <button
                key={command.name}
                type="button"
                onClick={() => {
                  onChangeValue(slashCommandDraft(command))
                  textRef.current?.focus()
                }}
                title={`${command.usage} — ${command.summary}`}
                className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${
                  vn ? 'bg-white/10 text-white/70 hover:text-white' : 'bg-bg-elevated text-text-muted hover:text-text'
                }`}
              >
                {`/${command.name}`}
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={textRef}
          value={value}
          onChange={(e) => onChangeValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={
            disabled
              ? t('Select a character to begin…')
              : isEmpty && canContinue
                ? t('Write a message, or press Enter to continue the last reply…')
                : t('Write a message… (Enter to send, Shift+Enter for newline)')
          }
          disabled={disabled}
          rows={1}
          className={`w-full resize-none bg-transparent px-1.5 py-1.5 text-base outline-none sm:text-sm ${
            vn ? 'text-white placeholder:text-white/40' : 'text-text placeholder:text-text-muted'
          } ${fillHeight ? 'min-h-0 flex-1' : ''}`}
        />

        <div className={`flex items-center justify-between px-0.5 pt-0.5 ${fillHeight ? 'mt-auto shrink-0' : ''}`}>
          <div className="flex items-center gap-1">
            {turnPolicyHint ? (
              <span
                title="The scene's turn policy is deciding who replies. See the Scene panel to change it"
                className={`mr-1 rounded-full px-2.5 py-1.5 text-xs ${vn ? 'bg-white/10 text-white/70' : 'bg-bg-elevated text-text-muted'}`}
              >
                {turnPolicyHint}
              </span>
            ) : (
              replyAsOptions.length > 1 && (
                <select
                  value={replyAsId || replyAsOptions[0].id}
                  onChange={(e) => onChangeReplyAs?.(e.target.value)}
                  title="Reply as"
                  aria-label="Reply as"
                  className={`mr-1 rounded-full px-2.5 py-1.5 text-xs outline-none ring-1 ring-transparent transition-shadow focus:ring-accent/40 ${
                    vn ? 'bg-white/10 text-white/80' : 'bg-bg-elevated text-text-muted hover:text-text'
                  }`}
                >
                  {replyAsOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
              title="Attach images or text files for the model to read"
              aria-label="Attach images or text files"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${iconBtnClass}`}
            >
              <Paperclip size={16} strokeWidth={1.75} />
            </button>
            {sttAvailable && (
              <button
                onClick={toggleDictation}
                disabled={disabled}
                title={dictating ? t('Stop dictation') : t('Dictate a message')}
                aria-label={dictating ? t('Stop dictation') : t('Dictate a message')}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                  dictating ? 'animate-pulse bg-danger/15 text-danger' : iconBtnClass
                }`}
              >
                {dictating ? <MicOff size={16} strokeWidth={1.75} /> : <Mic size={16} strokeWidth={1.75} />}
              </button>
            )}
            <button
              onClick={onContinue}
              disabled={disabled || isGenerating || !canContinue}
              title="Continue the last reply"
              aria-label="Continue the last reply"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${iconBtnClass}`}
            >
              <ChevronsRight size={16} strokeWidth={1.75} />
            </button>
            {canUndoLastContinue && (
              <>
                <button
                  onClick={onUndoLastContinue}
                  disabled={disabled || isGenerating}
                  title="Undo last continue"
                  aria-label="Undo last continue"
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${iconBtnClass}`}
                >
                  <Undo2 size={16} strokeWidth={1.75} />
                </button>
                <button
                  onClick={onRegenerateLastContinueSegment}
                  disabled={disabled || isGenerating}
                  title="Regenerate last continue segment"
                  aria-label="Regenerate last continue segment"
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${iconBtnClass}`}
                >
                  <RefreshCw size={16} strokeWidth={1.75} />
                </button>
              </>
            )}
            <button
              onClick={handleImpersonate}
              disabled={disabled || isGenerating || impersonating}
              title="Suggest what you'd say next"
              aria-label="Suggest what you'd say next"
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${iconBtnClass}`}
            >
              <Wand2 size={16} strokeWidth={1.75} className={impersonating ? 'animate-pulse' : ''} />
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.txt,.md,.markdown,.json,.csv,.tsv,.log,.js,.ts,.tsx,.jsx,.py,.html,.css,.yml,.yaml,.xml"
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />

          {isGenerating ? (
            <Button variant="danger" onClick={onAbort} className="flex items-center gap-1.5 rounded-full">
              <Square size={13} strokeWidth={2} fill="currentColor" />
              Stop
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={submit}
              disabled={disabled || (isEmpty && !canContinue)}
              className="flex items-center gap-1.5 rounded-full"
            >
              <Send size={13} strokeWidth={2} />
              {isEmpty && canContinue ? 'Continue' : 'Send'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
