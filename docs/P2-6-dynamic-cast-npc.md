# P2-6 动态客串 NPC —— 设计书（先设计，后落刀）

> 状态：**设计待批**（尚未写业务码）
> 计划表原文：`| P2-6 | 动态客串 NPC：路人在场景中被自动创造并入戏 | 新增 cast detector；注意 dating/sceneParticipants.ts 是亲密场景共享状态，不是路人检测 | 群场景中临时角色可被"扶正"为常驻；不污染既有角色库；可关 | 1 周 |`

## 一、先说雷区（为什么这条不能照抄群聊那套）

`src/lib/dating/sceneParticipants.ts` 是本仓库**亲密场景的共享状态**，不是路人检测器。它的现役消费者：

- `src/lib/prompt/sceneStateBlock.ts`（把参与者状态写进 prompt）
- `src/lib/hooks/useChatSession.ts`
- `src/lib/dating/stage.ts`、`src/lib/dating/relationshipAssist.ts`
- `src/components/chat/SceneStateCard.tsx`（界面卡片）

它的语义是"**这段亲密场景里谁在场、接触到了哪个部位、 arousal / 衣着如何**"（见该文件 `contactRegionsFor` / `participantArousal` / `withParticipant` 等导出）。

**结论（硬边界）**：客串 NPC 一律**不写入** `sceneParticipants`。把路人塞进这张表 = 让一个刚在面包店门口被提到的陌生人，凭空获得亲密场景的参与位，直接串味。客串 NPC 走**独立模块 + 独立开关**。

## 二、现状地基（已核实，带行号）

| 事实 | 位置 |
| --- | --- |
| 群聊 roster 由**真实角色**组装 | `src/lib/chat/scene.ts:14` `rosterFrom(character, participantCharacters)` |
| 轮转发话键 `[primaryId, ...participantIds]` | `src/lib/types.ts:184` |
| 单条消息带发言者 | `src/lib/types.ts:319` `speakerId?: string` |
| 角色创建/角色库 API | `src/lib/api/client.ts` 的 characters 面 |
| 提示词组装入口 | `src/lib/hooks/useChatSession.ts`（guidance 块，P2-1 也挂在这里） |

即：**"入戏"= 成为 roster 里的真角色**（有 `Character` 记录、有 `participantIds`），而不是往亲密状态表里塞字符串。

## 三、设计

### 3.1 新模块（纯函数，可单测）

`src/lib/cast/detector.ts`

```ts
/** 正文里出现、但既不在 roster 也不在角色库里的具名人物候选。 */
export interface CastCandidate {
  name: string
  /** 第一次出现的消息 id，用于"回到现场"。 */
  firstSeenMessageId: string
  /** 被提及次数，作为可信度信号。 */
  mentions: number
  /** 一句原文样本，扶正时用作新角色的入门描述。 */
  sample: string
}

export function detectCastCandidates(input: {
  texts: readonly { id: string; text: string }[]
  knownNames: readonly string[]
  lorebookKeys?: readonly string[]
  ignore?: readonly string[]
}): CastCandidate[]
```

判定规则（保守优先，宁可漏不可错杀）：

1. 只在**近 N 轮**（默认 `CAST_SCAN_TURNS = 8`）里扫，避免把开场白里的路人也翻出来；
2. 候选必须是**人物信号**：中文名 2–4 字 / 拉丁语系首字母大写且非句首，并伴随称谓或言语动作（"…说"、"…问"、"对…说"、"Mr./Ms./小/老" 等）；
3. 黑名单：`knownNames`（roster + 角色库）、`lorebookKeys`（世界书键）、`ignore`（用户手动忽略过的），以及星期/月份/地名后缀等明显非人名；
4. 每个候选保留 `mentions` / `sample`；`mentions < 2` 的默认可折叠（避免一次性背景人物刷屏）。

### 3.2 候选怎么存（**不新增持久化状态**）

候选**每次从消息派生**（纯函数，无缓存漂移），用户点过"忽略"的名字进 localStorage 的忽略表。**不写 Chat 结构、不做数据迁移**——这是本设计最省的一刀（YAGNI）。

### 3.3 "扶正"（唯一的写路径）

界面：群场景里出现候选时，聊天面板给一张候选卡（ghost 风格，沿用全局按钮规范）：

- **[扶正为常驻]** → 走既有角色创建 API，建一张**迷你卡**（`name` + 由 `sample` 提炼的一句话描述，其余留空），随后把新角色 id 追加进本聊天的 `participantIds`。
- **[忽略]** → 写入忽略表，永不再提。

**硬约束**：在用户点下"扶正"之前，**一次角色写入都不发生**。这是"不污染既有角色库"的可测口径。

### 3.4 开关（可关）

`useSettingsStore`：

```ts
/** 客串 NPC：off 完全不跑；suggest 只在面板列候选；永不自动建角色。 */
dynamicCastNpc: 'off' | 'suggest'
```

默认 **`off`**。注意：**没有 `auto` 档**——自动建角色会污染角色库，与验收项直接冲突，故从设计上就不提供。

### 3.5 提示词侧（可选、有上限）

开启时，只在 prompt 里追加一行"本场临时人物：X、Y（保持名字与身份一致，不要当成常驻角色）"，**上限 3 名**；`off` 时零注入。

## 四、验收标准（可测，不靠感觉）

1. **可扶正**：给定一段含"隔壁的田中さん"的群场景正文，候选卡出现；点扶正后 → 角色库新增 1 条、本聊天 `participantIds` 追加该 id、该角色能进 roster（单测 + 面板实测各一次）。
2. **不污染**：`dynamicCastNpc` 为 `off` 时，`detectCastCandidates` 不被调用，且 mock 的建角接口被调用次数 **= 0**。
3. **可关**：切到 `off` 后候选卡立即消失，已有常驻角色**不受影响**。
4. **不串味**：全量测试通过，且 `sceneParticipants` 相关测试（`dating/sceneParticipants.test.ts`、`dating/multiParticipantScene.test.ts`）零改动、仍全绿。
5. **误判率抽样**：拿 20 段真实正文跑一遍，人工数误报；>2 处误报则收紧规则再谈上线。

## 五、风险与回滚

| 风险 | 处置 |
| --- | --- |
| 人名抽取误报（把"星期一""面包店"当人） | 三重信号 + `mentions >= 2` 阈值 + 第 5 条抽样验收 |
| 中文无大小写、拉丁规则失效 | 中文走 2–4 字 + 称谓/言语动作共现；两套词典分开测 |
| 候选刷屏干扰写手 | 面板可折叠 + 忽略表 + 上限 3 名注入 |
| 与亲密场景耦合（最大风险） | 设计上零接触 `sceneParticipants`；第 4 条验收专门盯 |

**回滚**：默认 `off`，删 `src/lib/cast/`、撤一个设置字段与一张候选卡即可，无数据迁移、无残留。

## 六、估量与拆步

1. `detector.ts` + 单测（含中英两套范例、黑名单、阈值）—— 0.5 天
2. 设置字段 + 候选卡 UI —— 0.5 天
3. 扶正写路径（建角 + `participantIds` 追加）—— 1 天
4. 提示词一行（上限 3）—— 0.5 天
5. 抽样验收 20 段 + 全量门禁 —— 0.5 天

合计约 3 天（计划表原估 1 周，含抽样验收的人工时间）。

---

**等一句话**：批了本设计，本小姐就按 1→5 落刀（每步落盘 + 单测 + 全量门禁）。
