# 设计稿 · 知识迷雾（Knowledge Fog）

> 状态：**三期全部落地**（`src/lib/knowledge/claims.ts` ＋ `claims.test.ts`，20 用例）；**编辑器维度亦已落地**
> （`WorldInfoView` 的「谁知道」列，`a7de214`：按**世界**合并而非按会话重复——`mergeClaims` 让同一桩事
> 抵达三个聊天只出现一行；每行显示事实 / 见证者 / 被告知者 / 世界时钟格；纯展示、不阻塞链路）。
>
> 三期为"知识真的能旅行"：`propagateClaims`（世界时钟格内沿社交图传播、幂等）＋ `mergeClaims`
> （按 id 合并、`toldIds` 取并集，绝不因后写覆盖前写）＋ `Chat.knowledgeClaims`（零迁移）。写入侧
> 挂在**结算**上（`TownFeedView` 的 `Catch up`：同一个按钮既结算镇上消息，也让传闻流动）；装配侧读
> 本 chat 的 claims 再 `excludeFactIds` 掉自己的 facts → 块里**只剩听来的**。未做：`WorldInfoView`
> 的"谁知道"维度（纯展示，不阻塞链路）。
>
> 二期的两点实现决定：**装配复用合成世界书形态**（`knowledgeLorebookFor` 产出与 `buildFactsLorebook`
> 同形的 `Lorebook`），所以 `buildPrompt` 不用加新通道，接线点只有两处（`useChatSession.ts:633` 的
> facts 段旁生成 ＋ `:1160` 的 `lorebooks` 拼接）；**claims 是派生的**（从既有 `chat_facts` 现算），
> 不新增持久化——`Chat.knowledgeClaims` 留给"知识需要跨聊天旅行"的时候（零迁移路径已备好）。
> 自研项，原项目 front-porch-AI 无此机制（实测全仓无知识状态模型）。
> 落笔依据：本仓现码实测（行号见下）。

## 一、问题

角色**全知**。同一件事，只要进了提示词，在场所有人都"知道"；不在场的人也照样知道——因为可见性的粒度只到 **chat / 角色 / 世界**，不到 **"谁，在哪条时间线上，亲自经历了什么"**。

实测现状：

| 现状 | 文件 | 后果 |
|---|---|---|
| 世界书按范围绑定 | `src/lib/worldinfo/scope.ts`（`isGlobalBook` / `bookAppliesToChat`），应用点 `src/lib/hooks/useChatSession.ts:623` | 一条书要么全局，要么绑到"这个聊天/这个角色/这个角色所属世界"——**同一条事实对多人群聊里的所有参与者一视同仁** |
| 事实按聊天存 | `src/lib/worldinfo/facts.ts:28`（`buildFactsLorebook`，预算 `:13` = 200）、`:63`（`dedupeFacts`） | `ChatFact` 是 **per-chat** 的，不是 per-character 的 |
| 记忆无向量层 | 实测：`src/lib/memory/` **不存在**，全仓无 embedding/vector 检索 | 所谓"记忆"＝`chat_facts` 表 + 世界书。**所以本设计不新增召回层，只给已有事实加一维"谁知道"** |
| 提示词装配唯一入口 | `src/lib/prompt/builder.ts:183`（`buildPrompt`），输入契约 `:60`（`PromptBuildInput`） | 一切可见性最终都在这里生效——闸口唯一，好办 |

## 二、目标 / 非目标

**目标**
1. 一件事**只有见证者**确知；其余角色要经"告知"通路才可能知道。
2. 可见性判定**可断言**：给定 claim 集合 + 角色 + 场景，输出确定的可见集。
3. 复用既有事实/世界书与提示词装配，**不新增召回层、不引入向量库**。

**非目标**
- 不做"角色会不会说谎/隐瞒"的行为层（那是 `prompt/mindGuidance.ts` 的领域，别混）。
- 不做玩家视角的隐藏（玩家看得到自己经历的事，这是设计前提）。
- 不做全量 NPC 心智模拟。

## 三、机制

### 3.1 数据模型（纯类型，先落 `src/lib/knowledge/claims.ts`）

```ts
/** 知道的方式决定可信度与是否能再传播。 */
export type ClaimSource = 'witnessed' | 'told' | 'inferred'

export interface KnowledgeClaim {
  id: string
  /** 事件/事实的一句话本体（建议直接复用 `facts.ts` 的 `factContent()` 成文，别再写一套）。 */
  text: string
  /** 关联的既有事实/世界书条目（有则填，便于与 `dedupeFacts` 协同去重）。 */
  factId?: string
  /** 谁见证了（源头），谁被告知（传播的结果）。 */
  witnessedByIds: string[]
  toldIds: string[]
  /** 世界时钟坐标（同 town-feed）：跨聊天比较必须用世界时钟，不能用墙钟。 */
  at: { day: number; phaseIndex: number }
  scope: { worldId?: string; chatId?: string }
}
```

