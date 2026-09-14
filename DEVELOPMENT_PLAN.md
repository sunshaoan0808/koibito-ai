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
| 🔢 修正数字 | 测试"800+"→ **116 文件 / ~2,156 用例**（P1-1 交付后为 **117 文件 / 2,170 用例**；P1-2 交付后为 **117 文件 / 2,191 用例**；P1-3 交付后为 **117 文件 / 2,192 用例**；P2 批次交付后为 **125 文件 / 2,431 用例**；P2-6 扶正卡补丁后为 **125 文件 / 2,432 用例**；P1-4 桥 + P2-5 代码侧后为 **127 文件 / 2,451 用例**；有声书（P2-3 后半）后为 **128 文件 / 2,469 用例**；Tier 6 前两项后为 **131 文件 / 2,489 用例**；P4 §12 首项（分支树）后为 **132 文件 / 2,501 用例**；§12 自研三项 ＋ World Info 全页 i18n 后为 **144 文件 / 2,644 用例**（2026-09-14 全量实测））；Chaos 事件"24 个"→ **152 条**（P1-3 扩容后实测，`tools/audit/count_chaos_pool.py`）；i18n 从"待做"→ **已完成**；`strict: true` 从"待开启"→ **已开启** |
| ✅ 删除已解决项 | 移动端适配（`RelationshipPanel` 已响应式）、日记虚拟滚动（无该组件，前提不成立）、STT（`voice/stt.ts`+`vad.ts`+`dictation.ts` 已实现）、类型严格化（已开） |
| ➕ 新增真实缺口 | 来自 2026-09-13 代码对账的 P1/P2 项（成长回写、时间流逝、Chaos 扩容、TTS 通道、Clock In、小时天气、EPUB、斜杠命令、聊天内生图、动态 NPC、记忆去重、BYAF/JSONL） |
| ✅ 落地 | 旧版唯一真实待办 `exportWithGrowth()` 成长回写 → **P1-1 已完成**（`19f1111`）；自动时间流逝 → **P1-2 已完成**（`b607209`）；Chaos 事件池扩容 → **P1-3 已完成**（`38bb4c6`）；P2 批次（P2-1~P2-4、P2-6~P2-8）→ **已完成**（`fe21877`），**P2-5 已打通 2026-09-14（`/image` ✅；即时场景快照 ✅ 已实现并 UI 实测；图生图 Edit 因上游账号池缺编辑能力阻塞）**；**P2-3 有声书半边已交付**（P1-4 通道打通后接上，单文件 MP3） |

> **旧版 `DEVELOPMENT_PLAN.md` 的 Phase 1 里有 2 项"已完成但被写成未完成"**（移动端、虚拟滚动），照旧版干活会重复劳动——本版已清除。

---

## 1. 基线

见 `PROJECT_SUMMARY.md` §3（385 文件 / 67,428 行 / 116 测试文件 / ~2,156 用例 / 28 约会模块）。

---

## 2. 冻结清单（**已完成，禁止重做**）

**上游已完成的大件**（详见 `ROADMAP.md` #1–#137，`TODO.md` Tier 1 / 2 / 3a 全部已勾）：
聊天核心与 prompt 引擎、流式、自动滚动、消息编辑/重生成/分叉、世界书/世界卡 + 触发规则、记忆（`worldinfo/facts.ts`，有预算上限）、角色卡 V2/V3 + 资产、角色生成、图库、表达式集、语音朗读（`voice/ttsProviders.ts`）、STT（`voice/stt.ts`）、世界/日历/精力、日计划循环、约会系统 28 模块、玩法模板 3 个、切面模式（VN/Sliced）、备份与数据管理、命令面板、模型兼容探测。

**本仓库相对上游新增**（`PROJECT_SUMMARY.md` §5）：口令鉴权 + 服务端 LLM 代理、PWA、局域网多设备、i18n（zh 218 条）、系统提示词中文化、Sumire 卡汉化、FP 机制吸收 11 项。

> ⚠️ 不要再"实现"以下已被误报为待办的东西：**i18n**、**STT**、**移动端响应式**、**`strict: true`**、**日记物理引擎**（在 `realism/engine.ts:440–527`）、**命运轮盘**（152 条已在 `:312–471`）、**关系判定器**（`dating/relationshipAssist.ts`）。

