import { useEffect, useRef, useState } from 'react'
import { useSettingsStore } from '@/lib/store/useSettingsStore'
import { createImageBackend } from '@/lib/api/createImageBackend'
import { errorMessage } from '@/lib/store/useToastStore'
import {
  canContinue,
  canRegenerate,
  nextStageAfterPortrait,
  nextStageAfterRegenerate,
  nextStageAfterReview,
  primaryAction,
  type PortraitRunStage,
} from '@/lib/characters/portraitRun'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { TextAreaField } from '@/components/ui/Field'

interface ExpressionOption {
  id: string
  label: string
  hasSprite: boolean
}

/**
 * Section 11's headline item: "generate a full expression set from one description in a single pass
 * instead of one-off images." One base appearance description, a pick of which expressions to fill in
 * (defaults to whatever doesn't already have art — a bulk regenerate is an explicit opt-in, not the
 * default), then one generation call per expression, sequential rather than parallel — the same
 * reasoning this codebase already applies to a local single-GPU KoboldCpp server extends just as much
 * to a local Stable Diffusion one. Applies each sprite the moment it lands rather than waiting for the
 * whole batch, so a stopped or partially-failed run still keeps everything that did succeed.
 *
 * The run now has a **veto gate** in front of that batch (absorbed from Front Porch's avatar run,
 * which pauses at `portraitReview` before its expression pass). One portrait is one generation; the
 * pack is one per expression. Approving a single cheap image first is what stops a wrong look from
 * burning the batch. `portraitRun.ts` holds the rules; this file only wires them to the backend.
 */
