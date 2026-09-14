# 自研设计稿索引

P4 §12 里 **原项目 front-porch-AI 没有先例**的三项——按用户口径：**自研项由本小姐调研后出设计稿**，稿子先落地、不直接开工。

| 稿 | 解决什么 | 状态 |
|---|---|---|
| [`town-feed.md`](./town-feed.md) | 世界在玩家不在场时也会发生事，沉淀成可读的"镇上消息" | **一期已落地**：`src/lib/world/townFeed.ts`（10 用例） |
| [`knowledge-fog.md`](./knowledge-fog.md) | 角色不再全知：一件事只有见证者确知，其余经"告知"通路 | **一期已落地**：`src/lib/knowledge/claims.ts`（9 用例） |
| [`plugin-api.md`](./plugin-api.md) | 不改主仓即可扩提示词 section / `/命令` / 视图 | 设计稿（未实现） |

一期的共同边界：**纯函数 + 断言**——不碰 UI、不碰持久化、不接提示词、不调 LLM。二三期各自在稿子的「分期与验收」里。

## 三份稿共同的实测前提

调研以**本仓现码**为准（行号级锚点全部实测，非推测）：

1. **服务端没有任何 worldinfo / ambient / outreach / triggers 路由**——世界引擎**纯客户端**，状态一律挂在 Chat 行里（`src/lib/types.ts:449` 的 `firedTriggerIds`、`:490` 的 outreach 记账、`:347` 的消息打标）。→ 故新状态的持久化策略统一走**零迁移**（新增字段进 JSON 区，照 `server/saveSlots.ts` 的示范），提表留到二期。
2. **本仓没有 `src/lib/memory/`，全仓无 embedding/vector**——所谓"记忆"＝`chat_facts` 表 + 世界书。→ 故「知识迷雾」**不新增召回层**，只给已有事实加一维"谁知道"。
3. **提示词唯一装配入口**是 `src/lib/prompt/builder.ts:183` 的 `buildPrompt`（契约 `:60`），且**世界书可见性闸口已经存在**（`src/lib/worldinfo/scope.ts` 的 `bookAppliesToChat`，应用点 `src/lib/hooks/useChatSession.ts:623`）。→ 知识迷雾并列加闸即可，不动主链路；插件 API 只此一处接入。
4. **社交与世界的原语已经齐了**：`ambientEvents.ts:174/186`（社交边与反应）、`:23/100/148`（环境事件与成文）、`workSchedule.ts`、`calendar.ts`、`triggers.ts:14/74/99`、`cast/detector.ts:189/237` + `cast/promote.ts`。→ 信息流**只做编排，不另造模拟引擎**。

## 依赖与建议顺序

- **town-feed + knowledge-fog（宜同批）**：两者共享"世界时钟坐标 + 社交图 + 零迁移持久化"三件事。信息流是知识的**进口**（旁线事件 → 谁能听说），所以**先做 town-feed 一期纯生成器，再做 knowledge-fog 一期纯判定**，两者都以纯函数 + 断言收口。
- **plugin-api（独立，可并行）**：与上面两项无耦合。其接入点只有一个（`buildPrompt`），风险集中在信任模型，故一期明确**不做动态加载、不做沙箱**——"进程内＝全权限"必须如实写在界面文案里。

## 三份稿都不做的事（边界）

- 不做 NPC 全量离线人生模拟（成本无上限）。
- 不引入向量库/新召回层（现状没有，且无收益证明）。
- 不做外部进程/网络沙箱与插件市场（遵原项目铁律：**全进程内，无 sidecar**）。