### 3.2 可见性判定（纯函数，全部可断言）

```ts
export interface VisibilityContext {  // 一期实现里收成了 `characterId: string`，见下方偏离说明
  characterId: string
  /** 该角色此刻参与的聊天（含其参与者列表）。 */
  chatId?: string
  participantIds: string[]
  /** 社交图（复用 `ambientEvents.ts:174` 的 `SocialConnectionLike`）：谁是"能被告知"的邻居。 */
  connections: SocialConnectionLike[]
}

/** 'witnessed' 直接可见；'told' 需在被告知名单里；其余不可见。 */
export function claimVisibleTo(claim: KnowledgeClaim, ctx: VisibilityContext): boolean

/** 只喂该角色可见的——接在既有 facts 链路后面，不替换它。 */
export function visibleClaims(claims: KnowledgeClaim[], ctx: VisibilityContext): KnowledgeClaim[]
```

> 实现偏离（一期落刀时定的）：**判定签名从 `(claim, ctx)` 收成 `(claim, characterId)`**。ctx 里的
> 社交图与参与者列表在"可见性判定"里用不到——判定只吃 claim 自带的 `witnessedByIds`/`toldIds`
> 与该角色 id；图的边属于**传播**（`toldTargets(claim, characters)`）。把两者塞进同一个上下文，
> 正是"同场即全知"从后门溜回来的方式。

**传播规则（一期只做两跳）**
1. **见证**：在场参与者 → `witnessedByIds`。
2. **告知**：见证者与图上有边的 NPC，在**同一世界时钟格**内若发生 `social` 反应（`ambientEvents.ts:186` 的 `selectSocialReaction` 影子求值）→ 进入 `toldIds`（`confidence` 降级由 `ClaimSource` 表达，不再加数值）。
3. **不推断**：'inferred' 是预留位，一期不产出（宁缺毋滥，别让模型自己脑补知道）。

### 3.3 集成点（不动主链路，并列加一道闸）

- **提示词侧**：`useChatSession.ts` 里已有的世界书过滤（`:623` 调 `bookAppliesToChat`）**旁边**再挂 `visibleClaims()`；事实成文继续走 `worldinfo/facts.ts:28`（`buildFactsLorebook`，预算沿用 `:13` = 200）。
- **去重协同**：可见集先过 `facts.ts:63` 的 `dedupeFacts`，避免"同一件事的见证版与听说版"挤占预算。
- **持久化（零迁移优先）**：服务端实测无世界/知识路由，世界状态一律挂 Chat 行（`types.ts:449`/`:490`）。一期把 claims 增量挂 `Chat.knowledgeClaims?: KnowledgeClaim[]`；claim 是**世界级**的，跨聊天读取时按 `scope.worldId` 聚合（与 town-feed 同一策略）。
- **编辑器可见性**：`src/components/worldinfo/WorldInfoView.tsx`（已有 `isGlobalBook` 的展示位）加一列"谁知道"——范围已经可视化过，这一维同样必须**可辨**（对齐 UI 一致性铁律）。

## 四、分期与验收

| 期 | 内容 | 验收（可执行断言） |
|---|---|---|
| 1 | `claims.ts` 纯判定 + 单测 | 见证者可见 ✓；图上有边的邻居在"告知"后可见 ✓；无关角色**恒不可见** ✓ |
| 2 | 接通提示词装配 | 给 A/B 私聊里发生一件事，再开 A、B、C 三人场景 → `buildPrompt` 快照里 C 侧**不含**该事实文本；A/B 侧含 |
| 3 | 编辑器维度 + 去重协同 | `WorldInfoView` 能看出"谁知道"；`dedupeFacts` 不再出现同事实双版本 |

**强正例（必测）**：A 在 B 不在场时提到该事 → B 仍不可见；直到图上"告知"边在同一世界时钟格内成立。

## 五、风险与开放问题

- **性能**：`buildPrompt` 是热路径。判定必须是 O(claims)，且 claim 数要有硬上限（建议按世界时钟过期，别无限累积）——超限策略需拍板（最旧丢弃 / 按 source 优先级）。
- **与 `ChatFact` 的关系**：`ChatFact` 是"关于玩家的事"（`types.ts`），claim 是"谁知道某件事"。一期**并存**，不做合并（合并是架构级动作，无收益不做）。
- 开放：玩家的**私聊内容**是否自动进入 claim？（倾向：是，但只对私聊双方见证，不广播。）
- 开放：要不要把 claim 暴露给 `worldinfo/activation.ts:53`（`activateWorldInfo`）参与 key 匹配？倾向二期，且必须走同一道可见性闸，避免绕过。