export function GenerateExpressionSetDialog({
  expressions,
  initialPrompt,
  onGenerated,
  onPortrait,
  onClose,
}: {
  expressions: ExpressionOption[]
  initialPrompt: string
  onGenerated: (expressionId: string, dataUrl: string) => void
  /** Where the approved base portrait goes (the character's avatar). Optional: a host can gate without persisting. */
  onPortrait?: (dataUrl: string) => void
  onClose: () => void
}) {
  const [basePrompt, setBasePrompt] = useState(initialPrompt)
  const [selected, setSelected] = useState<Set<string>>(() => new Set(expressions.filter((e) => !e.hasSprite).map((e) => e.id)))
  const [busy, setBusy] = useState(false)
  const [stopRequested, setStopRequested] = useState(false)
  // A ref, not just the state above: the generation runs as one long-lived async closure, and a
  // `setStopRequested(true)` from the Stop button re-renders the component but can't change what
  // that already-running closure sees for a plain state variable — checking `stopRequested`
  // itself in the loop below would silently never actually stop anything. The ref is mutated
  // in-place and read fresh every iteration, so the check below always sees the current value.
  const stopRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)

  const [stage, setStage] = useState<PortraitRunStage>('idle')
  const [portrait, setPortrait] = useState<string | null>(null)
  const [portraitError, setPortraitError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number; currentLabel: string | null }>({
    done: 0,
    total: 0,
    currentLabel: null,
  })
  const [results, setResults] = useState<{ succeeded: string[]; failed: string[] } | null>(null)

  const openMayhemApiKey = useSettingsStore((s) => s.openMayhemApiKey)
  const imageBackend = useSettingsStore((s) => s.imageBackend)
  const imageBackendBaseUrl = useSettingsStore((s) => s.imageBackendBaseUrl)
  const imageBackendUsername = useSettingsStore((s) => s.imageBackendUsername)
  const imageBackendPassword = useSettingsStore((s) => s.imageBackendPassword)
  const imageBackendModel = useSettingsStore((s) => s.imageBackendModel)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const packWanted = selected.size > 0

  const backend = () =>
    createImageBackend({
      openMayhemApiKey,
      imageBackend,
      imageBackendBaseUrl,
      imageBackendUsername,
      imageBackendPassword,
      imageBackendModel,
    })

  /** One cheap generation: the look the pack will be built on. Returns whether an image came back. */
  const generatePortrait = async (controller: AbortController): Promise<boolean> => {
    setPortraitError(null)
    try {
      const result = await backend().generateImage(
        {
          prompt: basePrompt.trim(),
          width: 832,
          height: 1216,
          steps: 28,
          cfgScale: 7,
          model: imageBackendModel || undefined,
        },
        controller.signal,
      )
      controller.signal.throwIfAborted()
      if (!result.base64) throw new Error('The backend returned no image data.')
      const dataUrl = `data:${result.mimeType || 'image/png'};base64,${result.base64}`
      setPortrait(dataUrl)
      onPortrait?.(dataUrl)
      return true
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setPortraitError(errorMessage(e))
      return false
    }
  }

  const requestStop = () => {
    stopRef.current = true
    controllerRef.current?.abort()
    setStopRequested(true)
  }

  /** Fresh run: the gate's entry point, and the retry path after a finished run. */
  const startPortrait = async () => {
    const controller = new AbortController()
    controllerRef.current = controller
    stopRef.current = false
    setStopRequested(false)
    setResults(null)
    setBusy(true)
    setStage('portrait')
    const hadPortrait = Boolean(portrait)
    const ok = await generatePortrait(controller)
    setStage(
      nextStageAfterPortrait({
        hasPortrait: ok || hadPortrait,
        packWanted,
        packPossible: packWanted,
        stopped: stopRef.current,
      }),
    )
    setBusy(false)
  }

  /** At the gate: another look, staying paused so a bad one can be vetoed again. */
  const regenerate = async () => {
    const controller = new AbortController()
    controllerRef.current = controller
    stopRef.current = false
    setStopRequested(false)
    setBusy(true)
    const hadPortrait = Boolean(portrait)
    const ok = await generatePortrait(controller)
    setStage(nextStageAfterRegenerate({ ok, hasPortrait: ok || hadPortrait, stopped: stopRef.current }))
    setBusy(false)
  }

  /** At the gate: the human's answer — the only route into the expression pass. */
  const continueFromGate = async (withPack: boolean) => {
    const next = nextStageAfterReview({ withPack, packPossible: packWanted })
    setStage(next)
    if (next === 'pack') await runPack()
  }

  const runPack = async () => {
    const targets = expressions.filter((e) => selected.has(e.id))
    if (targets.length === 0) {
      setResults({ succeeded: [], failed: [] })
      setStage('done')
      return
    }

    stopRef.current = false
    setStopRequested(false)
    setBusy(true)
    setResults(null)
    const controller = new AbortController()
    controllerRef.current = controller
    setProgress({ done: 0, total: targets.length, currentLabel: targets[0]?.label ?? null })

    const succeeded: string[] = []
    const failed: string[] = []

    for (let i = 0; i < targets.length; i++) {
      if (stopRef.current) break
      const exp = targets[i]
      setProgress({ done: i, total: targets.length, currentLabel: exp.label })
      try {
        const result = await backend().generateImage(
          {
            prompt: `${basePrompt.trim()}, ${exp.label.toLowerCase()} expression`,
            width: 832,
            height: 1216,
            steps: 28,
            cfgScale: 7,
            model: imageBackendModel || undefined,
          },
          controller.signal,
        )
        controller.signal.throwIfAborted()
        if (!result.base64) throw new Error('The backend returned no image data.')
        onGenerated(exp.id, `data:${result.mimeType || 'image/png'};base64,${result.base64}`)
        succeeded.push(exp.label)
      } catch (e) {
        if (!(e instanceof DOMException && e.name === 'AbortError')) failed.push(`${exp.label} (${errorMessage(e)})`)
      }
      setProgress({ done: i + 1, total: targets.length, currentLabel: exp.label })
    }

    setResults({ succeeded, failed })
    setStage('done')
    setBusy(false)
  }

  const action = primaryAction(stage)

  return (
    <Modal
      onClose={onClose}
      title="Generate expression set"
      description="A portrait goes first — one generation — and the expression pass only runs once you approve it. Each sprite lands in its slot as it finishes, so stopping partway still keeps what's already done."
      size="lg"
      scrollable
    >
      <div className="flex-1 overflow-y-auto">
        <TextAreaField
          label="Base appearance"
          rows={3}
          value={basePrompt}
          onChange={(e) => setBasePrompt(e.target.value)}
          placeholder="e.g. portrait of Sumire, dark purple twintails, library background"
          hint={`Sends to ${imageBackend}. See Settings → Images. The portrait uses this as-is; each expression appends its own name to it.`}
        />

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium text-text">Expressions ({selected.size} selected)</span>
            <div className="flex gap-2">
              <button
                type="button"
                className="text-xs text-accent hover:underline"
                onClick={() => setSelected(new Set(expressions.map((e) => e.id)))}
              >
                Select all
              </button>
              <button type="button" className="text-xs text-accent hover:underline" onClick={() => setSelected(new Set())}>
                Select none
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {expressions.map((exp) => (
              <Chip key={exp.id} on={selected.has(exp.id)} onClick={() => toggle(exp.id)} disabled={busy}>
                {exp.label}
                {exp.hasSprite && ' •'}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted">
            Pre-selected: expressions with no art yet. A dot marks one that already has a sprite.
          </p>
        </div>

        {portraitError && (
          <p className="mt-4 rounded-xl bg-bg-elevated p-3 text-xs text-danger">{portraitError}</p>
        )}

        {stage === 'portrait' && (
          <div className="mt-4 rounded-xl bg-bg-elevated p-4 text-sm">
            <span className="text-text">Generating the portrait…</span>
            <p className="mt-1 text-xs text-text-muted">
              One image. Nothing from the expression set is being spent yet.
            </p>
          </div>
        )}

        {portrait && (stage === 'review' || stage === 'done') && (
          <div className="mt-4 rounded-xl bg-bg-elevated p-4">
            <div className="flex items-start gap-3">
              <img src={portrait} alt="Base portrait" className="h-32 w-24 shrink-0 rounded-lg object-cover" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-text">
                  {stage === 'review' ? 'Does this look right?' : 'Portrait used for this run'}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  {stage === 'review'
                    ? `Rephrase the description above and regenerate as often as you like — the expression set only runs when you say so, and it costs ${selected.size} generation${selected.size === 1 ? '' : 's'}.`
                    : 'Kept as the character’s avatar.'}
                </p>
                {canRegenerate(stage) && (
                  <Button variant="ghost" className="mt-2" onClick={() => void regenerate()} disabled={busy || !basePrompt.trim()}>
                    Regenerate portrait
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {(stage === 'pack' || (busy && progress.total > 0)) && (
          <div className="mt-4 rounded-xl bg-bg-elevated p-4 text-sm">
            <span className="text-text">
              Generating {progress.currentLabel} ({progress.done + 1} of {progress.total})…
            </span>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-sunken">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {results && (
          <div className="mt-4 rounded-xl bg-bg-elevated p-4 text-xs">
            {results.succeeded.length > 0 && <p className="text-text">Generated: {results.succeeded.join(', ')}</p>}
            {results.failed.length > 0 && <p className="mt-1 text-danger">Failed: {results.failed.join('; ')}</p>}
          </div>
        )}
      </div>

      <div className="mt-5 flex shrink-0 flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {results ? 'Close' : 'Cancel'}
        </Button>
        {action === 'stop' && (
          <Button variant="ghost" onClick={requestStop} disabled={stopRequested}>
            {stopRequested ? 'Stopping…' : 'Stop'}
          </Button>
        )}
        {action === 'continue' && canContinue(stage) && (
          <>
            <Button variant="ghost" onClick={() => void continueFromGate(false)} disabled={busy}>
              Keep portrait only
            </Button>
            <Button variant="primary" onClick={() => void continueFromGate(true)} disabled={busy || !packWanted}>
              {`Generate ${selected.size} expression${selected.size === 1 ? '' : 's'}`}
            </Button>
          </>
        )}
        {action === 'start' && !busy && (
          <Button variant="primary" onClick={() => void startPortrait()} disabled={!basePrompt.trim()}>
            {portrait ? 'Generate portrait again' : 'Generate portrait'}
          </Button>
        )}
      </div>
    </Modal>
  )
}
