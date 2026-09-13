# 开发计划（koibito-ai）

> **文档权威性**｜本文件是**唯一待办与排期源**（"接下来做什么"）。
> 项目现状看 `PROJECT_SUMMARY.md`；FP 吸收进度看 `docs/ABSORPTION-PLAN.md`；上游原始想法看 `ROADMAP.md` / `TODO.md`（上游自带，本仓库不改）。
> **刷新日期：** 2026-09-13 ｜ **刷新依据：** 全量文档 × 代码逐项对账（脚本见 §8）
> **估量口径：** 人日，单人串行，不含评审时间。

---

## 0. 本次刷新改了什么（为什么刷新）

| 动作 | 内容 |
|---|---|
| ❌ 删除幽灵项 | 旧版 22 个未勾选项里，有 5 类引用了**不存在的文件**（`src/lib/journal.ts`、`chaos-events.ts`、`JournalPanel.tsx`、`relationshipValidator.ts`、`characterCard.ts`），已全部按真实落点重写或删除 |
| 🔢 修正数字 | 测试"800+"→ **116 文件 / ~2,156 用例**（P1-1 交付后为 **117 文件 / 2,170 用例**；P1-2 交付后为 **117 文件 / 2,191 用例**）；Chaos 事件"24 个"→ **70 条**；i18n 从"待做"→ **已完成**；`strict: true` 从"待开启"→ **已开启** |
| ✅ 删除已解决项 | 移动端适配（`RelationshipPanel` 已响应式）、日记虚拟滚动（无该组件，前提不成立）、STT（`voice/stt.ts`+`vad.ts`+`dictation.ts` 已实现）、类型严格化（已开） |
| ➕ 新增真实缺口 | 来自 2026-09-13 代码对账的 P1/P2 项（成长回写、时间流逝、Chaos 扩容、TTS 通道、Clock In、小时天气、EPUB、斜杠命令、聊天内生图、动态 NPC、记忆去重、BYAF/JSONL） |
| ✅ 落地 | 旧版唯一真实待办 `exportWithGrowth()` 成长回写 → **P1-1 已完成**（`19f1111`）；自动时间流逝 → **P1-2 已完成**（`b607209`） |

> **旧版 `DEVELOPMENT_PLAN.md` 的 Phase 1 里有 2 项"已完成但被写成未完成"**（移动端、虚拟滚动），照旧版干活会重复劳动——本版已清除。

---

## 1. 基线

见 `PROJECT_SUMMARY.md` §3（385 文件 / 67,428 行 / 116 测试文件 / ~2,156 用例 / 28 约会模块）。

---

## 2. 冻结清单（**已完成，禁止重做**）

**上游已完成的大件**（详见 `ROADMAP.md` #1–#137，`TODO.md` Tier 1 / 2 / 3a 全部已勾）：
聊天核心与 prompt 引擎、流式、自动滚动、消息编辑/重生成/分叉、世界书/世界卡 + 触发规则、记忆（`worldinfo/facts.ts`，有预算上限）、角色卡 V2/V3 + 资产、角色生成、图库、表达式集、语音朗读（`voice/ttsProviders.ts`）、STT（`voice/stt.ts`）、世界/日历/精力、日计划循环、约会系统 28 模块、玩法模板 3 个、切面模式（VN/Sliced）、备份与数据管理、命令面板、模型兼容探测。

**本仓库相对上游新增**（`PROJECT_SUMMARY.md` §5）：口令鉴权 + 服务端 LLM 代理、PWA、局域网多设备、i18n（zh 218 条）、系统提示词中文化、Sumire 卡汉化、FP 机制吸收 11 项。

> ⚠️ 不要再"实现"以下已被误报为待办的东西：**i18n**、**STT**、**移动端响应式**、**`strict: true`**、**日记物理引擎**（在 `realism/engine.ts:440–527`）、**命运轮盘**（70 条已在 `:310–387`）、**关系判定器**（`dating/relationshipAssist.ts`）。

---

## 3. 任务清单

### P0 — 纠偏（≈0.5 天，**先做**）

