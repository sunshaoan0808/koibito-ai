import { t } from '@/lib/i18n'
import { useRef, useState } from 'react'
import { downloadBackup, restoreBackupFile } from '@/lib/backup'
import { errorMessage, toastError, toastSuccess } from '@/lib/store/useToastStore'
import { confirmDialog } from '@/lib/store/useConfirmStore'
import { Button } from '@/components/ui/Button'
import { Section } from '@/components/ui/Section'
import { SettingsPage } from '@/components/ui/SettingsPage'

export function DataSettings() {
  const [busy, setBusy] = useState<'backup' | 'restore' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const runBackup = async () => {
    setBusy('backup')
    try {
      await downloadBackup()
    } catch (e) {
      toastError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const runRestore = async (file: File) => {
    const confirmed = await confirmDialog({
      title: t('用这份备份替换全部数据？'),
      body: t('应用中的所有角色、聊天、世界和设置都将被文件内容永久覆盖，且无法撤销。'),
      confirmLabel: t('恢复并重新加载'),
      tone: 'danger',
    })
    if (!confirmed) return
    setBusy('restore')
    try {
      await restoreBackupFile(file)
      toastSuccess(t('恢复完成，正在重新加载…'))
      window.location.reload()
    } catch (e) {
      toastError(errorMessage(e))
      setBusy(null)
    }
  }

  return (
    <SettingsPage>
      <Section
        title={t("Backup")}
        description={t("Downloads everything in this app: every character, chat, world, persona, and setting, plus every avatar/sprite/background/gallery image, all as one JSON file.")}
      >
        <Button variant="primary" onClick={runBackup} disabled={busy !== null}>
          {busy === 'backup' ? t('Preparing…') : t('Download backup')}
        </Button>
      </Section>

      <Section
        title={t("Restore")}
        description={t("Replaces everything currently in this app with the contents of a backup file. This is destructive and cannot be undone. Anything created since that backup was taken is lost.")}
      >
        <Button variant="danger" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
          {busy === 'restore' ? t('Restoring…') : t('Restore from backup…')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && runRestore(e.target.files[0])}
        />
      </Section>
    </SettingsPage>
  )
}