---

## 3. 任务清单

### P0 — 纠偏（≈0.5 天，**先做**）

| ID | 任务 | 落点 | 验收标准 | 估量 |
|---|---|---|---|---|
| P0-1 ✅(`11a4269`) | 修 3 处中文文案英文残渣 | `src/lib/realism/engine.ts:321`（`accidentally`）、`:323`（`minimum 奖`）、`:524`（`soft 一瞬`） | `grep -n "accidentally\|minimum 奖\|soft 一瞬" src/lib/realism/engine.ts` 无命中；`npm test` 全绿 | 10 分钟 |
| P0-2 ✅(`11a4269`) | 同步过期文件头注释 | `server/llmProxy.ts:1–20` 仍写"Sessions live in memory — restarting the server logs everyone out"，实际 `:54–56` 已是 HMAC 确定性 token（重启不掉登录） | 注释与实现一致；无功能改动 | 10 分钟 |
| P0-3 ✅(2026-09-13 复核) | 文档纪律落地：本文件 + `PROJECT_SUMMARY.md` 成为权威源，其余文档不再各自维护待办 | 仓库根 `*.md`：`PROJECT_SUMMARY.md` 头部已声明"项目现状快照"定位并指向本文件（待办/排期）+ `docs/ABSORPTION-PLAN.md`（吸收进度）；`ROADMAP.md` / `TODO.md` 作为上游原文**只读**，不在其中新建待办 | 幽灵路径黑名单（§7-2）在文档中 **0 命中**：`python3 tools/audit/check_pre_commit.py` → "幽灵引用 0 处…结论：可以提交"；同一闸门扫本轮改动文件敏感串 0、单文件体积 0 超限 | 已交付 |
| P0-4 ✅(`11a4269`) | **修源码注释乱码**（GBK/UTF-8 误码）：英文注释里的破折号 `—` 被写成 `鈥?` | `src/components/chat/MessageBubble.tsx`（17 行）、`src/components/chat/ChatsPanel.tsx`（13 行） | `python3 tools/audit/scan_cjk_pollution.py` 的 MOJIBAKE 计数 = 0；`npm test` 全绿；diff 仅限注释 | 30 分钟 |

### P1 — 核心价值（≈2 周）