| ID | 任务 | 落点 | 验收标准 | 估量 |
|---|---|---|---|---|
| P0-1 ✅(`11a4269`) | 修 3 处中文文案英文残渣 | `src/lib/realism/engine.ts:321`（`accidentally`）、`:323`（`minimum 奖`）、`:524`（`soft 一瞬`） | `grep -n "accidentally\|minimum 奖\|soft 一瞬" src/lib/realism/engine.ts` 无命中；`npm test` 全绿 | 10 分钟 |
| P0-2 ✅(`11a4269`) | 同步过期文件头注释 | `server/llmProxy.ts:1–20` 仍写"Sessions live in memory — restarting the server logs everyone out"，实际 `:54–56` 已是 HMAC 确定性 token（重启不掉登录） | 注释与实现一致；无功能改动 | 10 分钟 |
| P0-3 | 文档纪律落地：本文件 + `PROJECT_SUMMARY.md` 成为权威源，其余文档不再各自维护待办 | 仓库根 `*.md` | 幽灵路径黑名单（§7-2）在文档中 0 命中（黑名单清单除外） | 30 分钟 |
| P0-4 ✅(`11a4269`) | **修源码注释乱码**（GBK/UTF-8 误码）：英文注释里的破折号 `—` 被写成 `鈥?` | `src/components/chat/MessageBubble.tsx`（17 行）、`src/components/chat/ChatsPanel.tsx`（13 行） | `python3 tools/audit/scan_cjk_pollution.py` 的 MOJIBAKE 计数 = 0；`npm test` 全绿；diff 仅限注释 | 30 分钟 |

### P1 — 核心价值（≈2 周）

| ID | 任务 | 落点 / 地基 | 验收标准 | 估量 |
|---|---|---|---|---|
| **P1-1 ✅(`19f1111`)** | **成长回写角色卡（AI Enhance）**：把养出来的年轮/关系/心结烘焙进卡，导出即可带走 | 已落地 `src/lib/characters/exportWithGrowth.ts`（纯函数 `buildGrowthSnapshot` 等 + `loadGrowthSnapshot` 取数层）；`cardSpec.ts` 的 `extensions` 透传（:286 / :323 / :340）承接快照；年轮数据来自 `realism/engine.ts` | 导出 JSON 含 `extensions.rp_growth`（年轮/日记/关系阶段/心结/关键记忆）；重新导入后 `readGrowth` 可回读；**14 个单测**；导出 UI 有开关（默认关）+ 规模预览 | 已交付 |
| **P1-2 ✅(`b607209`)** | **自动时间流逝**：按一轮叙事时长推导推进时段，日历/精力/日记时间戳联动；OOC 可跳时 | 已落地 `src/lib/world/calendar.ts`（`deriveElapsedPhases` / `reasonedAdvance` / `MAX_DERIVED_PHASES` / `MAX_DERIVED_DAYS` + `detectNarratedPhaseMatch` 拆出以复用命中位置）；挂点 `useChatSession.ts` 回合发送处（紧跟原有 per-chat `scene.timePhase` 覆盖块）；开关 `useSettingsStore.autoAdvanceTime`（默认开，Settings → Generation → World clock）；顺带修复 `nextRealism` 把 `journal` 整个丢掉、日记从不写入的缺陷（`realism/engine.ts`），日记条目新增 `atDay`/`atPhase` 世界钟戳记 | 每回合推进 0~3 时段且可解释（`reasonedAdvance().note` 进 toast）；日历/精力/日记三者一致（精力由 `getEnergyRemaining(day, phaseIndex)` 从钟派生，戳记取发送时新读的钟）；"关闭自动推进"开关；**21 个新单测**覆盖深夜/跨日/跨季跨年/0 段/跳日/同日后指 | 已交付 |
| **P1-3** | **Chaos 事件池扩容** 70 → 150+ | `src/lib/realism/engine.ts:310–387` | 实测条数 ≥150；五风味各 ≥24；`spicy` 提至 ≥30；无重复文案；`engine.test.ts` 全绿 | 1 天 |
| **P1-4** | **TTS 通道打通**（配置侧，非写码） | 前端 `src/lib/voice/cloudTts.ts:43` 已打 `/api/llm/v1/audio/speech`；需在自己的网关上开 TTS 路由 | 设置页"语音"测试按钮出声；长文按 `sentenceChunker` 分句、不截断；`VoiceSettings` 各 provider 可切换 | 0.5 天（取决于网关） |

### P2 — 体验与竞争对齐（≈4 周）

