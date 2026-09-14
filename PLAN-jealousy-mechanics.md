# 群场景嫉妒的「机械判定」方案（Tier 3b ③）

> 状态：**待你选型**，未落码。作者：哈雷酱。日期：2026-09-14
> 触发：TODO 里"群场景嫉妒与竞争（`jealousy` flag 未接机械判定）"。

## 1. 现状（取证，非推断）

`jealousy` 在非测试代码里**只有 4 处**，全部属于「检测」侧，**零消费者**：

| 位置 | 作用 |
|---|---|
| `src/lib/dating/stage.ts:35` | `SCENE_FLAGS` 枚举里的一项 |
| `src/lib/dating/relationshipAssist.ts:96` | 术语表：告诉裁判 jealousy 指什么 |
| `src/lib/dating/relationshipAssist.ts:271` | `presentParticipants`：把"场中还有谁在说话"传进分类器 |
| `src/lib/dating/relationshipAssist.ts:317` | 提示词：帮裁判判断**是否设立**该 flag |

即：它能被**正确识别并记入 `Chat.sceneFlags`**（`useChatSession.ts:1361/1524/1821`），但**设立之后没有任何事发生**。旁证：`Chat.sceneFlags` 已被别的机制消费 —— 服装解锁（`useChatSession.ts:1235` `selectableOutfitIds`）与场景 flag 门控（`intimacyScene.ts:615` `withSceneFlag` / `flag_set` 触发器）—— 所以"flag 驱动机制"这条管线是**通的**，嫉妒只是没接上去。

## 2. 为什么不能直接加一个数值 delta

裁判**本来就在动维度**：实测 `relationship_events` 里就有一条
`trust -1 / comfort -1 / tension +1`，理由是 "Asserted boundaries after user presumed her presence"。
再叠一层确定性 delta 会有两个真问题：① 与裁判的 `deltas` **双重计数**；② 两者可能**反向打架**（裁判说关系缓和，机械层却再罚一次）。**必须先定义去重/优先级规则**，否则就是引入 bug。

## 3. 三个选项（按我推荐的顺序）

### A. 叙事层：把 jealousy 接成**场景门控**（推荐）
用已有的 `flag_set` 机制（`intimacyScene.ts:615`）：嫉妒一旦成立，**解锁/激活嫉妒专属场景或选项**。
- 成本：**低-中**（纯内容门控，复用已有管线；要写 1-2 个场景定义）
- 风险：**低**（不碰评分，纯"有没有这个内容"）
- 验收：`jealousy` 在 `sceneFlags` 且存在一个 `flag_set: 'jealousy'` 的场景/选项 → 该选项在嫉妒回合后出现，未设立时不出现；单测锁住门控纯函数。

### B. 数值层：对**在场竞争者**施加效果
嫉妒成立时，对 `presentParticipants` 里的竞争者做确定性维度变化。
- 成本：中；风险**中高** —— 必须先定义"谁受影响、与裁判 deltas 如何去重、优先级谁高"
- 前置：先写出**去重规则**并给它写测试，否则不碰
- 验收：一条嫉妒回合后，竞争者的事件行带确定性来源标记，且与裁判行不重叠

### C. 提示层：把嫉妒**回灌进下一回合的 prompt**
一句"她刚表现过占有欲，别当没发生"。
- 成本：**低**；风险低；但**机械性最弱** —— 仍是模型自由发挥，不算"判定"

## 4. 我的建议

**先 A**（真实、可测、零评分风险），若你要更强的手感再叠 **B**（但 B 必须先写去重规则 + 测试）。
C 只作为 A/B 之后的润色，不该单独立项。

**要我开工的话，说"A"或"B"即可**；我会先出台账 diff 再落码。