| ID | 任务 | 落点 / 地基 | 验收标准 | 估量 |
|---|---|---|---|---|
| **P1-1 ✅(`19f1111`)** | **成长回写角色卡（AI Enhance）**：把养出来的年轮/关系/心结烘焙进卡，导出即可带走 | 已落地 `src/lib/characters/exportWithGrowth.ts`（纯函数 `buildGrowthSnapshot` 等 + `loadGrowthSnapshot` 取数层）；`cardSpec.ts` 的 `extensions` 透传（:286 / :323 / :340）承接快照；年轮数据来自 `realism/engine.ts` | 导出 JSON 含 `extensions.rp_growth`（年轮/日记/关系阶段/心结/关键记忆）；重新导入后 `readGrowth` 可回读；**14 个单测**；导出 UI 有开关（默认关）+ 规模预览 | 已交付 |
| **P1-2 ✅(`b607209`)** | **自动时间流逝**：按一轮叙事时长推导推进时段，日历/精力/日记时间戳联动；OOC 可跳时 | 已落地 `src/lib/world/calendar.ts`（`deriveElapsedPhases` / `reasonedAdvance` / `MAX_DERIVED_PHASES` / `MAX_DERIVED_DAYS` + `detectNarratedPhaseMatch` 拆出以复用命中位置）；挂点 `useChatSession.ts` 回合发送处（紧跟原有 per-chat `scene.timePhase` 覆盖块）；开关 `useSettingsStore.autoAdvanceTime`（默认开，Settings → Roleplay → World clock）；顺带修复 `nextRealism` 把 `journal` 整个丢掉、日记从不写入的缺陷（`realism/engine.ts`），日记条目新增 `atDay`/`atPhase` 世界钟戳记 | 每回合推进 0~3 时段且可解释（`reasonedAdvance().note` 进 toast）；日历/精力/日记三者一致（精力由 `getEnergyRemaining(day, phaseIndex)` 从钟派生，戳记取发送时新读的钟）；"关闭自动推进"开关；**21 个新单测**覆盖深夜/跨日/跨季跨年/0 段/跳日/同日后指 | 已交付 |
| **P1-3 ✅(`38bb4c6`)** | **Chaos 事件池扩容** 70 → 150+ | 已落地 `src/lib/realism/engine.ts:312–471`（原 60 条 + 10 条 spicy，扩至 **152 条 / 31 条 spicy**）；新审计脚本 `tools/audit/count_chaos_pool.py`（风味配额 + 归一化查重 + `--check` 退出码） | 实测 **152 条 ≥150**；五风味 **27 / 27 / 32 / 34 / 32 各 ≥24**；`spicy` **31 ≥30**；归一化查重 **0 组**；`engine.test.ts` 新增配额守卫用例，全绿 | 已交付 |
| **P1-4 ✅(2026-09-13，本机 edge-tts 桥)** | **TTS 通道打通**（配置侧，非写码） | 前端**已齐备**：`src/lib/voice/cloudTts.ts:43` 打 `/api/llm/v1/audio/speech`、`server/llmProxy.ts` 服务端注入 key、`components/settings/VoiceSettings.tsx` 有真试听按钮（合成+播放，非 ping）、`sentenceChunker` / `ttsProviders` 带测试。**卡点＝本机没有 TTS 上游**（2026-09-13 实测）：`data/config.json` 不存在（`llmBaseUrl`/`llmApiKey` 全空）；`:9527` zen 网关 64 个模型 0 命中；`:8317` CPA 列 0 条；`:8001` 是 grok2api、`:8021` 是 chatgpt-web-voice（非 OpenAI 兼容）；`edge-tts` 未装，5050/5002/9880/18080 全关 | 恢复条件：定下 TTS 上游后配 `data/config.json` 的 `llmBaseUrl`/`llmApiKey`，并把 `rp.ttsModel`/`rp.ttsVoice` 对齐真实音色；设置页试听出声即验收。**已按方案 A 落地（2026-09-13）**：本机新增 `koibito-tts.service`（systemd；`/opt/koibito-tts/server.py`；绑 `172.17.0.1:5050`，仅 docker 桥可达，不暴露公网；`edge-tts` 装于 `/opt/edge-tts-venv`，出口走 `17890` 代理；请求里的模型名忽略、音色名做映射，默认 `zh-CN-XiaoxiaoNeural`）。该桥按**路径分流**：`/v1/audio/speech` 由 edge-tts 合成，其余路径原样透传 zen `:9527`（逐块写回，SSE 不被缓冲），所以它同时是应用的 LLM 出口。部署侧改 `koibito.env` 的 `LLM_BASE_URL` 指向该桥——**必须 `docker compose up -d --force-recreate`；`docker restart` 不重读 env-file**（本次踩到，导致 TTS 仍打 zen）。**实测（经应用自身代理）**：`POST /api/llm/v1/audio/speech` → `200 audio/mpeg` **37584 字节真 MP3**（`MPEG ADTS layer III 24kHz mono`）；`POST /api/llm/v1/chat/completions` 透传 → `200`，正文 `透传已通`。**桥的两个坑**：(1) 最初只认 `Content-Length`，而应用代理用 **chunked** 发体 → 合法请求被判 400，已按 RFC 补 chunked 读体；(2) `LLM_BASE_URL` 压过 `data/config.json`，配文件不生效时先查环境变量。 | 已交付（设置页试听为人工验收项） |

### P2 — 体验与竞争对齐（≈4 周）

