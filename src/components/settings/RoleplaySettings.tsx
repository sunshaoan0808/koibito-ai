import { useSettingsStore } from '@/lib/store/useSettingsStore'
import { Toggle } from '@/components/ui/Toggle'
import { Chip } from '@/components/ui/Chip'
import { Slider } from '@/components/ui/Slider'
import { Section } from '@/components/ui/Section'
import { SettingsPage } from '@/components/ui/SettingsPage'
import { SettingsEyebrow } from '@/components/ui/SettingsEyebrow'
import { QuickRepliesSection } from './QuickRepliesSection'
import { t } from '@/lib/i18n'

/**
 * The roleplay/dating-sim half of what used to be a single 16-card Generation tab: the settings that
 * shape the *scene* (relationship scoring, choices, objectives, memory, the world clock) rather than
 * how the model produces text. Split out 2026-09-14; the other half is `SamplingControls`.
 *
 * The "all assists" switch stays here deliberately: its four toggles (summarize, task detection,
 * relationship tracking, choices) all live in this component, and a batch shortcut parked in the
 * other tab would be pointing at things it can't show you.
 */
export function RoleplaySettings() {
  const autoSummarize = useSettingsStore((s) => s.autoSummarize)
  const setAutoSummarize = useSettingsStore((s) => s.setAutoSummarize)
  const keepRecentMessages = useSettingsStore((s) => s.keepRecentMessages)
  const setKeepRecentMessages = useSettingsStore((s) => s.setKeepRecentMessages)
  const parrotEchoThreshold = useSettingsStore((s) => s.parrotEchoThreshold)
  const setParrotEchoThreshold = useSettingsStore((s) => s.setParrotEchoThreshold)
  const summaryDetail = useSettingsStore((s) => s.summaryDetail)
  const setSummaryDetail = useSettingsStore((s) => s.setSummaryDetail)
  const autoDetectTasks = useSettingsStore((s) => s.autoDetectTasks)
  const setAutoDetectTasks = useSettingsStore((s) => s.setAutoDetectTasks)
  const autoAdvanceTime = useSettingsStore((s) => s.autoAdvanceTime)
  const setAutoAdvanceTime = useSettingsStore((s) => s.setAutoAdvanceTime)
  const autoTrackRelationship = useSettingsStore((s) => s.autoTrackRelationship)
  const setAutoTrackRelationship = useSettingsStore((s) => s.setAutoTrackRelationship)
  const relationshipDifficulty = useSettingsStore((s) => s.relationshipDifficulty)
  const setRelationshipDifficulty = useSettingsStore((s) => s.setRelationshipDifficulty)
  const slowBurnPacing = useSettingsStore((s) => s.slowBurnPacing)
  const setSlowBurnPacing = useSettingsStore((s) => s.setSlowBurnPacing)
  const intimacyLevel = useSettingsStore((s) => s.intimacyLevel)
  const setIntimacyLevel = useSettingsStore((s) => s.setIntimacyLevel)
  const autoSuggestChoices = useSettingsStore((s) => s.autoSuggestChoices)
  const setAutoSuggestChoices = useSettingsStore((s) => s.setAutoSuggestChoices)

  // Section 9(c)'s "one-switch minimal assists profile": four toggles, scattered across the
  // Sections below (each is its own model call, so each has its own honest cost description
  // right where it lives), get one batch-set pair here instead of a fifth persisted field to keep
  // in sync with them — "derive from current state, don't duplicate it" is the same idiom the
  // sampler-preset/instruct-template selects elsewhere in Settings already use. A chat with all
  // four already on/off highlights the matching preset; anything in between (most setups, since
  // these are independent toggles by design) highlights neither, which is correct, not a bug.
  const allAssists = [autoSummarize, autoDetectTasks, autoTrackRelationship, autoSuggestChoices]
  const allAssistsOn = allAssists.every(Boolean)
  const allAssistsOff = allAssists.every((v) => !v)
  const setAllAssists = (on: boolean) => {
    setAutoSummarize(on)
    setAutoDetectTasks(on)
    setAutoTrackRelationship(on)
    setAutoSuggestChoices(on)
  }

  return (
    <SettingsPage>
      <SettingsEyebrow>{t("Basics")}</SettingsEyebrow>
      <Section
        title={t("Plain chat vs. dating sim")}
        surface="bare"
        description={
          <>
            Not everything below applies to every kind of story. <strong className="text-text">Relationship
            tracking</strong>, its <strong className="text-text">Difficulty</strong>/<strong className="text-text">
            Intimacy detail</strong> sub-settings, and <strong className="text-text">Suggest choices</strong> are the
            dating-sim/VN layer. If you're doing plain roleplay, an adventure, or lore-only chat, it's completely
            fine to turn all three off. <strong className="text-text">{t("Auto-detect completed tasks")}</strong> only ever
            does anything while an Objective is set, in any kind of chat. <strong className="text-text">Visual Novel
            mode</strong> (Appearance tab) is a presentation choice, not a mechanic, independent of all of this, on
            or off either way. A world's own template (Freeform RP, Visual Novel, Dating Sim, Slice of Life, set on
            its Overview tab) already presets sensible per-chat defaults for the dating-sim toggles automatically;
            what you pick here is just the global fallback for a chat that doesn't override it.
          </>
        }
      />

      <Section
        title={t("Background AI assists")}
        description="Four independent toggles below (relationship tracking, choices, task detection, summarization) each fire their own model call after a reply: useful signal, but a real cost on a local single-GPU server, where they queue with each other and ahead of your next message. These two are a shortcut to set all four at once; each stays individually adjustable in its own section below either way."
      >
        <div className="flex gap-2">
          <Chip on={allAssistsOn} onClick={() => setAllAssists(true)}>
            {t("All assists on")}
          </Chip>
          <Chip on={allAssistsOff} onClick={() => setAllAssists(false)}>
            {t("Minimal (all off)")}
          </Chip>
        </div>
      </Section>

      <SettingsEyebrow>{t("Scene & relationship")}</SettingsEyebrow>
      <Section
        title={t("Relationship tracking")}
        description="Scores affection and six relationship dimensions after each reply, gating gift/sprite/background/gallery unlocks. Turn off for a chat you don't want dating-sim mechanics in."
      >
        <Toggle
          checked={autoTrackRelationship}
          onChange={setAutoTrackRelationship}
          label={t("Auto-track relationship")}
          description="A model call after each reply. It won't hold up the reply you just got, but on a local single-GPU server it queues with the other post-reply assists ahead of your next message. The chat shows a strip while it runs."
        />
        <div className="pt-3">
          <div className="mb-1.5 text-sm text-text">Difficulty</div>
          <div className="flex gap-2">
            {(['gentle', 'normal', 'harsh'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setRelationshipDifficulty(d)}
                className={`flex-1 rounded-xl px-3 py-2 text-sm capitalize transition-colors ${
                  relationshipDifficulty === d ? 'bg-accent/10 text-accent' : 'bg-bg-sunken text-text-muted'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            How far affection and relationship stats swing on any given moment or date, not what
            a character says or how a scene plays out. Gentle softens the swings, harsh sharpens them.
          </p>
        </div>
        <div className="pt-3">
          <Toggle
            checked={slowBurnPacing}
            onChange={setSlowBurnPacing}
            label={t("Slow-burn pacing")}
            description="This is the one that actually touches scene content, unlike the difficulty scale above: steers a character away from giving in to affection, a kiss, or closeness just because it was asked for, especially early in a relationship. On by default."
          />
        </div>
        <div className="pt-3">
          <div className="mb-1.5 text-sm text-text">Intimacy detail</div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['default', 'Default'],
                ['fade_to_black', 'Fade to black'],
                ['suggestive', 'Suggestive'],
                ['explicit', 'Explicit'],
              ] as const
            ).map(([level, label]) => (
              <button
                key={level}
                onClick={() => setIntimacyLevel(level)}
                className={`rounded-xl px-3 py-2 text-sm transition-colors ${
                  intimacyLevel === level ? 'bg-accent/10 text-accent' : 'bg-bg-sunken text-text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            How explicit intimate scenes get written once a scene has actually earned one, separate
            from the pacing above, which only governs how fast that point is reached. Default sends
            no instruction at all (whatever the connected model already does on its own); the other
            three are your own explicit choice, in either direction.
          </p>
        </div>
      </Section>

      <Section
        title={t("Roleplay choices")}
        description="A few suggested next lines/actions appear above the composer after each reply. Pick one to steer the scene forward, or ignore them and write your own."
      >
        <Toggle
          checked={autoSuggestChoices}
          onChange={setAutoSuggestChoices}
          label={t("Suggest choices after each reply")}
          description="One model call after each reply. Same as relationship tracking, it shares the GPU with your next message. Turn it off for pure freeform writing."
        />
      </Section>

      <Section
        title={t("Objectives")}
        description="Set a goal from a chat's Target button and the character's replies steer toward it. Tasks can be checked off by hand, or detected automatically as they happen in the scene."
      >
        <Toggle
          checked={autoDetectTasks}
          onChange={setAutoDetectTasks}
          label={t("Auto-detect completed tasks")}
          description="One model call after a reply, only while an objective is active, and conservative: it only ticks things off, never invents progress"
        />
      </Section>

      <Section
        title={t("Long-term memory")}
        description="Once a chat outgrows the context window, older turns are folded into a running summary by the connected model instead of being silently dropped."
      >
        <Toggle
          checked={autoSummarize}
          onChange={setAutoSummarize}
          label={t("Auto-summarize older history")}
          description="One model call, but only once enough new history has built up (not every reply), plus immediately if a turn is about to overflow the context limit"
        />
        <Slider
          label={t("Keep verbatim")}
          min={4}
          max={40}
          step={2}
          value={keepRecentMessages}
          onChange={setKeepRecentMessages}
          formatValue={(v) => `${v} messages`}
          description="Recent messages kept word-for-word; anything older gets summarized"
        />
        <Slider
          label={t("Echo threshold")}
          min={0.5}
          max={1}
          step={0.01}
          value={parrotEchoThreshold}
          onChange={setParrotEchoThreshold}
          formatValue={(v) => v.toFixed(2)}
          description="How close a reply has to be to an earlier turn before it counts as a repeat: 1.00 catches only near-verbatim echoes, lower values also catch looser paraphrases"
        />
        <div className="pt-3">
          <div className="mb-1.5 text-sm text-text">Summary detail</div>
          <div className="flex gap-2">
            {(['concise', 'detailed'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setSummaryDetail(d)}
                className={`flex-1 rounded-xl px-3 py-2 text-sm capitalize transition-colors ${
                  summaryDetail === d ? 'bg-accent/10 text-accent' : 'bg-bg-sunken text-text-muted'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-text-muted">
            Concise trades detail for fewer tokens spent on memory; detailed keeps more texture at a
            higher ongoing cost.
          </p>
        </div>
      </Section>

      <Section
        title={t("World clock")}
        description="A world's clock (day, season, weather, energy) advances by explicit action only. This also lets it follow what a scene narrates, so the calendar and the story don't drift apart."
      >
        <Toggle
          checked={autoAdvanceTime}
          onChange={setAutoAdvanceTime}
          label={t("Auto-advance the clock from narration")}
          description="Deterministic, no model call: a turn that says 'the next morning' moves the world on a day, 'later that evening' moves it a phase or two. A turn that names no time leaves the clock alone, and a same-day reference ('this morning', said in the afternoon) never claims time the scene didn't spend. Energy and diary stamps follow the clock."
        />
      </Section>

      <QuickRepliesSection />
    </SettingsPage>
  )
}
