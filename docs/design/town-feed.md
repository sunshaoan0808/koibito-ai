# 设计稿 · 城镇信息流（Town Feed）

> 状态：**设计稿（未实现）**。自研项，原项目 front-porch-AI 无此机制（全仓实测 `fogOf`/`knowledgeState`/`saveSlot` 0 命中，最近似的 Stoop 是角色卡社区仓库，非信息流，且本仓已列"不推荐吸收"）。
> 落笔依据：本仓现码实测（行号见下），非推测。

## 一、问题

世界在玩家看不见的地方**不动**。玩家不在场的时段，NPC 之间什么也没发生，于是"活世界"只剩玩家在场的那一条线。

本仓已有的原语其实足够支撑"旁线有事发生"，但**只朝玩家单向推送**：

| 现有原语 | 文件 | 它现在做什么 | 缺口 |
|---|---|---|---|
| 社交反应 | `src/lib/world/ambientEvents.ts:174`（`SocialConnectionLike`）、`:186`（`selectSocialReaction`） | 按社交关系算某个 NPC 对事件的反应 | 只算给**当前场景**用 |
| 环境事件 | `src/lib/world/ambientEvents.ts:23`（`AmbientEvent`）、`:100`（`selectAmbientEvent`）、`:148`（`describeAmbientEvent`） | 抽一个当下环境事件并成文 | 只服务当前聊天 |
| 客串发现 | `src/lib/cast/detector.ts:189`（`detectCastCandidates`）、`:237`（`castPromptLine`）、`src/lib/cast/promote.ts` | 从文本里发现路人并入戏 | 只在玩家在场时发现 |
| 主动消息 | `src/lib/dating/outreach.ts`（`evaluateOutreach`/`generateOutreachMessage`）、`src/lib/hooks/useOutreachTick.ts:19` | **1:1 私聊**式主动搭话，每 chat 记账（`types.ts:490`），消息打标（`types.ts:347`） | 只有点对点，没有"镇上传开的消息" |
| 触发器 | `src/lib/world/triggers.ts:14/74/99`（`TriggerStat`/`conditionHolds`/`triggerSatisfied`） | 条件满足即触发剧情动作 | 触发对象是玩家在场聊天 |
| 世界时钟 | `src/lib/world/calendar.ts`、`dayPlanner.ts`、`workSchedule.ts`、`vitality.ts` | 112 天日历、日内阶段、班表、体力 | 有"时间",无"别处发生的事" |

## 二、目标 / 非目标

**目标**
1. 玩家不在场的时段也能产生**可复现**的旁线事件，沉淀成一份可读的"镇上消息"。
2. 事件**只由已存在的原语推导**（社交边、班表、天气、客串），不引入新的模拟引擎。
3. 信息流是**"玩家角色可能听说的事"**，不等于"玩家角色在场的事"——默认**不注入**在场聊天的提示词（这正是它与 outreach 的分界，也是「知识迷雾」的进口）。

**非目标**
- 不做 NPC 全量离线人生模拟（那是另一件事，成本无上限）。
- 不做聊天式信息流（那是 outreach 的活，别把两条线混成一团）。
- 不做跨世界广播。

## 三、机制

### 3.1 数据模型（纯类型，先落 `src/lib/world/townFeed.ts`）

```ts
export type FeedKind = 'social' | 'weather' | 'work' | 'rumor' | 'cast'

/** 一条镇上消息。headline 一行给人读，detail 一句给"听说"用（喂提示词时只用 detail）。 */
export interface FeedEntry {
  id: string
  worldId: string
  /** 世界时钟坐标（`calendar.ts` 的绝对天数 + 日内阶段），不是墙钟。 */
  at: { day: number; phaseIndex: number }
  kind: FeedKind
  headline: string
  detail: string
  /** 涉及的角色 id —— 「谁有可能听说」由图上的边决定（见 knowledge-fog.md）。 */
  aboutIds: string[]
  /** 源头：见证者。图上没有通路就没有人知道。 */
  witnessedByIds: string[]
  readAt?: number
}
```

### 3.2 生成器（纯函数，可断言）