| ID | 任务 | 落点 / 地基 | 验收标准 | 估量 |
|---|---|---|---|---|
| P2-1 | Clock In 职业班表：哪几天/几点上下班、跳回合横幅、迟到后果 | 地基 `Character.schedule` + `getCurrentActivity`；新增 `src/lib/world/workSchedule.ts` | 班表可编辑；到点出现上下班提示；跨周重复；与日计划精力互不冲突 | 2~3 天 |
| P2-2 | 小时级天气引擎：日内变化、温度曲线、明日预报 | `src/lib/world/calendar.ts`（现仅时段级 `describeWeather`） | 同一时段内天气可变；预报命中率可测（确定性种子）；注入提示词的天气串随时间变化 | 1 周 |
| P2-3 | EPUB 导出 + 有声书（TTS 串流成音频） | `src/lib/export/chatTranscript.ts`（已有 HTML 记录管线） | 导出的 epub 在 Apple Books / Calibre 可读、目录按章；有声书按消息分轨 | 2~3 天 |
| P2-4 | 斜杠命令（`/image` `/skip` `/ooc` `/roll`…） | 复用命令面板（#74）的注册表与补全 | 聊天输入框内触发；与现有 OOC/分叉不冲突；有 `/help` 列表 | 3~5 天 |
| P2-5 | 聊天内图片工作流：`/image`、图生图 Edit、即时场景快照 | 后端**齐备**：`api/{a1111,comfyui,swarmui,novelai,openMayhem}Image.ts` + `createImageBackend.ts` | 聊天中一句话出图并回显；图生图能引用上一条图片；失败有明确错误态 | 1 周 |
| P2-6 | 动态客串 NPC：路人在场景中被自动创造并入戏 | 新增 cast detector；注意 `dating/sceneParticipants.ts` 是**亲密场景共享状态**，不是路人检测 | 群场景中临时角色可被"扶正"为常驻；不污染既有角色库；可关 | 1 周 |
| P2-7 | 记忆去重与反鹦鹉全量 | 已有 `text/slop.ts` 的 `isVerbatimEcho` + `worldinfo/facts.ts` 预算上限 | 召回结果去重（相似度阈值可配）；重复台词率有基线对比；不过度删减有效记忆 | 2 天 |
| P2-8 | BYAF 导入 / SillyTavern JSONL 导出 | `characters/importExport.ts`（已有 PNG/JSON V2/V3） | 能导入 BYAF 卡；导出的 JSONL 可被 ST 直读；round-trip 无损 | 1~2 天 |

### P3 — 上游 `TODO.md` 未勾 **23 项**（原文见 `TODO.md`，此处只标位与分组，勿重复复制）

| 分组 | 未勾数 | 行号 | 内容摘要 |
|---|---|---|---|
| Tier 3b 游戏循环 | 4 | L322 / L327 / L331 / L335 | 主动角色实时节奏（聊天室模式，Outreach 已有 `useOutreachTick`）、关系日记/Confidant 页、群场景嫉妒与竞争（`jealousy` flag 未接机械判定）、路线/战役结构（11 天弧） |
| Tier 4 竞争对齐与创作 | 9 | L344 / L349 / L352 / L357 / L361 / L363 / L365 / L370 / L374 | RisuAI 式内联素材 `{{image::name}}`、Do/Say/Narrate 输入模式、场景模板填空、存档槽、聊天文件夹/标签、分支树视图、组合式角色创建、用户脚本（Output hook 优先）、聊天内即时快照 |
| Tier 5 信息架构 | 4 | L382 / L395 / L397 / L400 | 拆分 Generation 设置页（现约 16 段堆叠）、设置搜索、`<InheritableField>` 继承可视化、更多交叉链接 |
| Tier 6 小打磨 | 6 | L407 / L408 / L410 / L412 / L414 / L416 | 输入聚焦时场景变暗、`WorldCard` 开场字段、Persona 相容加成、VN 半透明日志样式（按说话人配色）、表达集生成入口前置、画廊"音乐室" tab |

### P4 — 上游 `ROADMAP.md` §12–15 未勾 **14 项**（原文见 `ROADMAP.md`）

| 分组 | 未勾数 | 行号 | 处理建议 |
|---|---|---|---|
| §12 平台级（未排期） | 6 | L3086–L3112 | **独立立项**：存档槽、分支树视图、NPC 间后台模拟、城镇信息流、知识迷雾、插件/扩展 API。每一项都是架构级，需先"想清楚"再动 |
| §13 引导 | 1 | L3236 | 模式开关"这些是干什么的"说明——小活，可随 P2 一起做 |
| §14 World Info 深度 | 1 | L3345 | ST/RisuAI 有的世界书深度项——需先做差距清单再评估 |
| §15 AI Dungeon 想法 | 6 | L3666–L3767 | ⚠️ 其中 4 项与 P3 Tier 4 重复（用户脚本、Do/Say/Narrate、场景模板、聊天内快照）→ **以 P3 为唯一执行口径**，P4 只保留 §12 + §13 + §14 共 **8 项独立项** |

### P5 — 分发与打包（未排期）

