import { useRef, useState } from 'react'
import { useApiQuery } from '@/lib/hooks/useApiQuery'
import { presetsApi } from '@/lib/api/client'
import { useSettingsStore } from '@/lib/store/useSettingsStore'
import type { GenerationParams } from '@/lib/api/types'
import { BUILTIN_PRESETS } from '@/lib/prompt/builtinPresets'
import {
  creativityToParams,
  focusToParams,
  paramsToCreativity,
  paramsToFocus,
  paramsToRepetition,
  repetitionToParams,
} from '@/lib/prompt/samplerSimpleMode'
import { Slider } from '@/components/ui/Slider'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { TextField, NumberField } from '@/components/ui/Field'
import { Section } from '@/components/ui/Section'
import { SettingsPage } from '@/components/ui/SettingsPage'
import { SettingsEyebrow } from '@/components/ui/SettingsEyebrow'
import { RegexScriptsSection } from './RegexScriptsSection'
import { InstructTemplateSection } from './InstructTemplateSection'
import { PromptSectionsSection } from './PromptSectionsSection'
import { SystemPromptSection } from './SystemPromptSection'
import { WritingStyleSection } from './WritingStyleSection'
import { ChatCompletionSamplerSection } from './ChatCompletionSamplerSection'
import { t } from '@/lib/i18n'

const ADVANCED_FIELDS: { key: string; label: string; step?: number; min?: number; max?: number }[] = [
  { key: 'temperature', label: 'Temperature', step: 0.01, min: 0 },
  { key: 'top_p', label: 'Top P', step: 0.01, min: 0, max: 1 },
  { key: 'top_k', label: 'Top K', step: 1, min: 0 },
  { key: 'min_p', label: 'Min P', step: 0.01, min: 0, max: 1 },
  { key: 'typical', label: 'Typical', step: 0.01, min: 0, max: 1 },
  { key: 'tfs', label: 'TFS', step: 0.01, min: 0, max: 1 },
  { key: 'rep_pen', label: 'Rep. Penalty', step: 0.01, min: 1 },
  { key: 'rep_pen_range', label: 'Rep. Penalty Range', step: 16, min: 0 },
  { key: 'rep_pen_slope', label: 'Rep. Penalty Slope', step: 0.1, min: 0 },
  { key: 'presence_penalty', label: 'Presence Penalty', step: 0.01 },
  { key: 'dry_multiplier', label: 'DRY Multiplier', step: 0.05, min: 0 },
  { key: 'dry_base', label: 'DRY Base', step: 0.05, min: 0 },
  { key: 'dry_allowed_length', label: 'DRY Allowed Length', step: 1, min: 0 },
  { key: 'mirostat', label: 'Mirostat Mode', step: 1, min: 0, max: 2 },
  { key: 'mirostat_tau', label: 'Mirostat Tau', step: 0.1, min: 0 },
  { key: 'mirostat_eta', label: 'Mirostat Eta', step: 0.01, min: 0 },
]

/**
 * The text-production half of the old single Generation tab: how much context the model gets, what
 * goes into the prompt, and how the sampler picks words. The scene/relationship mechanics moved to
 * `RoleplaySettings` (2026-09-14) — between the two, the tab is now two readable pages instead of
 * one 16-card scroll.
 */