| ID | 任务 | 落点 / 地基 | 验收标准 | 估量 |
|---|---|---|---|---|
| **P2-1 ✅(`fe21877`)** | **Clock In 职业班表**：哪几天/几点上下班、跳回合横幅、迟到后果 | 已落地 `src/lib/world/workSchedule.ts`（`workScheduleGuidance` / `clockBoundaryNote` 纯函数；班表数据沿用 `Character.schedule` + `getCurrentActivity` 地基）；接线 `useChatSession.ts` 提示词注入 + 自动推进/手动推进两处边界提示 | 上下班提示进提示词与回合文案；跨周重复、迟到后果、边界日**28 个新单测**全绿；全量 125 文件 / 2,431 用例绿 | 已交付 |
| **P2-2 ✅(`fe21877`)** | **小时级天气引擎**：日内变化、温度曲线、明日预报 | 已落地 `src/lib/world/calendar.ts`（`getPhaseWeather` / `getDayPhaseWeather` / `isWeatherDrift` / `getTomorrowForecast`，+130 行）；`describeWorldMoment`（calendar.ts:296）改用相位天气 + 明日预报，注入提示词的天气串随时段走；`WorldsView` 面板显示相位天气与次日预报 | 同一时段内天气可变、漂移可测（确定性种子，**+212 行单测**）；`npx vitest run src/lib/world` **322 用例绿**；提示词天气串取自相位而非仅日级 | 已交付 |
| **P2-3 ✅(EPUB `fe21877`；有声书 2026-09-13)** | **EPUB 导出 + 有声书（MP3）** | EPUB：已落地 `src/lib/export/epub.ts`（自研 zip 写入器，**零新依赖**）+ `ChatWindow` 工具栏「Export as EPUB」，与 HTML 转写共用 SFX/regex 策略。**有声书半边（P1-4 通道通了才解锁，2026-09-13 落地）**：新增 `src/lib/voice/audiobook.ts` —— `splitSentences` 中英双认切句（**刻意不复用**流式的 `extractCompleteSentences`：那个只为播放设计、会丢掉未终止的尾巴）、`clampSegment` 超长**硬切不截断**（丢字即丢剧情）、`stripId3v2`/`stripId3v1` 剥标签后按 **MPEG 帧直接拼接**成单一 MP3（帧自定界，故拼接即合法流；标签必须剥否则文件中间出现 ID3 反而不合法）、`narrateChapters` 逐句顺序合成（并行会乱序并压垮单账号上游；单句失败**收集跳过**不毁全书，全失败才抛错；支持 abort 与进度回调）；`cloudTts.synthesizeSpeechClip` 复用同一 `/api/llm/v1/audio/speech` 且同样走服务端注入 key；工具栏新增「Export audiobook (MP3)」，按钮带 `done/total` 进度、结束 toast 如实报出跳过段数 | 有声书 **18 个新单测**（切句/不丢字/标签剥离/顺序与进度/单句跳过/空音频算失败/全失败抛错/abort/空稿拒绝）；EPUB 原有 **22 个**（独立 zip 重读器验证 mimetype 首位与 CRC、container.xml、OPF spine/nav/ncx）；全量 **128 文件 / 2,469 用例**绿；CJK 扫描 0 残渣、提交前检查可提交 | 已交付 |
| **P2-4 ✅(`fe21877`)** | **斜杠命令**（`/image` `/skip` `/ooc` `/roll`…） | 已落地 `src/lib/chat/slashCommands.ts`（命令表 + 解析 + 异步 outcome）+ `Composer.tsx` 接线（提示芯片、未注册命令回落普通发送）；`/image` 为占位，指向 P2-5 | `npx vitest run src/lib/chat` **116 用例绿**；与 OOC/分叉不冲突；`/help` 列表在命令面板 | 已交付 |
| **P2-5 ✅ `/image` 已打通 2026-09-14（同行的图生图/快照两项拆出）** | **聊天内图片工作流**：`/image`、图生图 Edit、即时场景快照 | 后端文件**齐备**：`api/{a1111,comfyui,swarmui,novelai,openMayhem}Image.ts` + `createImageBackend.ts`。**代码侧已交付（2026-09-13，本小姐亲落）**：① 新增 `src/lib/api/openaiImages.ts` —— OpenAI 形状 `POST {base}/v1/images/generations`（`b64_json`/`url` 双收，`url` 会取回字节；尺寸吸附到 gpt-image-1 那套 `1024x1536`/`1536x1024`，精确命中不放大），注册进 `ImageBackendId`/`IMAGE_BACKEND_LABELS`/`createImageBackend`，设置页加 `openai-images` 的 Server URL 字段（密钥复用 `imageBackendUsername`，与 novelai 同惯例）；② 新增 `src/lib/image/turnImage.ts` —— `imageBackendBlocker()` 给出**明确"未配置"原因**（未选后端/缺 base URL/缺 key），`generateTurnImage()` 出 `data:` URL，`appendImage()` 追加不覆盖；③ `/image` **真接线**：`Composer` 注入 `onImageCommand` → `ChatWindow.runImageCommand` 生成后读回消息再 `messagesApi.update(id, {images})` 挂到最后一条 char 回复（数据层失效广播自动重取），失败回 error toast 而非静默。**新增 19 用例**（size 吸附 / 请求体 / URL 取回 / 空答案算失败 / 不可达文案 / 未配置不触发请求）。**卡点＝已解除（2026-09-14）**；以下三条第一手保留作历史（其中第三条已被更正）：`useSettingsStore` 默认 `imageBackend:'a1111'` 而 `imageBackendBaseUrl` **空**；7860/8188/7861 全关；`:8001` grok2api 需鉴权但上报 `Invalid API key`（**403**，池子 key 失效）；zen `:9527` 的 `/v1/images/generations` → **401**（64 个模型里只有视觉理解，无生图）；MuseAI 的 `IMAGE_API_KEY`+`cogview-4` 无 base URL 变量（地址编在二进制里，未定位到）**← 已更正 2026-09-14：MuseAI 的真实通道就是本机 grok2api `:8020` + key `museai-image-prod`（drop-in `museai-server.service.d/grok-image.conf`），默认 base URL 在 `museai_tools.rs:274`（`http://127.0.0.1:8020/v1`）** | **已落刀（2026-09-14）**：链路 = 浏览器同源 `/api/llm` → `llmProxy`（`llmBaseUrl + req.url`）→ koibito 出口桥（`/opt/koibito-tts/server.py` v1.2 新增 `POST /v1/images/generations` 分流，**服务端注入** key）→ `127.0.0.1:8020`。实测：桥 200/15.1s（假 key 被忽略）、页面同源 fetch 200/13.3s/258KB（b64 头 `/9j/4QJo` = JPEG）、UI 内 `/image` 出图回显 ✓、公网无 cookie 401。**另两项经 2026-09-14 上游实测分道**：**① 即时场景快照（AI Dungeon "See"）= ✅ 已实现并 UI 实测（2026-09-14）**——真实场景文本走同一管线实测 **200 / 20.5s / 336KB**（b64 头 `/9j/4QVoRXhp` = JPEG）。**落刀**：`turnImage.ts` 增纯函数 `sceneSnapshotPrompt()`（取最新一条 char 回复、去空则继续往前找、加风格前缀、截 900 字；无回复返回 `null` 让调用方说明原因，不做 LLM 二次摘要以免一次点击依赖更慢的模型往返）与 `SNAPSHOT_STYLE_PREFIX`/`SNAPSHOT_SCENE_LIMIT`；`ChatWindow` 增 `runSceneSnapshot()`（复用 `generateTurnImage` → 读回消息 → `appendImage` → `messagesApi.update`，失败 `toastError` 而非静默）+ 工具栏 action（`More actions` 菜单内、`Dynamic cast` 之后，`snapshotting` 忙碌态切 label）。**新增 5 用例**（`turnImage.test` 10 → 15）；`npm run typecheck` 三套 tsc 过、`vitest run` **144 文件 / 2649 用例全过**。**UI 实测**：dev server（5173，自带 `/api` 代理连生产 3001）内点「Snapshot this moment」→ 30s 后 transcript 内 data 图数 1 → 2 且 toast「Snapshot attached to the last reply.」；**失败路径亦实证**：后端配错时 `toastError` 原样回显 `Automatic1111 generation failed (401)`，非静默。**② 图生图 Edit = 上游账号池阻塞**——端点与格式已破译（`POST /v1/images/edits` + **application/json**（非 multipart）+ `image.url` 收 data URL；swagger 里的 `grok-imagine-image-edit` 是错 example，打它 404 `model_not_found`），但 `account_model_capabilities` 里 `upstream_model LIKE '%edit%'` = **0**（池有 7584 个 web 账号，`grok-imagine-image-2.0` 文生图占 2100 个），故三模型打 edits 全 **503 `upstream_unavailable`**（`gateway/image.go:291` 记 `lastCredentialFailure`）→ **非 koibito 缺陷、非格式问题，需补编辑权限账号或等上游放开** | — |
| **P2-6 ✅(`fe21877`)** | **动态客串 NPC**：路人在场景中被识别并入戏 | 已落地 `src/lib/cast/detector.ts`（中英双轨抽取：敬称 / 言语动词 / 前缀昵称 / 拉丁专名，函数词与停用词过滤，扫描窗 8 回合）、`src/lib/cast/promote.ts`（`candidateToCharacterInput` / `withPromotedParticipant` / `promoteCandidate`：**先建角色后入名册**，create 失败零写入）、`src/components/chat/CastCandidatesCard.tsx`（候选面板：扶正 / 忽略，忽略按 chat 持久化）+ `ChatWindow` 工具栏「Dynamic cast」；开关 `useSettingsStore.dynamicCastNpc`（**默认 off**）；提示词行 `strongCandidates` 上限 3。**未碰** `dating/sceneParticipants.ts`（亲密共享态） | **28 个新单测**；点击前**零写入**（用例断言先 create 后 update，create 失败不写聊天）；off 时不跑检测；只有重复出现（≥2 次）的强候选进提示词，上限 3；扶正卡用 `blankCharacterData` 铺底（整卡规格不丢字段） | 已交付 |
| **P2-7 ✅(`fe21877`)** | **记忆去重与反鹦鹉全量** | 已落地 `src/lib/worldinfo/dedupe.ts`（**19 用例**）+ `text/slop.ts` 扩相似度/回声扫描（阈值可配）；接线三处：召回先去重、全量回声护栏、设置页**复读阈值**滑块 0.50~1.00 | `dedupe` 19/19 绿，`slop`/`facts` 全绿；"去重不误删有效记忆"由用例覆盖 | 已交付 |
| **P2-8 ✅(`fe21877`)** | **BYAF 导入 / SillyTavern JSONL 导出** | 已落地 `src/lib/characters/byaf.ts`（zip 中央目录解析 + `DecompressionStream`，零新依赖；archive/扁平卡双形态 + 宏转换）与 `src/lib/export/chatJsonl.ts`；`ChatWindow` 加「Export as SillyTavern JSONL」；顺带修子线缺陷：扁平卡 `{character}` 宏未转换 | **53 个单测**（含 round-trip 无损）；导出 JSONL 的头部/消息形状按 ST 格式断言 | 已交付 |