| ID | 任务 | 备注 |
|---|---|---|
| P5-1 | Electron 打包（桌面版） | 依赖 PWA 已就绪 |
| P5-2 | Android APK（Capacitor） | 手机目前靠 PWA |
| P5-3 | VPS 部署脚本（一键） | 现为手动 + docker-compose |
| P5-4 | 角色卡导入向导 | `importCharacterFile` 已在，缺"兼容性 + 成长数据预览报告" |
| P5-5 | 多模态图像理解 | 让角色"看见"用户发的图（旧版 Phase 3.3，仍有效） |
| P5-6 | 角色性格演变系统 | 性格随长期互动流变（FP `ABSORPTION-PLAN` §五 未吸收项） |
| P5-7 | 共享记忆库 | 跨角色共享已发生的事件（同一世界的角色互相"知道"） |

---

## 4. 明确不做（避免反复讨论）

1. **Stoop 一类社区功能**、**本地推理全家桶**（KoboldCpp/llama.cpp 自带部署）、**tool-calling 传输优化** —— `docs/ABSORPTION-PLAN.md` 已判定收益不足。
2. **补齐 `i18n/en.ts`** —— 设计如此（英文即源字符串，`t()` 缺失即回落），补了反而制造双份维护。
3. **用 Radix UI 替换自研 UI 件** —— 24 个基础件已稳定，替换无用户可感收益。

---

## 5. 里程碑

| 版本 | 范围 | 目标 |
|---|---|---|
| **v1.0.0** | P0 全部 + P1 全部（含 TTS 通道） | 2026-10-15 |
| **v1.1.0** | P2 全部（体验与竞争对齐） | 2026-11-30 |
| **v1.2.0** | P5 分发（Electron / APK / VPS 文档）+ P3 精选 | 2026-12-31 |

> 旧版 v1.2.0 范围里的"多语言 i18n"**已完成**，不再列入（`PROJECT_SUMMARY.md` §5-4）。
| 未排期 | P4 §12 平台级（需先立项论证） | — |

---

## 6. 技术债与未审计项

| # | 项 | 状态 |
|---|---|---|
| 1 | `src/components/chat/RelationshipPanel.tsx`（1,218 行）、`ChatWindow.tsx`（993 行，旧版称"1,000 行偏大"）、`VNStage.tsx`（1,145 行）偏大 | 待评估拆分收益（**先想清楚**，禁止 blind refactor） |
| 2 | 公共 hooks 抽取（旧版提议 `useRelationshipStats` / `useJournal`） | 待评估；建议随 P1/P2 改动顺带抽取 |
| 3 | `as any` / `@ts-ignore` 使用面 | **未统计**（⚠️ 旧版写"添加 `strict: true`"已过期：前端与服务端 tsconfig **均已开启**） |
| 4 | `LLM 调用失败的降级策略` / `SQLite 写入失败的事务回滚` | **未审计**（旧版列为高优先级，本版保留） |
| 5 | 可访问性（键盘导航 Tab/Shift+Tab、ARIA）覆盖度 | **未审计** |
| 6 | 长消息列表渲染性能（>500 条虚拟滚动）、头像懒加载 | **未基准**（依赖表无 `@tanstack/react-virtual`） |
| 7 | `FIXES_TODO.md` 悬空引用（6 处注释指向不存在的文件） | 待补文件或改注释 |
| 8 | 2,156 个测试用例中 AI 生成比例（旧版写"800 测试"，已过期） | **未审**，关键路径（鉴权代理 / 判定器 / 日记物理 / 时间）建议人工复核 |

---

## 7. 文档纪律（硬规则，写死）

1. **单一权威源**：现状只写 `PROJECT_SUMMARY.md`；待办只写本文件；吸收进度只写 `docs/ABSORPTION-PLAN.md`。不得在多份文档各维护一份待办清单。
2. **禁止引用未实测的路径**。历史黑名单（**不存在**，勿再出现）：
   `src/lib/journal.ts`、`src/lib/journal.test.ts`、`src/lib/chaos-events.ts`、`src/lib/chaos-events.test.ts`、
   `src/components/chat/JournalPanel.tsx`、`src/lib/relationshipValidator.ts`、`src/lib/characterCard.ts`。
3. **数字必须实测**（`find` / `grep` / `wc` / 静态计数），禁止估算；写数字时注明口径与日期。
4. **完成一项后**：勾选本文件 → 若影响架构则同步 `PROJECT_SUMMARY.md` 的模块地图与规模基线。
5. **上游文件保持原样**：`README.md` / `ROADMAP.md` / `TODO.md` / `OPENMAYHEM.md` / `DOCKER.md` 不动，改动只落在本仓库自有文档。