export function SamplingControls() {
  const chatBackend = useSettingsStore((s) => s.chatBackend)
  const advancedSamplerMode = useSettingsStore((s) => s.advancedSamplerMode)
  const setAdvancedSamplerMode = useSettingsStore((s) => s.setAdvancedSamplerMode)
  const sampler = useSettingsStore((s) => s.sampler)
  const setSampler = useSettingsStore((s) => s.setSampler)
  const contextLengthAuto = useSettingsStore((s) => s.contextLengthAuto)
  const setContextLengthAuto = useSettingsStore((s) => s.setContextLengthAuto)

  const presets = useApiQuery('presets', () => presetsApi.list(), []) ?? []
  const [presetName, setPresetName] = useState('My preset')
  const fileRef = useRef<HTMLInputElement>(null)

  // Which built-in preset the current sampler exactly matches on every field that preset sets
  // (fields it leaves alone don't count), or null once anything's been hand-tuned.
  const current = sampler as unknown as Record<string, number>
  const activeBuiltin = BUILTIN_PRESETS.find((p) =>
    Object.entries(p.params).every(([k, v]) => current[k] === v),
  )
  const activeBuiltinPreset = activeBuiltin?.id ?? null
  const activeBuiltinPresetUse = activeBuiltin?.use ?? null

  const savePreset = async () => {
    await presetsApi.create({ name: presetName, params: sampler as unknown as Record<string, unknown> })
  }
  const exportPreset = () => {
    const blob = new Blob([JSON.stringify(sampler, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${presetName.replace(/[^a-z0-9-_ ]/gi, '') || 'preset'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const importPreset = async (file: File) => {
    const data = JSON.parse(await file.text())
    setSampler(data)
  }

  return (
    <SettingsPage>
      <SettingsEyebrow>{t("Basics")}</SettingsEyebrow>
      <Section title={t("Context & length")}>
        <Toggle
          checked={contextLengthAuto}
          onChange={setContextLengthAuto}
          label={t("Match the model's context automatically")}
          description="Tracks the connected model's real limit. KoboldCpp reports it directly, some hosted providers list it in /models. Turn off to pin your own value."
        />
        <NumberField
          label={t("Max context length")}
          suffix="tokens"
          min={512}
          step={512}
          disabled={contextLengthAuto}
          value={String(sampler.max_context_length)}
          onChange={(e) => {
            setSampler({ max_context_length: Math.max(512, Math.round(Number(e.target.value) || 0)) })
            setContextLengthAuto(false)
          }}
          hint={
            contextLengthAuto
              ? `Auto, currently ${sampler.max_context_length.toLocaleString()} tokens. Editing this switches to manual.`
              : 'No fixed ceiling; set whatever your model and hardware allow.'
          }
        />
        <NumberField
          label={t("Max response length")}
          suffix="tokens"
          min={16}
          step={16}
          value={String(sampler.max_length)}
          onChange={(e) => setSampler({ max_length: Math.max(1, Math.round(Number(e.target.value) || 0)) })}
          hint="Ceiling for a single reply. A character's own reply-length band can still cap it lower."
        />
      </Section>

      <SettingsEyebrow>Authoring</SettingsEyebrow>
      <SystemPromptSection />

      <WritingStyleSection />

      <PromptSectionsSection />

      {/* A chat-completion backend formats its own turns — an instruct template (ChatML, Llama 3,
          ...) is a text-completion-only concept and would be actively misleading to show here.
          NovelAI is a raw text-completion API too (just its own hosted one), so it still wants a
          real instruct template exactly like KoboldCpp does. */}
      {chatBackend !== 'openai-compatible' && <InstructTemplateSection />}

      <SettingsEyebrow>Power user</SettingsEyebrow>
      {chatBackend === 'openai-compatible' ? (
        <ChatCompletionSamplerSection />
      ) : (
        <Section
          title={t("Generation")}
          description="How the model picks its next word. Start from a preset, then nudge it with the sliders below (or every field, in Advanced mode)."
          surface="bare"
          action={<Toggle checked={advancedSamplerMode} onChange={setAdvancedSamplerMode} label={t("Advanced mode")} />}
        >
          <div className="mb-1.5 text-xs font-medium text-text-muted">{t("Starting point")}</div>
          <select
            value={activeBuiltinPreset ?? 'custom'}
            onChange={(e) => {
              const preset = BUILTIN_PRESETS.find((p) => p.id === e.target.value)
              if (preset) setSampler(preset.params)
            }}
            className="w-full rounded-xl bg-bg-sunken px-3 py-2 text-sm text-text outline-none ring-1 ring-transparent transition-shadow focus:ring-accent/40"
          >
            {BUILTIN_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            {!activeBuiltinPreset && <option value="custom">Custom (edited)</option>}
          </select>
          {activeBuiltinPresetUse && <p className="mb-3 mt-1.5 text-xs text-text-muted">{activeBuiltinPresetUse}</p>}
          {!activeBuiltinPresetUse && <div className="mb-3" />}

          {!advancedSamplerMode ? (
            <div className="rounded-xl bg-bg-elevated p-5">
              <Slider
                label={t("Creativity")}
                min={0}
                max={100}
                value={paramsToCreativity(sampler.temperature)}
                onChange={(v) => setSampler(creativityToParams(v))}
                description="Lower = safer and more predictable. Higher = more surprising and varied."
              />
              <Slider
                label={t("Focus")}
                min={0}
                max={100}
                value={paramsToFocus(sampler.top_p)}
                onChange={(v) => setSampler(focusToParams(v))}
                description="How narrowly the model sticks to its most likely next words."
              />
              <Slider
                label={t("Avoid repetition")}
                min={0}
                max={100}
                value={paramsToRepetition(sampler.rep_pen)}
                onChange={(v) => setSampler(repetitionToParams(v))}
                description="Discourages repeating the same words and phrases."
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-bg-elevated p-5 sm:grid-cols-3">
              {ADVANCED_FIELDS.map((f) => (
                <TextField
                  key={f.key}
                  label={f.label}
                  type="number"
                  step={f.step}
                  min={f.min}
                  max={f.max}
                  value={String((sampler as unknown as Record<string, number>)[f.key] ?? 0)}
                  onChange={(e) => setSampler({ [f.key]: Number(e.target.value) } as Partial<GenerationParams>)}
                />
              ))}
              <TextField
                label={t("Stop sequences (comma separated)")}
                className="col-span-full"
                value={(sampler.stop_sequence ?? []).join(', ')}
                onChange={(e) =>
                  setSampler({ stop_sequence: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
                }
              />
            </div>
          )}
        </Section>
      )}

      {/* Saves/loads the KoboldCpp `sampler` shape specifically — meaningless while a
          chat-completion backend (its own separate settings, no saved-preset library yet) is
          active, so hidden rather than shown greyed-out or silently no-op. NovelAI reuses this
          same `sampler` shape (see novelai.ts), so its presets stay meaningful there too. */}
      {chatBackend !== 'openai-compatible' && (
        <Section title={t("Presets")} surface="bare">
          <TextField label={t("Preset name")} value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={savePreset}>
              Save current
            </Button>
            <Button onClick={exportPreset}>Export JSON</Button>
            <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importPreset(e.target.files[0])}
            />
          </div>
          {presets.length > 0 && (
            <div className="mt-3 space-y-1">
              {presets.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl bg-bg-sunken px-4 py-3 text-sm">
                  <span className="text-text">{p.name}</span>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setSampler(p.params)}>
                      Apply
                    </Button>
                    <Button variant="ghost" onClick={() => presetsApi.remove(p.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      <RegexScriptsSection />
    </SettingsPage>
  )
}
