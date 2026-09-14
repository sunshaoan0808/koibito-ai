# 设计稿 · 插件 / 扩展 API（Plugin API）

> 状态：**设计稿（未实现）**。自研项，原项目 front-porch-AI 无此机制；且其铁律明确 **"All engines run in-process. No Python, no Rust, no sidecars"**（`AGENTS.md`→`CLAUDE.md`），本设计按同一约束落笔。
> 落笔依据：本仓现码实测（行号见下）。

## 一、问题

本仓的一切扩展都得改主仓代码。**唯一装配入口**是 `src/lib/prompt/builder.ts:183` 的 `buildPrompt(input: PromptBuildInput)`（输入契约 `:60`），而它今天是硬编码的：想微调一段 system 文案、想加一条写死的上下文、想在 `/` 命令里加个动作，都得动 `builder.ts` 或 `src/lib/chat/slashCommands.ts`。

实测可挂的扩展面（都在前端同进程）：

| 扩展面 | 现有位置 | 现状 |
|---|---|---|
| 提示词 section | `builder.ts:60`（`PromptBuildInput`）、`:183`（`buildPrompt`）、`PROMPT_SECTION_LABELS`（`:30`） | 固定 section 集合，无外部贡献点 |
| 斜杠命令 | `src/lib/chat/slashCommands.ts`（P2-4 吸收） | 注册表写死在仓内 |
| 视图 | `Sidebar.tsx` 的 `ViewId` + `NAV` | 视图集合写死 |
| 内置预设 | `src/lib/prompt/builtinPresets.ts`、`immersionPreset.ts`、`mindGuidance.ts`、`intimacyGuidance.ts` | 全部内置 |
| 服务端 | `server/db.ts:251-269` 的 13 个 store、`server/app.ts` 路由 | 无扩展机制；**实测无任何 worldinfo/ambient/outreach 路由**（世界引擎是纯客户端的） |

## 二、目标 / 非目标

**目标**
1. 第三方（含未来的自己）能在**不改主仓**的前提下：改提示词 section、加 `/命令`、加视图。
2. 插件**启停可辨**（用户明确知道谁在跑）、**可归零**（禁用后输出与基线逐字节相同）。
3. 与本仓 UI 纪律一致：插件不许自带一套样式。

**非目标**
- **不做外部进程/网络沙箱**（与 FP 铁律一致：进程内）。风险用**声明式能力 + 显式授权**管理，不用沙箱。
- 不做插件市场/签名分发（一期）。
- 不做服务端插件的任意代码执行（服务端只认 manifest 元数据，见下）。

## 三、机制

### 3.1 三层 hook（先落 `src/lib/plugins/registry.ts` + `src/lib/plugins/types.ts`）

```ts
export interface PluginManifest {
  id: string
  name: string
  version: string
  /** 声明式能力：默认无网络、无写提示词。 */
  capabilities: Array<'prompt:read' | 'prompt:write' | 'commands' | 'views' | 'net'>
  /** 写 hook 的串行顺序（只读 hook 可并发）。 */
  order?: number
}

/** L1：提示词 section 级。before 可读、after 可改；不得直接发网络。 */
export interface PromptHook {
  id: string
  /** 只读观察（用于统计/日志），返回值被忽略。 */
  observe?(ctx: PromptHookContext): void
  /** 改 section 文本；返回 undefined = 不改。同一个 section 多个 hook 按 manifest.order 串行。 */
  transform?(section: PromptSectionId, text: string, ctx: PromptHookContext): string | undefined
}

/** L2：/命令。handler 必须是纯函数式的：拿上下文，返回要插入的文本或动作。 */
export interface CommandHook {
  name: string          // 不含前导 /
  description: string
  run(args: string, ctx: CommandContext): CommandResult
}

/** L3：视图。样式必须走既有 Button/Modal/ViewShell，禁止局部特例。 */
export interface ViewHook {
  id: ViewId
  label: string
  render(): React.ReactNode
}
```

### 3.2 加载与信任

- **一期不动态加载代码**：`registry.ts` 是**静态注册表**（插件在仓内、编译期可见），避免 `eval`/动态 import 带来的供应链与 CSP 问题。二期若要外部插件目录，走 Vite 的 `import()`（**仍是同进程同权限**，所以能力声明与授权界面必须先就位）。
- **服务端**：`plugins/` 目录只放 **manifest（元数据）**，服务端不执行插件代码；启用状态存既有设置面。
- **权限**：`prompt:write` 与 `net` 默认关；开启需用户在插件面板显式勾选，状态持久化。缺能力时 registry **拒绝注册**该 hook（不是静默忽略）。
- **UI 约束（铁律）**：`ViewHook` 只能渲染既有组件；`Button` 的 `ghost`/`primary` 等变体不由插件自定义（对齐"ghost+SVG 全局统一"）。

### 3.3 与既有装配点的接线

- `buildPrompt`（`builder.ts:183`）内，在各 section 成文之后、拼装之前，调用 `applyPromptHooks(sections, ctx)`；**每个 hook 单独 try/catch 并计时**——一个坏插件不得让聊天装配整体失败（沿用本仓 `results.failed` 式的失败隔离思路）。
- `/命令`：`slashCommands.ts` 的解析表在初始化时并入 `registry.commands()`；命令名冲突 → **拒绝注册并报错**（不许静默覆盖，零歧义）。
- 视图：`App.tsx` 的视图分发旁加一层：`registry.views()` 里有的 `ViewId` 才渲染插件组件。

## 四、分期与验收

| 期 | 内容 | 验收（可执行断言） |
|---|---|---|
| 1 | `types.ts` + `registry.ts` + 单测（无 UI） | 缺能力注册被拒 ✓；命令名冲突被拒 ✓；hook 抛错被隔离且计数 +1 ✓ |
| 2 | 接 `buildPrompt` + `/命令` | 示例插件能在不改主仓的前提下改一个 section 的文本；**禁用后 `buildPrompt` 输出与基线逐字节相同**（用既有提示词快照测试，这是最强验收） |
| 3 | 视图 hook + 插件面板 | 插件视图用既有组件渲染；启停状态刷新后保持；面板显示每个 hook 的耗时 |

**强负例（必测）**：`prompt:write` 未授权时，插件对 section 的改动**必须无效**（而非"改了但没人用"）。

## 五、风险与开放问题

- **信任模型**：进程内 = 全权限，能力声明是**约定**不是沙箱。故一期的真实边界是"只装自己写的插件"；要装第三方，必须先把动态加载 + 能力提示做出来。**这一点必须在界面文案里如实说明**，不许给人虚假安全感。
- **顺序不确定性**：只读 hook 可并发，写 hook 按 `order` 串行；同类 hook 同 `order` 时按 id 字典序（可复现，可断言）。
- **热路径性能**：`buildPrompt` 每次生成都跑。每个 hook 计时，超阈值（建议 5ms）在 dev 面板告警。
- 开放：插件要不要能加**服务端**路由？倾向不做（服务端无扩展机制，加了就是新攻击面）。
- 开放：是否需要插件级设置存储（`pluginSettings[id]`）？倾向二期，复用既有设置存储，别开新表。