---

## 8. 验收标准模板与可复用审计脚本

**模板：**
```
现象 / 目标：
落点（真实文件:行）：
修法：
验收标准（可命令行复核的判据）：
回归范围（要重跑的测试 / 要手测的界面）：
```

**对账工具已收进仓库 `tools/audit/`**（**只读**、路径无关、可随时复跑；用法见该目录 `README.md`）：

| 脚本 | 用途 |
|---|---|
| `tools/audit/check_pre_commit.py` | **提交前闸门**：幽灵路径 + 敏感串 + 单文件体积（>100 MB 阻断） |
| `tools/audit/check_doc_refs.py` | 文档引用的每个路径是否真实存在（黑名单与「计划路径」自动放行） |
| `tools/audit/scan_cjk_pollution.py` | 中文文案英文残渣 + **GBK 误码/乱码**扫描（**建议纳入 CI**） |
| `tools/audit/count_scale.py` | 规模基线：文件 / 行数 / 测试用例 / 事件池 / 模块数 |
| `tools/audit/check_gaps.py` | **缺口复核**：P1/P2 各项机制是否已实现（OK / GAP） |
| `tools/audit/dump_open_items.py` | TODO.md / ROADMAP.md 未勾项 + 所属分组 |
| `tools/audit/scan_checkboxes.py` | 全库未勾选复选框分布统计 |
| `tools/audit/README.md` | 用法 / 退出码约定 / 维护约定 |

---

## 9. 开发规范（继承旧版，已纠错）

### Git 提交格式
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type：** `feat` 新功能 ｜ `fix` Bug 修复 ｜ `refactor` 重构 ｜ `test` 测试 ｜ `docs` 文档 ｜ `chore` 杂务

**示例（已改为真实路径）：**
```
feat(realism): add flashbulb-memory detection for journal entries

- Score emotion intensity from the turn text
- Auto-tag entries above the threshold
- Show the marker in the "她的日记" section of RelationshipPanel

Refs: DEVELOPMENT_PLAN.md P1-1
```

### 代码审查清单
· **类型安全**：`npm run typecheck`（前端 / 服务端 / 测试三套 tsconfig）全过，不新增 `any`
· **测试**：新功能补单测，`npm test` 全绿
· ⚠️ 旧版此处的"无 ESLint 警告"**已失效**：本仓库**没有 ESLint 依赖**（`package.json` 0 命中），静态判据改为 `typecheck` + `test`
· **性能**：大数据集（>500 条消息 / >1000 条记忆）不劣化
· **移动端真机**：iOS Safari / Android Chrome（PWA 场景）
· **文档**：若改动影响架构，同步 `PROJECT_SUMMARY.md`（纪律见 §7）

---

## 10. 参考资源

### 竞品分析
- [SillyTavern](https://github.com/SillyTavern/SillyTavern) — 功能最全的 RP 客户端
- [Front Porch AI](https://github.com/linux4life1/front-porch-AI) — Flutter 跨平台方案（本仓库机制吸收来源）
- [Backyard AI](https://backyard.ai/) — 已关停，参考其设计理念

### 技术文档
- [Character Card Spec v2](https://github.com/malfoyslastname/character-card-spec-v2)
- [Zustand](https://zustand-demo.pmnd.rs/) ｜ [Vite PWA](https://vite-pwa-org.netlify.app/)
- `node:sqlite`（Node 22+ 内建，需 `--experimental-sqlite`）
- ⚠️ 旧版此处的 **Radix UI Primitives 已移除**——本项目 UI 基础件为**自研**（`src/components/ui/` 24 个），未使用 Radix

### 模型选型（厂商中立口径）
- **主对话**：中文 RP 表现好的中大型模型；本机实测记录见 `docs/ABSORPTION-PLAN.md`
- **判定 / 轻量任务**：小模型（成本优先）
- **本地**：KoboldCpp + GGUF（项目原生支持 Kobold 后端）

---

## 11. 贡献指南（继承旧版）

1. Fork 仓库 → 2. 建功能分支（`git checkout -b feat/amazing-feature`）→ 3. 提交 → 4. 推送 → 5. 开 Pull Request

**优先接受：** Bug 修复 ｜ 性能优化 ｜ 测试补充 ｜ 文档改进
**暂不接受：** 大规模架构重构（须先开 Issue 讨论）｜ 未经讨论的新功能

---

**文档维护：** 本项目维护者（AI 辅助）
**最后更新：** 2026-09-13
**计划版本：** v3.0（对账刷新版）

