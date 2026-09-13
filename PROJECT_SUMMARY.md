# RP Suite / koibito-ai — 项目现状

> **文档权威性**｜本文件是**项目现状快照**（"现在是什么样"）。
> 待办与排期看 `DEVELOPMENT_PLAN.md`；FP 吸收进度看 `docs/ABSORPTION-PLAN.md`。
> **刷新日期：** 2026-09-13 ｜ **数据口径：** 源码静态实测（`find`/`grep`/`wc`），未运行测试套件
> **来源：** 本仓库基于上游 [pnotisdev/rp](https://github.com/pnotisdev/rp)（MIT）二次开发，版权见 `LICENSE` 与 `NOTICE`。

---

## 1. 项目定位

一个**完全跑在自己机器上**的角色扮演客户端，围绕"恋爱模拟"设计而不是事后加装。核心是
"LLM 提议、代码裁决"：模型负责演出，确定性代码负责数值、时间、记忆与后果。

---

## 2. 技术栈（实测，含版本）

| 层 | 实际使用 |
|---|---|
| 前端 | React `^18.3.1` + TypeScript + Vite `^6.4.3` + Tailwind CSS `^3` + zustand `^4.5.5` |
| UI 基础件 | **自研**（`src/components/ui/` 24 个：`Modal`/`Section`/`Field`/`Chip`/`ListEditor`/`EditorShell`/`IconButton`…）。**未使用 Radix UI**（依赖表 0 命中） |
| 图标 | `lucide-react` |
| 后端 | Express `^5.2.1` + **`node:sqlite`（`DatabaseSync`，零 ORM）**；启动需 `--experimental-sqlite` |
| 状态/持久化 | zustand（仅 UI 偏好走 localStorage）；所有实体落 `data/rp.db`（SQLite/WAL） |
| 测试 | Vitest `^3.2.7` |
| PWA | `vite-plugin-pwa` |
| 构建 | `tsc --noEmit && vite build`；`strict: true`（前端与服务端 tsconfig **均已开启**） |
| 生产依赖数 | 8 个（`@agnai/sentencepiece-js`、`@fontsource-variable/inter`、`@fontsource/zen-maru-gothic`、`express`、`lucide-react`、`react`、`react-dom`、`zustand`） |

---

## 3. 规模基线（2026-09-13 实测，供后续对比）

| 指标 | 实测值 |
|---|---|
| `src` + `server` TS/TSX 文件 | **385** |
| 代码行数 | **67,430** 行（口径：`tools/audit/count_scale.py`） |
| 测试文件 / 用例 | **117 个 / 2,191 个** |
| 约会与亲密机制模块 | **28 个**（`src/lib/dating/`，不含测试） |
| 玩法模板 | **3 个**（`freeform` / `visual_novel` / `dating_sim`；`slice_of_life` 已并入 `freeform`） |
| 命运轮盘事件池 | **70 条**（幸运/厄运/混乱/离谱/滑稽各 12 + 10 条 `spicy` 默认关闭） |
| i18n 词典 | 中文 **203 条**（口径：`src/lib/i18n/zh.ts` 引号键计数）；英文词典**故意为空**（英文即源字符串，`t()` 缺失即回落） |

---

## 4. 模块地图（**真实路径**，改动前先按此定位）

| 领域 | 真实落点 |
|---|---|
| 真实感引擎 / 日记 / 命运轮盘 | `src/lib/realism/engine.ts`（527 行；`CHAOS_EVENTS` :310–387、`chaosRoll` :399；日记层 `JournalEntry` :440 → `journalGuidance` :520）<br>测试：`realism/engine.test.ts`、`realism/journal.test.ts` |
| 关系判定器（反刷分） | `src/lib/dating/relationshipAssist.ts` 的 `assessRelationshipMoment`（被 5 个文件引用） |
| 约会/亲密机制（**28 模块 / 29 测试**，实测） | `src/lib/dating/`：`aftercare` `agencyGuard` `arousal` `beliefs` `boundaryGuard` `catalogVisuals` `clothing` `continuityGuard` `expectations` `gifts` `intent` `intimacyCatalog` `intimacyScene` `intimacyStages` `items` `kinks` `momentum` `outreach` `plans` `rapport` `rebuff` `relationshipAssist` `relationshipDescription` `scenarios` `sceneParticipants` `stage` `steer` `touch`<br>（另有 `intimacyPlaythrough.test.ts`、`multiParticipantScene.test.ts` 两个无同名模块的测试文件） |
| 世界时钟 / 天气 / 精力 | `src/lib/world/calendar.ts`（`advancePhase` / `getEnergyRemaining` / `describeWeather`） |
| 日计划游戏循环 | `src/lib/world/dayPlanner.ts` + `src/components/chat/DayPlannerPanel.tsx` |
| 触发规则 / 环境事件 | `src/lib/world/triggers.ts`、`src/lib/world/ambientEvents.ts` |
| 关系面板（真实感状态卡 / 她的日记） | `src/components/chat/RelationshipPanel.tsx`（1,218 行；日记节 :1168） |
| 聊天主窗 / VN 舞台 | `src/components/chat/ChatWindow.tsx`（993 行）、`src/components/chat/VNStage.tsx`（1,145 行） |
| 角色卡 I/O | `src/lib/characters/cardSpec.ts`（V2/V3 + CCv3 assets）、`src/lib/characters/importExport.ts` |
| AI 角色生成 | `src/lib/characters/generateFullCharacter.ts`（分阶段编排） |
| 记忆 / 世界书 | `src/lib/worldinfo/facts.ts`（记忆预算上限）、`activation.ts`、`scope.ts` |
| 文本处理 / 去重 | `src/lib/text/slop.ts`（含 `isVerbatimEcho`）、`messageSegments.ts`、`regexScripts.ts` |
| 语音（TTS/STT） | `src/lib/voice/ttsProviders.ts`、`cloudTts.ts`（→ `/api/llm/v1/audio/speech`）、`stt.ts`、`vad.ts`、`dictation.ts` |
| 生图后端 | `src/lib/api/`：`a1111Image` `comfyuiImage` `swarmuiImage` `novelaiImage` `openMayhemMedia` + `createImageBackend.ts` / `imageBackend.ts` |
| 导出 | `src/lib/export/chatTranscript.ts`（HTML 记录） |
| 鉴权 + LLM 代理 | `server/llmProxy.ts`（口令登录 + HMAC 会话 cookie + `/api/llm/*` 服务端转发） |
| HTTP/路由 | `server/app.ts`（1,251 行）、`server/index.ts`（37 行） |
| 数据层 | `server/db.ts`（260 行，`node:sqlite`） |
| 种子内容 | `server/seedContent.ts`（735 行）+ `server/seed.ts`（幂等） |
| 跨域守卫 | `server/originCheck.ts` |
| i18n | `src/lib/i18n/index.ts` / `zh.ts` / `en.ts` |

> ⚠️ **禁止引用以下不存在的路径**（历史文档写错，勿再沿用）：
> `src/lib/journal.ts`、`src/lib/journal.test.ts`、`src/lib/chaos-events.ts`、`src/lib/chaos-events.test.ts`、
> `src/components/chat/JournalPanel.tsx`、`src/lib/relationshipValidator.ts`、`src/lib/characterCard.ts`。

---

## 5. 相对上游的已完成改造

1. **鉴权 + 服务端 LLM 代理**（`server/llmProxy.ts`）：口令登录 + 确定性 HMAC 会话 cookie（重启不掉登录，改口令即全体失效）；`/api/llm/*` 转发到上游网关，**key 只存服务端**；SSE 流式透传。⚠️ 挂载顺序必须在 `express.json` 之前（否则 POST body 被消费、代理永久挂起）。
2. **PWA**：`vite-plugin-pwa` + 中文 manifest + 图标；`/api` 不缓存。
3. **局域网多设备**：服务端绑 `0.0.0.0`，vite `--host`，内网 Origin 放行。
4. **i18n**（`src/lib/i18n/`）：中文词典 **203 条** + 设置页语言切换（`localStorage: rp.locale`，默认中文），`t()` 支持 `{name}` 插值。
5. **系统提示词中文化**：`src/lib/prompt/systemPrompts.ts` 全部 10 个预设改中文 + 语言跟随规则。
6. **Sumire 角色卡汉化**（数据在库内，不在代码里）。
7. **FP 机制吸收 11 项**（承诺账本 / 信任修复 / 双层 Bond / 情绪强度 / 心结 / 七需求 / 成长年轮 / 命运轮盘 / 久别重逢 / 判定器扩展 / 关系面板真实感卡 + Journal）：详见 `docs/ABSORPTION-PLAN.md`。

---

## 6. 已知缺陷（未修，登记在案）

| # | 问题 | 位置 |
|---|---|---|
| 1 | 中文文案混入英文残渣 3 处 | `src/lib/realism/engine.ts:321`（`accidentally`）、`:323`（`minimum 奖`）、`:524`（`soft 一瞬`） |
| 2 | 文件头注释过期（写"会话存内存、重启掉线"，实际已改 HMAC） | `server/llmProxy.ts:1–20`（代码在 `:54–56`） |
| 3 | 悬空引用：注释引用的 `FIXES_TODO.md` 仓库内不存在 | `src/lib/types.ts` 等 6 处 |
| 4 | **GBK/UTF-8 误码（乱码）**：英文注释里的破折号 `—` 被写成 `鈥?`，共 **30 行 / 2 文件**（`src/components/chat/MessageBubble.tsx` 17 行、`src/components/chat/ChatsPanel.tsx` 13 行） | 见 `DEVELOPMENT_PLAN.md` P0-4 |
| 5 | 未审计项：`as any`/`@ts-ignore` 使用面、可访问性（键盘/ARIA）覆盖、大列表渲染性能 | 全库（`strict: true` 已开，但上述未做过专项审计） |

---

## 7. 文档地图（哪份管什么）

| 文档 | 职责 | 状态 |
|---|---|---|
| `PROJECT_SUMMARY.md`（本文） | 现状快照：技术栈 / 规模 / 模块地图 / 已知缺陷 | ✅ 2026-09-13 刷新 |
| `DEVELOPMENT_PLAN.md` | **唯一待办与排期源**：P0–P5 任务、验收标准、里程碑 | ✅ 2026-09-13 刷新 |
| `docs/ABSORPTION-PLAN.md` | 相对上游的改造记录 + Front Porch AI 吸收进度 | ✅ 2026-09-13 校正数字 |
| `README.md` | 对外说明 / 安装与使用 | 上游为主 + 顶部中文来源块 |
| `ROADMAP.md` | 上游原始长线想法（编号至 #137） | 上游自带，**未改动** |
| `TODO.md` | 上游竞品对标 TODO（剩 13 项未勾） | 上游自带，**未改动** |
| `OPENMAYHEM.md` | OpenMayhem 网关接入记录 | 参考 |
| `DOCKER.md` | 容器部署 | 参考 |
| `tools/audit/` | **对账工具**（只读）：提交前闸门 / 文档路径校验 / 英文残渣与乱码扫描 / 规模统计 / 缺口复核 | ✅ 2026-09-13 收入 |

---

## 8. 快速开始

```bash
npm install
npm run dev          # 前端 vite --host + 服务端 tsx watch
npm test             # Vitest（116 文件 / ~2156 用例）
npm run typecheck    # 三套 tsconfig 全量类型检查
npm run build        # tsc --noEmit && vite build
docker-compose up -d # 容器方式
```

- 客户端连接：Backend = OpenAI-compatible，Base URL = `/api/llm/v1`（走服务端代理），key 留空。
- 服务端配置：`data/config.json`（`authPasscode` / `llmBaseUrl` / `llmApiKey`）或对应环境变量；**`data/` 已 gitignore，勿提交**。