### P3 — 上游 `TODO.md` 未勾 **23 项**（原文见 `TODO.md`，此处只标位与分组，勿重复复制）

| 分组 | 未勾数 | 行号 | 内容摘要 |
|---|---|---|---|
| Tier 3b 游戏循环 | **2 剩余**（原 4：①实时节奏 ✅、②关系日记 ✅ 2026-09-14 已交付） | L331 / L335 | 群场景嫉妒与竞争（**机制已备且已测、尚无内容使用 jealousy** —— `flag_set` 条件见 `triggers.ts:19` + `intimacyStages.ts:131`；详见 **`PLAN-jealousy-mechanics.md`**）、路线/战役（11 天弧，零代码） |
| Tier 4 竞争对齐与创作 | **6 剩余**（原 9：存档槽 ✅、分支树 ✅、聊天内快照 ✅ 均 2026-09-14 核实已交付） | L344 / L349 / L352 / L361 / L370（另 1 项"组合式角色创建"行号待核） | RisuAI 式内联素材 `{{image::name}}`（零命中）、Do/Say/Narrate 输入模式（零命中）、场景模板填空（零命中）、聊天文件夹/标签（**全绿地：`Chat` 无 tags、`ChatsPanel` 零命中、服务端无白名单** → MVP 边界待定：**`PLAN-chat-tags.md`**）、用户脚本（Output hook 零命中，**需先定协议边界**） |
| Tier 5 信息架构 | **4/4 ✅ 全部交付**（设置搜索 ✅、拆分 Generation 页 ✅、级联来源可视化 ✅、交叉链接 ✅ 2026-09-14） | ~~L382~~ / ~~L395~~ / ~~L397~~ / ~~L400~~ | ~~拆分 Generation 设置页~~、~~设置搜索~~、~~级联来源可视化（`InheritanceBadge`，三面全接）~~、~~更多交叉链接（4/4 ✅，见 TODO L431）~~ |
| Tier 6（**2/6 已交付，后 4 项经实测重估**） | 6 | ⚠️ 原行号映射**已失效**（`ROADMAP.md`/`TODO.md` 中查无此 6 项，本表该行是唯一记录） | **✅ 已交付 2026-09-13（`82860bc`）**：① **VN 半透明日志按说话人配色** —— 新增 `src/lib/text/speakerTint.ts`（确定性哈希→固定色相：重载/换机同色；盒子用 inset shadow 画左侧色条，不引发布局位移；**仅 `VNStage` 传 `tintSpeakers`，经典视图零改动**）；② **画廊「音乐室」tab** —— 新增 `src/lib/audio/trackLibrary.ts`（把各世界 `music` 映射整理成可试听列表：默认曲/情绪曲/自定义曲排序 + 自动/手动标注）+ `GalleryView` 双 tab（CG art / Music room，按世界分组 + 内嵌 `<audio>` 试听）+ `absoluteUrl` 从 `BgmPlayer` 提为共享纯函数（DRY，base 可注入）。**⚠️ 余 4 项非"小打磨"**：`WorldCard` 组件**不存在**、世界类型**无开场字段**、画廊原本**没有 tab 结构**、Persona 相容加成**无现成模块**——各自需先设计（已从本行拆出，见下方"待立项"） |

