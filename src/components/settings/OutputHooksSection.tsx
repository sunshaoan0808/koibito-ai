/**
 * Output-hook editor + test panel (TODO L387; ROADMAP section 15). Sits right after
 * `RegexScriptsSection` in the same settings page: same ListEditor idiom, same
 * display/prompt/both target vocabulary. The test panel runs the enabled hooks against sample
 * text through the REAL worker path, so "it works in test" means "it works after generation"
 * — same sandbox, same timeout.
 */
import { useState } from 'react'
import { useSettingsStore } from '@/lib/store/useSettingsStore'
import {
  OUTPUT_HOOK_MAX_LENGTH,
  OUTPUT_HOOK_TIMEOUT_MS,
  applyOutputHooks,
  createOutputHookWorker,
  isRunnableOutputHook,
  runOutputHook,
  validateOutputHookScript,
  type OutputHookState,
} from '@/lib/text/outputHook'
import { newId } from '@/lib/id'
import type { OutputHookScript } from '@/lib/types'
import { Section } from '@/components/ui/Section'
import { ListEditor } from '@/components/ui/ListEditor'
import { SelectField, TextField, TextAreaField } from '@/components/ui/Field'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'

const SAMPLE_STATE: OutputHookState = { affection: 42, stage: 'getting_close', flags: ['first_date'], day: 5, phaseIndex: 2 }
const SAMPLE_TEXT = 'She glances away, cheeks warm. "Maybe… come back tomorrow?"'

export function OutputHooksSection() {
  const scripts = useSettingsStore((s) => s.outputHooks)
  const setScripts = useSettingsStore((s) => s.setOutputHooks)
  const [testText, setTestText] = useState(SAMPLE_TEXT)
  const [testOut, setTestOut] = useState<{ text: string; errors: string[] } | null>(null)
  const [testing, setTesting] = useState(false)

  const update = (id: string, patch: Partial<OutputHookScript>) =>
    setScripts(scripts.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const add = () =>
    setScripts([
      ...scripts,
      {
        id: newId(),
        name: `Hook ${scripts.length + 1}`,
        body: '// text: the reply. state: { affection, stage, flags, day, phaseIndex } (read-only).\n// Must return { text }. No fetch, DOM, import, or eval.\nreturn { text };',
        target: 'display',
        enabled: true,
      },
    ])
  const remove = (id: string) => setScripts(scripts.filter((s) => s.id !== id))

  const runTest = async () => {
    setTesting(true)
    try {
      const result = await applyOutputHooks(
        (script, text, state) => runOutputHook(createOutputHookWorker, script, text, state),
        scripts,
        testText || SAMPLE_TEXT,
        SAMPLE_STATE,
      )
      setTestOut(result)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Section
      title="Output hooks"
      description={`User-authored (text, state) => { text } scripts run after generation, sandboxed in a Web Worker with no fetch or DOM access (max ${OUTPUT_HOOK_TIMEOUT_MS}ms each). Display hooks rewrite what's stored and shown; prompt hooks rewrite only the history sent back to the model. A failing hook keeps the original text — it can never blank a reply.`}
      surface="bare"
    >
      <ListEditor
        items={scripts}
        getKey={(s) => s.id}
        onAdd={add}
        onRemove={(s) => remove(s.id)}
        addLabel="Add hook"
        emptyHint="No hooks. Regex scripts above already cover stateless find/replace — hooks add state (affection, stage, flags, day) for conditional rewrites."
        renderItem={(script) => {
          const validation = validateOutputHookScript(script.body)
          const runnable = isRunnableOutputHook(script)
          return (
            <div className="space-y-1">
              <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-[1fr_150px]">
                <TextField label="Name" value={script.name} onChange={(e) => update(script.id, { name: e.target.value })} />
                <SelectField
                  label="Applies to"
                  value={script.target}
                  onChange={(e) => update(script.id, { target: e.target.value as OutputHookScript['target'] })}
                >
                  <option value="display">Display only</option>
                  <option value="prompt">Prompt only</option>
                  <option value="both">Both</option>
                </SelectField>
              </div>
              <TextAreaField
                label={`Body (JavaScript, max ${OUTPUT_HOOK_MAX_LENGTH} chars)`}
                value={script.body}
                rows={6}
                onChange={(e) => update(script.id, { body: e.target.value })}
                placeholder="return { text: text.replaceAll('…', '...') };"
                className={!validation.ok ? 'ring-1 ring-danger/50' : ''}
              />
              {!validation.ok && <p className="text-[11px] text-danger">{validation.error} It won&apos;t run until fixed.</p>}
              {validation.ok && !runnable && (
                <p className="text-[11px] text-text-muted">Valid, but disabled — enable it to run after generation.</p>
              )}
              <div className="rounded-lg bg-bg-sunken px-3">
                <Toggle checked={script.enabled} onChange={(v) => update(script.id, { enabled: v })} label="Enabled" />
              </div>
            </div>
          )
        }}
      />
      <div className="mt-4 space-y-2 rounded-xl bg-bg-sunken p-4">
        <div className="text-sm font-medium text-text">Test panel</div>
        <p className="text-xs text-text-muted">
          Runs every enabled, valid hook in order against the sample below through the real worker sandbox
          (state: affection 42, stage getting_close, day 5 evening, flags first_date).
        </p>
        <TextAreaField label="Sample reply" value={testText} rows={3} onChange={(e) => setTestText(e.target.value)} />
        <Button variant="secondary" onClick={runTest} disabled={testing}>
          {testing ? 'Running…' : 'Run hooks on sample'}
        </Button>
        {testOut && (
          <div className="space-y-1">
            <div className="text-xs text-text-muted">Output:</div>
            <p className="whitespace-pre-wrap rounded-lg bg-bg-elevated p-3 text-sm text-text">{testOut.text}</p>
            {testOut.errors.length > 0 && (
              <div className="text-xs text-warning">
                {testOut.errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}