```ts
export interface TownFeedInput {
  worldId: string
  /** 玩家不在此处的时段：从上次结算到现在的世界时钟区间。 */
  from: { day: number; phaseIndex: number }
  to: { day: number; phaseIndex: number }
  characters: CharacterLike[]      // 复用 ambientEvents 的 SocialConnectionLike 形态
  weatherByDay: WeatherLike[]      // `calendar.ts` 的产出口
  schedules: ScheduleLike[]        // `workSchedule.ts` 的产出口
}

/** 确定性：同输入同输出（时间区间内逐日逐阶段推进，每格至多一条）。 */
export function generateTownFeed(input: TownFeedInput): FeedEntry[]
```

**抽取纪律（沿用既有原语，不另造）**
- `social`：对每个有边的 NPC 对，调 `selectSocialReaction`（`ambientEvents.ts:186`）影子求值——**影子 = 不推进当前聊天状态**，只取反应文本。
- `work`：`workSchedule.ts` 谁在当班 → "谁在哪、忙什么"。
- `weather`：`calendar.ts` 的日内变化 → 影响 `social` 的成文（下雨天没人摆摊之类）。
- `cast`：未登记但反复出现的名字（`detector.ts:189` 的 `CastCandidate`）在旁线里**先当"谣言里的人物"**出现，玩家真遇到时才由 `promote.ts` 升格。

### 3.3 持久化（零迁移优先）

服务端实测**没有任何 worldinfo/ambient/outreach/triggers 路由**——世界引擎是纯客户端的，状态一律挂在 Chat 行里（`src/lib/types.ts:449` 的 `firedTriggerIds`、`:490` 的 outreach 记账）。

故一期照 `server/saveSlots.ts` 的做法：**新字段进 Chat 行的 JSON 区，零表迁移**——
- `Chat.townFeed?: FeedEntry[]`（只存"这条聊天所属世界"的增量）
- 二期若出现跨聊天聚合的性能/一致性问题，再提 `world_feed` 表（服务端加表 + 路由；`server/db.ts:251-269` 的 store 工厂已经给了现成范式）。

### 3.4 UI

新视图 `src/components/world/TownFeedView.tsx` + `Sidebar.tsx` 的 `NAV` 加一项（与 `save-slots` 同法）：
- 按世界时钟日分组，`readAt` 未读高亮；
- 每条只在**此处**显示 `headline`，`detail` 留给"听说"；
- 空状态说明"世界在你不在场时也会发生事"。

## 四、分期与验收

| 期 | 内容 | 验收（可执行断言） |
|---|---|---|
| 1 | 纯生成器 + 单测（无 UI、无持久化） | 同输入**同输出**（跑两次逐字段相等）；区间内每天每阶段 ≤1 条；`aboutIds`/`witnessedByIds` 非空 |
| 2 | 落 `Chat.townFeed` + 视图 | 刷新页面内容不变；未读/已读可辨（CDP 取色 + 未读计数） |
| 3 | 与「知识迷雾」接通（"听说"通道） | 不在场的旁线事件**不进**在场聊天的提示词；只有图上有通路的角色能"听说" |

**强负例（必测）**：玩家在场的聊天里，`buildPrompt`（`src/lib/prompt/builder.ts:183`）输出**不得**出现任何 `TownFeed` 文本——信息流不是旁白。

## 五、风险与开放问题

- **成本**：旁线事件若逐格生成文本会烧 token。缓解：一期只做**模板成文**（`describeAmbientEvent` 已有成文能力），LLM 只用于可选润色，默认关。
- **可复现性**：必须避免 `Math.random()`/`Date.now()` 直取（本仓已有基于世界时钟的确定性先例：`calendar.ts`/`dayPlanner.ts`），否则无法写断言、也无法重放。
- 开放：信息流要不要**回写**关系数值（比如"听说他帮了你"→ warmth 微涨）？倾向二期做，且必须走 `relationshipEventStore` 记账，不许直接改数。
- 开放：一个世界多个聊天时，信息流是**世界级**还是**聊天级**？一期按世界级生成、聊天级存增量，二期视实况收口。