#### 待立项（自 Tier 6 拆出，2026-09-13 实测后重估）

原 Tier 6 把 6 项一并归为"小打磨"，逐项对代码实测后：**2 项确为小活（已交付 `82860bc`）**，另 **4 项的前提在代码里并不成立**，须先设计再动——否则就是 blind build。

| 项 | 实测前提（2026-09-13） | 需先定的设计问题 |
|---|---|---|
| 输入聚焦时场景变暗 | VN 舞台与 Composer 分属两层，**无现成"聚焦"通道** | 变暗的是立绘/背景还是整舞台？聚焦期间 BGM／打字机是否照常？移动端是否同样处理 |
| `WorldCard` 开场字段 | **`WorldCard` 组件不存在**（仅有 `WorldsView`／`WorldTemplateGallery`／`TriggerRows`）；`WorldCard` 类型里**无开场字段** | 开场是"世界的首条场景提示"还是"进入聊天自动注入的第一段"？存哪（类型新字段 or 世界模板）？与既有 `SceneTag`／开场白如何不重叠 |
| Persona 相容加成 | **无现成模块**（全仓无 persona 相容／加成代码） | 判定维度（性格标签？关系类型？）+ 数值落点（好感初值？成长倍率？）+ 与既有 `affection` 曲线如何兼容 |
| 表达集生成入口前置 | 生成器已存在，但**"前置"到哪没有定义** | 角色编辑器页首？角色卡菜单？聊天内快捷键？ |

