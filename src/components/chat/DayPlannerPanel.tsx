import { useState } from 'react'
import type { Character } from '@/lib/characters/cardSpec'
import type { Chat, DateEventCard, WorldCard } from '@/lib/types'
import { buildDayPlannerActivities, type DayPlannerActivity } from '@/lib/world/dayPlanner'
import { campaignProgress, evaluateCampaign } from '@/lib/world/campaign'
import { PHASES, describeWeather, getCalendarInfo, getEnergyRemaining, getMaxEnergyForDay, getWeather } from '@/lib/world/calendar'
import { errorMessage, toastError } from '@/lib/store/useToastStore'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Section } from '@/components/ui/Section'

interface DayPlannerPanelProps {
  character: Character
  world: WorldCard
  /** The live chat — campaign progress (days-left, won/expired) derives from its stage + flags. */
  chat: Chat
  /** `chat.activeEvent` — a live hangout/date already in progress (started from here or from the
   *  ordinary "Start a date or event" picker) takes over the whole panel with a redirect instead
   *  of a second "end this scene" UI. */
  activeEvent: DateEventCard | undefined
  onOpenActiveEvent: () => void
  onPick: (activity: DayPlannerActivity) => Promise<void>
  onClose: () => void
}

export function DayPlannerPanel({ character, world, chat, activeEvent, onOpenActiveEvent, onPick, onClose }: DayPlannerPanelProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const day = world.currentDay ?? 0
  const phaseIndex = world.currentPhaseIndex ?? 0
  const calendar = getCalendarInfo(day)
  const weather = getWeather(world.id, day)
  // 336: campaign progress derives live from the world clock + this chat's stage/flags —
  // the same inputs `evaluateCampaign` scores, so screen and settlement can't disagree.
  const campaignEval = evaluateCampaign(world.campaign, {
    currentDay: day,
    stage: chat.relationshipStage ?? 'near_strangers',
    flags: chat.sceneFlags ?? [],
  })
  const campaignPct =
    world.campaign && campaignEval.status !== 'disabled'
      ? Math.round((campaignProgress(world.campaign, day).elapsed / campaignProgress(world.campaign, day).total) * 100)
      : 0

  if (activeEvent?.startedAt) {
    const isHangout = activeEvent.kind === 'hangout'
    return (
      <Modal
        onClose={onClose}
        title="Plan your day"
        description={`You're partway through ${activeEvent.title}. Wrap that up first before planning what's next.`}
        size="lg"
      >
        <Button variant="primary" onClick={onOpenActiveEvent}>
          Open {isHangout ? 'hangout' : 'date'}
        </Button>
      </Modal>
    )
  }

  const activities = buildDayPlannerActivities(character, world)

  const run = async (activity: DayPlannerActivity) => {
    setBusy(activity.id)
    try {
      await onPick(activity)
      onClose()
    } catch (e) {
      toastError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal onClose={onClose} title="Plan your day" description="Pick something to do with this part of the day." size="xl" scrollable>
      <Section title="Right now" surface="sunken">
        <div className="mb-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-text-muted sm:grid-cols-4">
          <div>
            <span className="capitalize text-text">{calendar.season}</span> day {calendar.dayOfSeason}
          </div>
          <div className="capitalize text-text">{calendar.weekday}</div>
          <div className="capitalize text-text">
            {PHASES[phaseIndex]}
            {calendar.holiday ? ` · ${calendar.holiday}` : ''}
          </div>
          <div className="capitalize text-text">{describeWeather(weather)}</div>
        </div>
        <p className="text-xs text-text-muted">
          {getEnergyRemaining(day, phaseIndex)}/{getMaxEnergyForDay(day)} actions left today
        </p>
      </Section>

      {campaignEval.status !== 'disabled' && world.campaign && (
        <Section title={world.campaign.premise} surface="sunken">
          {campaignEval.status === 'won' && campaignEval.ending ? (
            <p className="text-sm text-text">
              🏆 Ending unlocked: {campaignEval.ending.label}
              {campaignEval.ending.description ? ` — ${campaignEval.ending.description}` : ''}
            </p>
          ) : campaignEval.status === 'expired' ? (
            <p className="text-sm text-text-muted">
              The deadline has passed with no ending met — the story continues free, or restart the arc from the world&apos;s Campaign tab.
            </p>
          ) : (
            <>
              <div className="mb-1 flex items-center justify-between text-xs text-text-muted">
                <span>
                  Day {campaignProgress(world.campaign, day).elapsed}/{campaignProgress(world.campaign, day).total}
                </span>
                <span>
                  {campaignEval.daysLeft} day{campaignEval.daysLeft === 1 ? '' : 's'} left
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-bg-elevated">
                <div className="h-full rounded-full bg-accent" style={{ width: `${campaignPct}%` }} />
              </div>
              {world.campaign.endings.length > 0 && (
                <p className="mt-1.5 text-xs text-text-muted">
                  Endings: {world.campaign.endings.map((e) => e.label).join(' · ')}
                </p>
              )}
            </>
          )}
        </Section>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {activities.map((activity) => (
          <Button
            key={activity.id}
            variant={activity.kind === 'rest' ? 'secondary' : 'primary'}
            onClick={() => run(activity)}
            disabled={busy !== null || activity.disabled}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span>{busy === activity.id ? 'Starting…' : activity.label}</span>
            {activity.disabled && activity.disabledReason && (
              <span className="text-xs font-normal text-text-muted">{activity.disabledReason}</span>
            )}
          </Button>
        ))}
      </div>
    </Modal>
  )
}
