import { useState } from 'react'
import { Chip } from '@/components/ui/Chip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Section } from '@/components/ui/Section'
import { Toggle } from '@/components/ui/Toggle'
import { ViewShell } from '@/components/ui/ViewShell'
import { t } from '@/lib/i18n'
import {
  GRANTABLE,
  hasGrant,
  loadGrants,
  saveGrants,
  withGrant,
  type GrantMap,
} from '@/lib/plugins/grants'
import { pluginRegistry } from '@/lib/plugins/registry'
import type { PluginGrants } from '@/lib/plugins/types'

/**
 * Phase 3 of `docs/design/plugin-api.md`: the one place a capability is granted, and the one place
 * that is honest about what a grant means.
 *
 * The project's own rule is "all engines run in-process" — the same process, the same memory, the
 * same fetch. A capability list therefore *describes* intent; it does not confine anything. The
 * panel says that out loud rather than implying a sandbox that does not exist, because a false
 * sense of protection is worse than none.
 *
 * Grants are the only plugin state persisted (`rp.pluginGrants`), which is what makes a toggle
 * survive a reload — phase 3's acceptance. Hook timings are read live from the registry and are
 * deliberately *not* persisted: they describe this session, not a preference.
 */
export function PluginPanelView() {
  const [grants, setGrants] = useState<GrantMap>(() => loadGrants())
  const plugins = pluginRegistry.plugins()
  const stats = pluginRegistry.stats()

  const toggle = (pluginId: string, capability: keyof PluginGrants, on: boolean) => {
    const next = withGrant(grants, pluginId, capability, on)
    setGrants(next)
    saveGrants(next)
    pluginRegistry.setGrant(pluginId, capability, on)
  }

  return (
    <ViewShell
      title={t('Plugins')}
      description={t('Extend the engine without editing it — prompt sections, slash commands, views.')}
    >
      <div className="rounded-lg border border-border bg-bg-sunken p-4 text-sm text-text-muted">
        {t(
          'Plugins run in this same process. A capability is a statement of intent, not a sandbox — granting one hands the plugin everything this app can do.',
        )}
      </div>

      {plugins.length === 0 ? (
        <EmptyState>
          <p className="text-sm">{t('No plugins registered')}</p>
          <p className="pt-1 text-xs">
            {t('Add one to src/lib/plugins/index.ts — that file is the only registration point.')}
          </p>
        </EmptyState>
      ) : (
        plugins.map((manifest) => (
          <Section
            key={manifest.id}
            title={manifest.name}
            description={`v${manifest.version} · ${manifest.id}`}
          >
            <div className="flex flex-wrap gap-1.5 pb-2">
              {manifest.capabilities.map((capability) => (
                <Chip key={capability}>{capability}</Chip>
              ))}
            </div>

            {GRANTABLE.map((capability) => (
              <Toggle
                key={capability}
                checked={hasGrant(grants, manifest.id, capability)}
                onChange={(on) => toggle(manifest.id, capability, on)}
                label={GRANTABLE_LABEL[capability]}
                description={
                  hasGrant(grants, manifest.id, capability)
                    ? t('Granted — this plugin is active for the next turn.')
                    : t('Not granted — the plugin is registered but does nothing.')
                }
              />
            ))}
          </Section>
        ))
      )}

      <Section title={t('Hook timings')} description={t('This session only — a plugin that throws never reaches the prompt.')}>
        {stats.length === 0 ? (
          <p className="text-sm text-text-muted">{t('No hook has run yet.')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-text-muted">
              <tr>
                <th className="text-left font-normal">{t('Plugin')}</th>
                <th className="text-left font-normal">{t('Hook')}</th>
                <th className="text-right font-normal">{t('Calls')}</th>
                <th className="text-right font-normal">{t('Failures')}</th>
                <th className="text-right font-normal">{t('Time')}</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((entry) => (
                <tr key={`${entry.pluginId}:${entry.hook}`} className="border-t border-border">
                  <td className="py-1">{entry.pluginId}</td>
                  <td className="py-1">{entry.hook}</td>
                  <td className="py-1 text-right">{entry.calls}</td>
                  <td className={`py-1 text-right ${entry.failed > 0 ? 'text-danger' : ''}`}>{entry.failed}</td>
                  <td className="py-1 text-right">{entry.totalMs.toFixed(1)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </ViewShell>
  )
}

/** What each grantable capability actually hands over — spelled out, not just the token name. */
const GRANTABLE_LABEL: Record<keyof PluginGrants, string> = {
  'prompt:write': t('Edit prompt sections'),
  net: t('Make network requests'),
}
