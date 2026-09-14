import type { FeedEntry } from '@/lib/world/townFeed'
import type { KnowledgeClaim } from './claims'

/**
 * 旁线事件 → 知识（`docs/design/town-feed.md` 三期）。
 *
 * 这一层只回答"发生了什么、谁在场"，**不回答"谁能知道"**：那是社交图的事，由 `toldTargets` /
 * `propagateClaims` 在别处决定。两者混在一起，就是"在场的人顺便都被通知"那类错误的来源。
 *
 * 两条硬规矩：
 * - `witnessedByIds` 为空的事件**不产生 claim**——没人看见的事，标题写得再热闹也无人知晓
 *   （`FeedEntry` 上就是这么写的：*"No witness means nobody knows, whatever the headline says."*）。
 * - 进 `text` 的是 `detail` 而不是 `headline`。`FeedEntry` 的注释说 `detail` 才是"被引用的那一句"；
 *   `headline` 是给人看的标题，**永不**进提示词——信息流不是旁白。
 */
export function claimsFromFeed(entries: FeedEntry[]): KnowledgeClaim[] {
  return entries
    .filter((entry) => entry.witnessedByIds.length > 0)
    .map((entry) => ({
      id: `feed:${entry.id}`,
      text: entry.detail,
      witnessedByIds: [...entry.witnessedByIds],
      toldIds: [],
      at: entry.at,
      // 世界级而非聊天级：一桩旁线的事属于那个世界，这正是它能被别的聊天"听说"的前提。
      scope: { worldId: entry.worldId },
    }))
}