### P4 — 上游 `ROADMAP.md` §12–15 未勾 **14 项**（原文见 `ROADMAP.md`）

| 分组 | 未勾数 | 行号 | 处理建议 |
|---|---|---|---|
| §12 平台级（**6/6 全交付**） | 6 | L3086–L3112 | **✅ 已全部交付**：**分支树视图**（2026-09-13，`src/lib/chat/branchTree.ts` 纯函数 + `BranchTreeView` + `Sidebar` 导航项）＋ **自研三项**（2026-09-14 全部落地，FP 无先例、本仓自研）：**城镇信息流** `src/lib/world/townFeed.ts`（三期全落 + `TownFeedView` 上站）、**知识迷雾** `src/lib/knowledge/claims.ts`（三期 + `WorldInfoView` 的「谁知道」编辑器维度）、**插件 API** `src/lib/plugins/`（三期全落：注册表 → `buildPrompt`/`/命令` → 侧栏面板）。**余 2 项口径已定不另立**：**存档槽** → 照抄 FP「per-session 引擎状态 + **fork 复制而非移动**」（`docs/ABSORPTION-PLAN.md` §12 表，快照边界不必再议）；**NPC 间后台模拟** → FP 的正解是**群聊导演模式**且本仓已有，先盘 `autoAdvance` 实覆盖、勿重造。设计稿与分期验收：`docs/design/README.md` |
| §13 引导 | 1 | L3236 | **✅ 实测：代码里已完整存在（上游漏勾）** —— `settings/SamplingControls.tsx` 顶部「Plain chat vs. dating sim」整段就是该项要的说明：关系追踪／难度／亲密细节属 dating-sim 层、任务自动检测仅在设了 Objective 时有意义、VN 模式是呈现选择而非机制、世界模板已按玩法预置每聊天默认值。逐条核对覆盖度（`RelationshipDifficulty`／亲密场景确在 `dating/relationshipAssist.ts`、`dating/intimacyScene.ts` 存在）→ **无缺口** | 已交付 |
| §14 World Info 深度 | 1 | L3345 | **✅ 实测：无剩余差距（上游漏勾父项）** —— 项下 4 个子项**全部已划删除线**：sticky/cooldown/delay（`Lorebook.sourceKey` + `Chat.worldInfoState`）、聊天深度注入（`LorebookEntry.position='at_depth'` + 泛化的注入 pass）、全局书绑定 UI（`worldinfo/scope.ts` + `BookScopePicker`）、加权 inclusion group（加权随机，未设权重的书行为不变）；项内已无未划线子项 | 差距清单结论：**无剩余** |
| §15 AI Dungeon 想法 | 6 | L3666–L3767 | ⚠️ 其中 4 项与 P3 Tier 4 重复（用户脚本、Do/Say/Narrate、场景模板、聊天内快照）→ **以 P3 为唯一执行口径**。**P4 独立项实为 8 项，其中 3 项已闭**（§12 分支树已交付；§13 实测代码已存在；§14 实测无剩余差距），**§12 已 6/6 全交付**（分支树 2026-09-13；自研三项 2026-09-14） |

