/**
 * 336's Campaign tab editor — the authoring surface for a world's optional route/campaign
 * arc. Same UI idiom as the Dating-sim tab's custom-flag ListEditor: endings are an ordered
 * list (first satisfied wins), each with its own stage/flag win condition. The flag picker
 * reuses `combinedSceneFlags(customSceneFlags)` so a world's own flags show up alongside the
 * built-ins — the same source the trigger editor reads.
 */
import { useState } from 'react'
import type { CustomSceneFlag } from '@/lib/types'
import { combinedSceneFlags, formatRelationshipStage, RELATIONSHIP_MILESTONES } from '@/lib/dating/stage'
import { newId } from '@/lib/id'
import { NumberField, SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { ListEditor } from '@/components/ui/ListEditor'
import { Section } from '@/components/ui/Section'
import type { CampaignDef, CampaignEnding } from '@/lib/world/campaign'

const EDITABLE_STAGES = RELATIONSHIP_MILESTONES.filter((m) => m.stage !== 'near_strangers')

export interface CampaignDraft {
  premise: string
  dayCount: string
  startDay: string
  endings: CampaignEnding[]
}

export function campaignDraftFromDef(def: CampaignDef | undefined): CampaignDraft {
  return {
    premise: def?.premise ?? '',
    dayCount: def ? String(def.dayCount) : '11',
    startDay: def ? String(def.startDay) : '0',
    endings: def?.endings ?? [],
  }
}

/** `undefined` = campaign disabled (blank premise or non-positive day count). */
export function campaignDefFromDraft(draft: CampaignDraft): CampaignDef | undefined {
  const premise = draft.premise.trim()
  const dayCount = Math.max(0, Math.min(365, Math.round(Number(draft.dayCount) || 0)))
  const startDay = Math.max(0, Math.min(100000, Math.round(Number(draft.startDay) || 0)))
  if (!premise || dayCount <= 0) return undefined
  return { premise, dayCount, startDay, endings: draft.endings }
}

export function CampaignTabEditor({
  draft,
  onChange,
  customSceneFlags,
}: {
  draft: CampaignDraft
  onChange: (next: CampaignDraft) => void
  customSceneFlags: CustomSceneFlag[]
}) {
  const [newFlagId, setNewFlagId] = useState('')
  const flagOptions = combinedSceneFlags(customSceneFlags)
  const patch = (p: Partial<CampaignDraft>) => onChange({ ...draft, ...p })

  const addEnding = () =>
    patch({
      endings: [
        ...draft.endings,
        {
          id: newId(),
          label: `Ending ${draft.endings.length + 1}`,
          description: '',
          winKind: 'stage',
          winStage: 'close',
        },
      ],
    })
  const updateEnding = (id: string, p: Partial<CampaignEnding>) =>
    patch({ endings: draft.endings.map((e) => (e.id === id ? { ...e, ...p } : e)) })
  const removeEnding = (id: string) => patch({ endings: draft.endings.filter((e) => e.id !== id) })

  const addFlagToEnding = (ending: CampaignEnding) => {
    const flag = newFlagId.trim()
    if (!flag) return
    const current = ending.winFlags ?? []
    if (current.includes(flag)) return
    updateEnding(ending.id, { winFlags: [...current, flag] })
    setNewFlagId('')
  }

  return (
    <div className="space-y-10">
      <Section
        title="Campaign arc"
        description="An optional Mystic-Messenger-style route for this world: a premise, a day count, and ordered endings with their own win conditions. Blank premise (or zero days) disables the arc — chats here behave exactly as before."
        surface="bare"
      >
        <TextAreaField
          label="Premise"
          placeholder="e.g. Win her heart before the summer festival ends."
          value={draft.premise}
          onChange={(e) => patch({ premise: e.target.value })}
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField
            label="Arc length (days)"
            min={0}
            max={365}
            value={draft.dayCount}
            onChange={(e) => patch({ dayCount: e.target.value })}
          />
          <NumberField
            label="Start day (world clock)"
            min={0}
            value={draft.startDay}
            onChange={(e) => patch({ startDay: e.target.value })}
          />
        </div>
      </Section>

      <Section
        title="Endings"
        description="Ordered — the first satisfied ending is the run's ending. Reach a stage, or hold flag(s)."
        surface="bare"
      >
        <ListEditor
          items={draft.endings}
          getKey={(e) => e.id}
          onAdd={addEnding}
          onRemove={(e) => removeEnding(e.id)}
          addLabel="Add ending"
          emptyHint="No endings — the arc is a deadline with no win condition."
          renderItem={(ending) => (
            <div className="space-y-3">
              <TextField
                label="Ending name"
                value={ending.label}
                onChange={(e) => updateEnding(ending.id, { label: e.target.value })}
              />
              <TextAreaField
                label="Description"
                value={ending.description}
                onChange={(e) => updateEnding(ending.id, { description: e.target.value })}
              />
              <SelectField
                label="Win condition"
                value={ending.winKind}
                onChange={(e) =>
                  updateEnding(ending.id, {
                    winKind: e.target.value as CampaignEnding['winKind'],
                    ...(e.target.value === 'stage'
                      ? { winStage: ending.winStage ?? 'close' }
                      : { winFlags: ending.winFlags ?? [] }),
                  })
                }
              >
                <option value="stage">Reach a relationship stage</option>
                <option value="flags">Hold scene flag(s)</option>
              </SelectField>
              {ending.winKind === 'stage' ? (
                <SelectField
                  label="Minimum stage"
                  value={ending.winStage ?? 'close'}
                  onChange={(e) =>
                    updateEnding(ending.id, { winStage: e.target.value as CampaignEnding['winStage'] })
                  }
                >
                  {EDITABLE_STAGES.map((m) => (
                    <option key={m.stage} value={m.stage}>
                      {formatRelationshipStage(m.stage)}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <div>
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {(ending.winFlags ?? []).map((f) => (
                      <button
                        key={f}
                        type="button"
                        className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs text-text hover:text-red-400"
                        title="Remove this flag"
                        onClick={() =>
                          updateEnding(ending.id, {
                            winFlags: (ending.winFlags ?? []).filter((x) => x !== f),
                          })
                        }
                      >
                        {flagOptions.find((o) => o.id === f)?.label ?? f} ×
                      </button>
                    ))}
                    {(ending.winFlags ?? []).length === 0 && (
                      <span className="text-xs text-text-muted">No flags yet — all must hold to win.</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <SelectField
                      label="Add flag"
                      value={newFlagId}
                      onChange={(e) => setNewFlagId(e.target.value)}
                    >
                      <option value="">Pick a flag…</option>
                      {flagOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </SelectField>
                    <button
                      type="button"
                      className="self-end rounded-md bg-surface-sunken px-3 py-1.5 text-sm text-text hover:bg-surface-hover"
                      onClick={() => addFlagToEnding(ending)}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        />
      </Section>
    </div>
  )
}
