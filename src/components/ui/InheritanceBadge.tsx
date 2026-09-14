import { t } from '@/lib/i18n'
import type { InheritanceLayer } from '@/lib/settings/inheritance'

/**
 * Names the layer a cascading setting's current value came from — the plan's `<InheritableField>`
 * intent, as a badge rather than a wrapper. A wrapper would have had to re-implement each field's
 * label/hint layout (`FieldFrame`), while a badge slots into the `actions` slot those fields already
 * have beside their label.
 *
 * Purely descriptive: it never changes a value. The override/reset affordance is the caller's and
 * already exists — the chat-level selects offer "Use global default", which is exactly the
 * "inherit again" action, so this only has to say what that resolved to.
 */
export function InheritanceBadge({
  layer,
  from,
}: {
  /** The layer this control writes to. */
  layer: InheritanceLayer
  /** `null` = set at `layer` itself; a layer = the value fell through to it. */
  from: InheritanceLayer | null
}) {
  const text = from === null ? t('Overridden for {layer}', { layer: t(LAYER_NAME[layer]) }) : t('Inherited from {layer}', { layer: t(LAYER_NAME[from]) })
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        from === null ? 'bg-accent/10 text-accent' : 'bg-bg-sunken text-text-muted'
      }`}
    >
      {text}
    </span>
  )
}

const LAYER_NAME: Record<InheritanceLayer, string> = {
  global: 'Settings (global)',
  world: 'the World',
  character: 'the Character',
  chat: 'this chat',
}