### P5 — 分发与打包（未排期）

| ID | 任务 | 备注 |
|---|---|---|
| P5-1 | Electron 打包（桌面版） | 依赖 PWA 已就绪 |
| P5-2 | Android APK（Capacitor） | 手机目前靠 PWA |
| P5-3 ✅(2026-09-13) | VPS 部署脚本（一键） | 新增 `deploy/vps-deploy.sh`：幂等（预检 docker+compose → 首次生成 `.env` 与随机口令，权限 600，**从不覆盖已有 .env** → `compose up -d --build`，改配置走 `--recreate`）→ **验收两件事**：`/login.html` 返回 200，且口令闸门必须"错=401 / 对=200"，任一不满足即 `exit 1` 拒绝宣告成功。`docker-compose.yml` 把 `RP_ALLOWED_ORIGINS`/`RP_AUTH_PASSCODE`/`LLM_BASE_URL`/`LLM_API_KEY` 以 `${VAR:-}` 贯通（**变量名取自 `server/llmProxy.ts` 实读，非臆造**）；`DOCKER.md` 增「One command on a VPS」+ 环境变量表补齐 4 项 + 纠正"API 无鉴权"的旧表述 + `docker restart` 不重读 env 的提醒 | **实跑验证**（桩 docker + 本机已上线实例）：`.env` 生成正确（口令随机、权限 600、origin 由 `--domain` 推出为 `https://rp.example.com`）、UI 200 判定通过、**口令与在线实例不匹配时脚本 exit 1 拒绝报成功**（证明闸门检查真的会咬人）；`bash -n` 通过、`--help` 正常、非法参数退出码 2 | 已交付 |
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
| 已交付 | P4 §12 平台级 **6/6**（分支树 + 城镇信息流/知识迷雾/插件 API 三项自研；存档槽与 NPC 互动口径已定） | — |

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
| `tools/audit/count_chaos_pool.py` | 命运轮盘逐风味配额 + 归一化查重 + `--check` 验收（P1-3 口径） |
| `tools/audit/check_gaps.py` | **缺口复核**：P1/P2 各项机制是否已实现，**三档口径**（OK / **WIRED＝代码已接线但验收缺外部上游** / GAP），底部印口径说明防误读 |
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

